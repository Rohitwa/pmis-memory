"""Phase B — outcome-shaped rewrite of work_page summaries.

The tracker's raw summaries describe motion ("browsed Chrome", "typed in
terminal"). This module calls OpenAI to rewrite them as outcomes, grounded
strictly in the given data — no fabrication.

Unified provider: OpenAI `gpt-4o-mini` (text only). Honors `OPENAI_BASE_URL`
so a Cloudflare proxy deployment works without code changes. Claude, Gemini,
and Ollama paths were removed in favor of a single provider.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("pmis.sync.humanizer")

# Words the rewrite must not lead with — these describe motion, not outcomes.
_BANNED_LEAD_VERBS = {
    "browsed", "scrolled", "viewed", "looked", "watched", "observed",
    "read", "reading", "browsing", "scrolling",
}

# Words that indicate a valid outcome-shaped lead.
_GOOD_LEAD_VERBS = {
    "drafted", "wrote", "reviewed", "shipped", "fixed", "debugged",
    "built", "created", "designed", "added", "removed", "refactored",
    "committed", "merged", "pushed", "composed", "sent", "replied",
    "deployed", "tested", "analyzed", "investigated", "resolved",
    "renamed", "restructured", "integrated", "migrated", "documented",
    "pitched", "presented", "planned", "configured", "edited", "updated",
    "launched", "executed", "researched", "compared", "discussed",
    "prepared", "identified", "monitored", "searched", "explored",
}

EMPTY_MARKER = "[low-signal segment]"


def humanize_page(
    db,
    page: Dict,
    hp: Dict,
    force: bool = False,
) -> Dict:
    """Rewrite one work_page's summary. Returns a dict of what changed.

    Skips pages that are already humanized unless force=True.
    Skips kachra pages by default (no point rewriting noise).
    """
    if not force and page.get("humanized_summary"):
        return {"page_id": page["id"], "skipped": "already_humanized"}
    if (page.get("salience") or "pending") == "kachra" and not force:
        return {"page_id": page["id"], "skipped": "kachra"}

    prompt = _build_prompt(page)

    model = hp.get("openai_chat_model", "gpt-4o-mini")
    text = _call_openai(prompt, model=model, max_tokens=200, timeout_s=30)
    model_used = f"openai_{model}" if text else ""

    if not text:
        return {"page_id": page["id"], "skipped": "llm_unavailable"}

    cleaned = _sanitize(text, page)
    if not cleaned or cleaned == EMPTY_MARKER:
        # Leave humanized_summary blank — UI falls back to raw summary.
        db._conn.execute(
            """UPDATE work_pages
               SET humanized_summary = '', humanized_at = datetime('now'),
                   humanized_by = ?
               WHERE id = ?""",
            (f"{model_used}:empty", page["id"]),
        )
        db._conn.commit()
        return {"page_id": page["id"], "humanized_by": model_used,
                "outcome": "", "skipped": "empty_or_rejected"}

    db._conn.execute(
        """UPDATE work_pages
           SET humanized_summary = ?, humanized_at = datetime('now'),
               humanized_by = ?
           WHERE id = ?""",
        (cleaned, model_used, page["id"]),
    )
    db._conn.commit()
    return {
        "page_id": page["id"],
        "humanized_by": model_used,
        "outcome": cleaned,
    }


def humanize_all(
    db,
    hp: Dict,
    date_local: Optional[str] = None,
    user_id: str = "local",
    force: bool = False,
    only_salient: bool = True,
) -> Dict:
    """Humanize every eligible work_page. Returns counts by outcome."""
    where = ["user_id = ?"]
    params: List = [user_id]
    if date_local:
        where.append("date_local = ?")
        params.append(date_local)
    if only_salient:
        where.append("salience = 'salient'")
    if not force:
        where.append("(humanized_summary IS NULL OR humanized_summary = '')")

    rows = db._conn.execute(
        f"SELECT * FROM work_pages WHERE {' AND '.join(where)}",
        params,
    ).fetchall()

    counts = {"total": len(rows), "humanized": 0, "skipped": 0,
              "by_model": {}}
    for r in rows:
        result = humanize_page(db, dict(r), hp, force=force)
        if result.get("outcome"):
            counts["humanized"] += 1
            m = result.get("humanized_by", "unknown")
            counts["by_model"][m] = counts["by_model"].get(m, 0) + 1
        else:
            counts["skipped"] += 1
    return counts


def _build_prompt(page: Dict) -> str:
    title = (page.get("title") or "").strip()
    summary = (page.get("summary") or "").strip()
    return (
        "You rewrite a work tracker entry as an OUTCOME, not a motion.\n"
        "\n"
        "Input:\n"
        f"  Title:   {title}\n"
        f"  Summary: {summary}\n"
        "\n"
        "Rules:\n"
        "- Second-person past-tense (\"You reviewed...\", \"You drafted...\").\n"
        "- Start with an active outcome verb (drafted, reviewed, shipped, fixed,\n"
        "  debugged, researched, monitored, compared, documented, pitched, etc.).\n"
        "- Do NOT use: scrolled, browsed, read, viewed, looked at, stared, "
        "observed.\n"
        "- Ground STRICTLY in the title+summary. Do not invent specific project\n"
        "  names, people, deliverables, or content the input doesn't mention.\n"
        "- One sentence, under 22 words.\n"
        "- If the input describes truly passive activity only, output the exact\n"
        "  string: " + EMPTY_MARKER + "\n"
        "\n"
        "Output only the sentence (or the marker). No prefix. No quotes."
    )


def _call_openai(prompt: str, *,
                 model: str = "gpt-4o-mini",
                 max_tokens: int = 400,
                 temperature: float = 0.3,
                 timeout_s: int = 45) -> str:
    """Unified chat/completions call. Honors OPENAI_BASE_URL so Cloudflare
    proxy deployments work. Returns '' on any failure — caller treats
    as LLM unavailable."""
    try:
        import httpx
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            return ""
        base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        resp = httpx.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=timeout_s,
        )
        if resp.status_code != 200:
            logger.warning("openai %s returned %d: %s",
                           model, resp.status_code, resp.text[:200])
            return ""
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message", {}).get("content") or "").strip()
    except Exception as e:
        logger.warning("openai call failed: %s", e)
        return ""


def _sanitize(text: str, page: Dict) -> str:
    """Keep the single rewrite line; reject if it leads with a banned verb."""
    if not text:
        return ""
    # Some models wrap with quotes or add explanatory prefix — take first line.
    first = next((l.strip() for l in text.splitlines() if l.strip()), "")
    # Strip wrapping quotes.
    for ch in ['"', "'", "“", "”", "‘", "’"]:
        if first.startswith(ch) and first.endswith(ch):
            first = first[1:-1].strip()
    # Marker passthrough.
    if EMPTY_MARKER in first:
        return EMPTY_MARKER
    # Reject if empty or too short to be useful.
    if len(first) < 6:
        return ""
    # Lead-verb check.
    lead = first.split()[0].lower().strip(",.;:")
    if lead in _BANNED_LEAD_VERBS:
        return ""
    # Truncate over-long outputs to first sentence.
    for stop in [". ", "? ", "! "]:
        if stop in first:
            first = first.split(stop, 1)[0] + stop.strip()
            break
    return first[:240]
