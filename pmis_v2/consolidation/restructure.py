"""
Restructure pass — LLM regen of red-flagged nodes (audit-fix Item 7).

Integrated with production's existing Phase 3 value_score infrastructure:
  - Reads production's `feedback` table for polarity/strength history
  - Uses the materialized `value_feedback` column as threshold signal
  - Respects `is_user_edited` strictly (user authorship beats LLM regen)
  - Honors the existing `value_feedback_redflag` hyperparameter (default -0.3)

Does NOT replace `_pass_wiki_regen` (cache invalidation) — they are
orthogonal. This pass rewrites node *content* when feedback has turned
negative enough that the materialized value_feedback dropped below the
red-flag threshold.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

import httpx

from core.surprise import compute_raw_surprise

logger = logging.getLogger("pmis.restructure")

# Triage decision shape: either a string ("content") meaning "fall through to
# LLM rewrite" or a tuple like ("merge", target_id) / ("reparent", new_id,
# old_id) meaning the issue is structural and can be fixed without an LLM.
TriageDecision = Union[str, Tuple]


class Restructurer:
    def __init__(self, db, hyperparams: Dict[str, Any], embedder: Any = None):
        self.db = db
        self.hp = hyperparams
        self._embedder = embedder

    # -----------------------------------------------------------------
    # Public entry points
    # -----------------------------------------------------------------

    def enqueue_red_flags(self) -> Dict[str, int]:
        """
        Scan memory_nodes for red-flagged nodes (value_feedback below threshold)
        and enqueue them for regen. Used by the nightly pass to turn passive
        feedback into active rewriting.
        """
        redflag_threshold = float(self.hp.get("value_feedback_redflag", -0.3))
        enqueued = 0
        with self.db._connect() as conn:
            rows = conn.execute("""
                SELECT id, level FROM memory_nodes
                WHERE is_deleted = 0
                  AND COALESCE(is_user_edited, 0) = 0
                  AND COALESCE(value_feedback, 0) < ?
            """, (redflag_threshold,)).fetchall()
            for r in rows:
                scope = "context" if r["level"] == "CTX" else "anchor"
                # Dedup: skip if already queued/processing
                existing = conn.execute("""
                    SELECT id FROM restructure_queue
                    WHERE node_id = ? AND status IN ('queued', 'processing')
                """, (r["id"],)).fetchone()
                if existing:
                    continue
                conn.execute("""
                    INSERT INTO restructure_queue (node_id, scope, reason)
                    VALUES (?, ?, ?)
                """, (r["id"], scope, f"value_feedback<{redflag_threshold}"))
                enqueued += 1
        return {"enqueued": enqueued, "redflag_threshold": redflag_threshold}

    def run(self, max_jobs: int = 50) -> List[Dict[str, Any]]:
        """Drain the queue. Returns list of action dicts."""
        actions: List[Dict[str, Any]] = []
        with self.db._connect() as conn:
            jobs = conn.execute("""
                SELECT id, node_id, scope, reason, queued_at
                FROM restructure_queue
                WHERE status = 'queued'
                ORDER BY queued_at ASC LIMIT ?
            """, (max_jobs,)).fetchall()
            jobs = [dict(j) for j in jobs]

        for job in jobs:
            actions.append(self._process_job(job))
        return actions

    def regen_now(self, node_id: str, scope: Optional[str] = None,
                  reason: str = "manual_override", force: bool = False) -> Dict[str, Any]:
        """Manual trigger: regen a single node immediately, bypass queue."""
        node = self.db.get_node(node_id)
        if not node:
            return {"action": "restructure_failed", "node_id": node_id,
                    "error": "node not found"}
        scope = scope or ("context" if node.get("level") == "CTX" else "anchor")
        synthetic_job = {
            "id": None, "node_id": node_id, "scope": scope,
            "reason": reason, "queued_at": datetime.now().isoformat(),
        }
        return self._process_job(synthetic_job, force=force)

    # -----------------------------------------------------------------
    # Per-job processing
    # -----------------------------------------------------------------

    def _process_job(self, job: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
        node_id = job["node_id"]
        scope = job["scope"]
        queue_id = job.get("id")

        node = self.db.get_node(node_id)
        if not node:
            self._mark_processed(queue_id, "skipped")
            return {"action": "restructure_skipped", "node_id": node_id,
                    "reason": "node_missing"}

        if node.get("is_user_edited") and not force:
            self._mark_processed(queue_id, "skipped")
            return {"action": "restructure_skipped", "node_id": node_id,
                    "reason": "is_user_edited", "scope": scope}
        if node.get("is_deleted"):
            self._mark_processed(queue_id, "skipped")
            return {"action": "restructure_skipped", "node_id": node_id,
                    "reason": "node_deleted"}

        # Metadata triage: can this be fixed structurally without an LLM?
        # Only applies to anchors — contexts have no parents to re-home to.
        decision = self._triage(node, scope)
        if isinstance(decision, tuple):
            kind = decision[0]
            if kind == "merge":
                _, target_id = decision
                return self._handle_merge(
                    node, target_id, queue_id, job.get("reason", "")
                )
            if kind == "reparent":
                _, new_parent_id, old_parent_id = decision
                return self._handle_reparent(
                    node, new_parent_id, old_parent_id, queue_id,
                    job.get("reason", ""),
                )

        # Fall through to LLM rewrite (content-quality complaint).
        before = node.get("content") or ""
        prompt_ctx = self._build_context(node, scope)
        prompt = self._anchor_prompt(prompt_ctx) if scope == "anchor" \
                 else self._context_prompt(prompt_ctx)

        try:
            new_content = self._call_llm(prompt)
        except Exception as e:
            self._mark_processed(queue_id, "skipped")
            return {"action": "restructure_failed", "node_id": node_id,
                    "scope": scope, "error": str(e)[:200]}

        new_content = self._sanitize(new_content)
        if not new_content or new_content == before:
            self._mark_processed(queue_id, "skipped")
            return {"action": "restructure_skipped", "node_id": node_id,
                    "reason": "empty_or_unchanged"}

        self._apply_regen(node_id, before, new_content, scope, job.get("reason", ""))
        self._mark_processed(queue_id, "done")
        return {
            "action": "restructure",
            "node_id": node_id,
            "scope": scope,
            "trigger_reason": job.get("reason", ""),
            "before_chars": len(before),
            "after_chars": len(new_content),
            "applied_by": self._llm_label(),
        }

    # -----------------------------------------------------------------
    # Triage: structural fixes that don't need an LLM
    # -----------------------------------------------------------------

    def _triage(self, node: Dict[str, Any], scope: str) -> TriageDecision:
        """Decide whether this node's negative feedback is a structural issue
        (merge/reparent) or a content-quality issue (LLM rewrite).

        Returns:
          ("merge", winner_sibling_id)               — near-duplicate of sibling
          ("reparent", new_parent_id, old_parent_id) — another CTX is a better fit
          "content"                                  — fall through to LLM rewrite
        """
        if scope != "anchor":
            return "content"

        embs = self.db.get_embeddings(node["id"])
        node_emb = embs.get("euclidean")
        if node_emb is None:
            return "content"

        parents = self.db.get_parents(node["id"])
        parent = parents[0] if parents else None
        if parent is None:
            return "content"

        # 1. Near-duplicate of a sibling? Prefer merge — cheapest fix.
        dup_thresh = float(self.hp.get("restructure_duplicate_threshold", 0.08))
        winner, dup_dist = self._find_nearest_sibling(
            node_id=node["id"], parent_id=parent["id"], query_emb=node_emb,
        )
        if winner is not None and dup_dist <= dup_thresh:
            return ("merge", winner["id"])

        # 2. Wrong parent? Check if another CTX is substantially closer.
        parent_embs = self.db.get_embeddings(parent["id"])
        parent_emb = parent_embs.get("euclidean")
        if parent_emb is not None:
            current_dist = compute_raw_surprise(node_emb, parent_emb)
            best_other, best_other_dist = self._find_best_other_context(
                node_emb, exclude_id=parent["id"],
            )
            gain_thresh = float(self.hp.get("restructure_reparent_gain", 0.15))
            if best_other is not None and (current_dist - best_other_dist) >= gain_thresh:
                return ("reparent", best_other["id"], parent["id"])

        return "content"

    def _find_nearest_sibling(
        self, *, node_id: str, parent_id: str, query_emb,
    ) -> Tuple[Optional[Dict[str, Any]], float]:
        best: Optional[Dict[str, Any]] = None
        best_dist = float("inf")
        for sib in self.db.get_children(parent_id):
            if sib["id"] == node_id:
                continue
            if sib.get("is_deleted"):
                continue
            sib_embs = self.db.get_embeddings(sib["id"])
            sib_emb = sib_embs.get("euclidean")
            if sib_emb is None:
                continue
            dist = compute_raw_surprise(query_emb, sib_emb)
            if dist < best_dist:
                best_dist = dist
                best = sib
        return best, best_dist

    def _find_best_other_context(
        self, query_emb, *, exclude_id: str,
    ) -> Tuple[Optional[Dict[str, Any]], float]:
        best: Optional[Dict[str, Any]] = None
        best_dist = float("inf")
        for ctx in self.db.get_nodes_by_level("CTX"):
            if ctx["id"] == exclude_id or ctx.get("is_deleted"):
                continue
            ctx_embs = self.db.get_embeddings(ctx["id"])
            ctx_emb = ctx_embs.get("euclidean")
            if ctx_emb is None:
                continue
            dist = compute_raw_surprise(query_emb, ctx_emb)
            if dist < best_dist:
                best_dist = dist
                best = ctx
        return best, best_dist

    def _handle_merge(
        self, node: Dict[str, Any], target_id: str,
        queue_id: Optional[int], trigger_reason: str,
    ) -> Dict[str, Any]:
        """Absorb node into target sibling, then soft-delete node.
        Reuses db.merge_into_parent which does exactly this (the "parent"
        label is a misnomer — it just appends content + soft-deletes)."""
        self.db.merge_into_parent(child_id=node["id"], parent_id=target_id)
        self._mark_processed(queue_id, "done")
        return {
            "action": "restructure_merge",
            "node_id": node["id"],
            "merged_into": target_id,
            "trigger_reason": trigger_reason,
            "applied_by": "triage_merge",
        }

    def _handle_reparent(
        self, node: Dict[str, Any], new_parent_id: str, old_parent_id: str,
        queue_id: Optional[int], trigger_reason: str,
    ) -> Dict[str, Any]:
        """Detach from old parent, attach to new parent. No LLM; structural only."""
        with self.db._connect() as conn:
            # Drop old child_of relation(s).
            conn.execute(
                "DELETE FROM relations "
                "WHERE source_id = ? AND target_id = ? AND relation_type = 'child_of'",
                (node["id"], old_parent_id),
            )
            # Prune old parent from parent_ids array.
            row = conn.execute(
                "SELECT parent_ids FROM memory_nodes WHERE id = ?", (node["id"],)
            ).fetchone()
            if row:
                try:
                    parents = json.loads(row["parent_ids"] or "[]")
                except (TypeError, ValueError):
                    parents = []
                parents = [p for p in parents if p != old_parent_id]
                conn.execute(
                    "UPDATE memory_nodes SET parent_ids = ?, last_modified = datetime('now') "
                    "WHERE id = ?",
                    (json.dumps(parents), node["id"]),
                )

        # Derive tree_id from any existing child_of relation on the new parent
        # so the re-homed node joins the right tree.
        tree_id = "default"
        with self.db._connect() as conn:
            row = conn.execute(
                "SELECT tree_id FROM relations WHERE target_id = ? "
                "AND relation_type = 'child_of' LIMIT 1",
                (new_parent_id,),
            ).fetchone()
            if row and row["tree_id"]:
                tree_id = row["tree_id"]

        self.db.attach_to_parent(node["id"], new_parent_id, tree_id=tree_id)
        # Refresh the old parent's stats too — it lost a child.
        try:
            self.db._refresh_context_stats(old_parent_id)
        except Exception:
            pass
        self._mark_processed(queue_id, "done")
        return {
            "action": "restructure_reparent",
            "node_id": node["id"],
            "old_parent_id": old_parent_id,
            "new_parent_id": new_parent_id,
            "trigger_reason": trigger_reason,
            "applied_by": "triage_reparent",
        }

    # -----------------------------------------------------------------
    # Prompt context + assembly
    # -----------------------------------------------------------------

    def _build_context(self, node: Dict[str, Any], scope: str) -> Dict[str, Any]:
        """Gather parent + siblings / children + recent feedback for prompt."""
        if scope == "anchor":
            parents = self.db.get_parents(node["id"])
            parent = parents[0] if parents else None
            siblings: List[Dict[str, Any]] = []
            if parent:
                for c in self.db.get_children(parent["id"]):
                    if c["id"] != node["id"]:
                        siblings.append(c)
            return {
                "node": node, "parent": parent,
                "siblings": siblings[:6],
                "recent_feedback": self._recent_feedback(node["id"], 5),
            }
        # context
        children = self.db.get_children(node["id"])
        return {
            "node": node, "children": children[:12],
            "recent_feedback": self._recent_feedback(node["id"], 5),
        }

    def _recent_feedback(self, node_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        with self.db._connect() as conn:
            rows = conn.execute("""
                SELECT polarity, content, source, strength, timestamp
                FROM feedback
                WHERE node_id = ?
                ORDER BY timestamp DESC LIMIT ?
            """, (node_id, limit)).fetchall()
            return [dict(r) for r in rows]

    @staticmethod
    def _format_feedback(fb: List[Dict[str, Any]]) -> str:
        if not fb:
            return "  (no recent feedback)"
        lines = []
        for i, f in enumerate(fb, 1):
            content = (f.get("content") or "").replace("\n", " ")[:160]
            pol = f.get("polarity", "")
            ts = (f.get("timestamp") or "")[:16]
            lines.append(f"  {i}. [{ts}] {pol}: {content}")
        return "\n".join(lines)

    def _anchor_prompt(self, ctx: Dict[str, Any]) -> str:
        anchor = ctx["node"]
        parent = ctx["parent"]
        siblings = ctx["siblings"]
        before = anchor.get("content") or ""

        sib_block = "  (none)" if not siblings else "\n".join(
            f"  {i}. {(s.get('content') or '').strip()[:200]}"
            for i, s in enumerate(siblings, 1)
        )
        parent_line = (parent.get("content", "")[:300]
                       if parent else "(orphan — no parent context)")

        return (
            "You are rewriting a single memory anchor that has received sustained negative feedback.\n\n"
            "PARENT CONTEXT:\n"
            f"  {parent_line}\n\n"
            "SIBLING ANCHORS (for tone + scope reference):\n"
            f"{sib_block}\n\n"
            "CURRENT ANCHOR CONTENT (the one being replaced):\n"
            f"  {before}\n\n"
            "RECENT FEEDBACK ON THIS ANCHOR (most recent first):\n"
            f"{self._format_feedback(ctx['recent_feedback'])}\n\n"
            "RULES:\n"
            "- Output ONLY the new anchor text. No commentary, no headers, no quotes.\n"
            "- 1-3 sentences. Atomic, reusable insight.\n"
            "- Plain English only. Do NOT invent reference codes "
            "(e.g. no 'PM-25', 'MEM-3', 'CTX-7', 'ANC-12').\n"
            "- Address what the negative feedback suggests is wrong.\n"
            "- Stay in the topic scope of the parent context.\n\n"
            "NEW ANCHOR CONTENT:"
        )

    def _context_prompt(self, ctx: Dict[str, Any]) -> str:
        node = ctx["node"]
        children = ctx["children"]
        before = node.get("content") or ""

        ch_block = "  (no child anchors)" if not children else "\n".join(
            f"  {i}. {(c.get('content') or '').strip()[:200]}"
            for i, c in enumerate(children, 1)
        )

        return (
            "You are rewriting the SUMMARY TEXT of a memory context that has received "
            "sustained negative feedback.\n\n"
            "CURRENT CONTEXT CONTENT (the one being replaced):\n"
            f"  {before}\n\n"
            "CHILD ANCHORS (ground truth — summary must reflect them):\n"
            f"{ch_block}\n\n"
            "RECENT FEEDBACK ON THIS CONTEXT (most recent first):\n"
            f"{self._format_feedback(ctx['recent_feedback'])}\n\n"
            "RULES:\n"
            "- Output ONLY the new context summary. No commentary, no headers.\n"
            "- 1-2 sentences. Should describe the common theme of the child anchors.\n"
            "- Plain English only. Do NOT invent reference codes "
            "(e.g. no 'PM-25', 'CTX-7').\n"
            "- DO NOT change which child anchors belong here. Only rewrite text.\n\n"
            "NEW CONTEXT SUMMARY:"
        )

    # -----------------------------------------------------------------
    # Apply + audit
    # -----------------------------------------------------------------

    def _apply_regen(self, node_id: str, before: str, after: str,
                     scope: str, trigger_reason: str):
        applied_by = self._llm_label()
        with self.db._connect() as conn:
            conn.execute("""
                UPDATE memory_nodes
                SET content = ?, last_modified = datetime('now')
                WHERE id = ?
            """, (after, node_id))
            conn.execute("""
                INSERT INTO restructure_log
                (node_id, scope, trigger_reason, before_content,
                 after_content, applied_by)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (node_id, scope, trigger_reason, before, after, applied_by))

        # Re-embed so semantic ranking + ChromaDB match the new content.
        try:
            embedder = self._get_embedder()
            if embedder is not None:
                new_euc = embedder.embed_text(after)
                self.db.refresh_node_embedding(node_id, new_euc)
        except Exception as e:
            logger.warning(f"re-embed failed for {node_id}: {e}")

    def _mark_processed(self, queue_id: Optional[int], status: str):
        if queue_id is None:
            return
        with self.db._connect() as conn:
            conn.execute("""
                UPDATE restructure_queue
                SET status = ?, processed_at = datetime('now')
                WHERE id = ?
            """, (status, queue_id))

    # -----------------------------------------------------------------
    # LLM dispatch (mirrors nightly.py patterns)
    # -----------------------------------------------------------------

    def _get_embedder(self):
        if self._embedder is not None:
            return self._embedder
        try:
            from ingestion.embedder import Embedder
            self._embedder = Embedder(hyperparams=self.hp)
        except Exception as e:
            logger.warning(f"embedder unavailable: {e}")
            self._embedder = None
        return self._embedder

    def _call_llm(self, prompt: str) -> str:
        return self._call_openai(prompt)

    def _llm_label(self) -> str:
        return f"llm_regen_{self.hp.get('openai_chat_model', 'gpt-4o-mini')}"

    def _call_openai(self, prompt: str) -> str:
        """OpenAI chat/completions. Honors OPENAI_BASE_URL. Raises on
        failure so _process_job's existing try/except records it."""
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set")
        base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = self.hp.get("openai_chat_model", "gpt-4o-mini")
        max_tokens = self.hp.get("consolidation_max_tokens", 2048)
        response = httpx.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "temperature": 0.3,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message", {}).get("content") or "").strip()

    @staticmethod
    def _sanitize(text: str) -> str:
        import re
        cleaned = re.sub(r'\b[A-Z]{1,5}-\d{1,4}\b', '', text or '')
        cleaned = re.sub(r'[\[\(\{][A-Z]{1,5}\d{1,4}[\]\)\}]', '', cleaned)
        cleaned = cleaned.strip()
        if len(cleaned) >= 2 and cleaned[0] in '"\u201c\'`' and cleaned[-1] in '"\u201d\'`':
            cleaned = cleaned[1:-1].strip()
        cleaned = re.sub(r'  +', ' ', cleaned)
        return cleaned.strip()
