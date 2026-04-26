"""Tests for Track D.2 — Restructure metadata triage.

Structural feedback issues (wrong parent, duplicate sibling) get fixed
without an LLM call. Content-quality issues fall through to the existing
LLM rewrite path.
"""

import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from consolidation.restructure import Restructurer  # noqa: E402


@pytest.fixture
def hp():
    return {
        "use_local": True,
        "consolidation_model_local": "qwen2.5:14b",
        "consolidation_max_tokens": 2048,
        "restructure_duplicate_threshold": 0.08,
        "restructure_reparent_gain": 0.15,
    }


@contextmanager
def _null_conn():
    yield MagicMock()


def _anchor(node_id: str, content: str = "some anchor") -> dict:
    return {
        "id": node_id,
        "content": content,
        "level": "ANC",
        "is_user_edited": 0,
        "is_deleted": 0,
    }


def _context(node_id: str, content: str = "some context") -> dict:
    return {
        "id": node_id,
        "content": content,
        "level": "CTX",
        "is_deleted": 0,
    }


def _mkdb(embs: dict, parents: dict | None = None,
          children: dict | None = None, ctx_nodes: list | None = None,
          nodes: dict | None = None):
    """Build a mock DB for Restructurer triage tests.

    embs: {node_id: np.ndarray}
    parents: {child_id: [parent_dict, ...]}
    children: {parent_id: [child_dict, ...]}
    ctx_nodes: list of context dicts returned by get_nodes_by_level('CTX')
    nodes: {node_id: node_dict} for get_node
    """
    db = MagicMock()
    db.get_embeddings.side_effect = lambda nid: {"euclidean": embs.get(nid)}
    db.get_parents.side_effect = lambda nid: (parents or {}).get(nid, [])
    db.get_children.side_effect = lambda pid: (children or {}).get(pid, [])
    db.get_nodes_by_level.side_effect = lambda lvl: (
        (ctx_nodes or []) if lvl == "CTX" else []
    )
    db.get_node.side_effect = lambda nid: (nodes or {}).get(nid)
    db._connect = _null_conn
    db.merge_into_parent = MagicMock()
    db.attach_to_parent = MagicMock()
    db._refresh_context_stats = MagicMock()
    return db


class TestTriage:
    def test_context_scope_always_falls_to_llm(self, hp):
        db = _mkdb(embs={})
        r = Restructurer(db, hp)
        node = _context("ctx1")
        assert r._triage(node, "context") == "content"

    def test_anchor_without_embedding_falls_to_llm(self, hp):
        db = _mkdb(embs={"a1": None})
        r = Restructurer(db, hp)
        assert r._triage(_anchor("a1"), "anchor") == "content"

    def test_anchor_without_parent_falls_to_llm(self, hp):
        db = _mkdb(embs={"a1": np.array([1, 0, 0, 0], dtype=np.float32)},
                   parents={"a1": []})
        r = Restructurer(db, hp)
        assert r._triage(_anchor("a1"), "anchor") == "content"

    def test_duplicate_sibling_triggers_merge(self, hp):
        vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        db = _mkdb(
            embs={"a1": vec, "a2": vec.copy(), "p": vec.copy()},
            parents={"a1": [_context("p")]},
            children={"p": [_anchor("a1"), _anchor("a2")]},
        )
        r = Restructurer(db, hp)
        decision = r._triage(_anchor("a1"), "anchor")
        assert decision[0] == "merge"
        assert decision[1] == "a2"

    def test_skip_deleted_sibling_in_duplicate_check(self, hp):
        vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        a2 = _anchor("a2")
        a2["is_deleted"] = 1
        db = _mkdb(
            embs={"a1": vec, "a2": vec.copy(), "p": vec.copy()},
            parents={"a1": [_context("p")]},
            children={"p": [_anchor("a1"), a2]},
        )
        r = Restructurer(db, hp)
        # No alive duplicate sibling; falls to either reparent or content.
        # Parent is same vec → current_dist 0; no other CTX → content.
        assert r._triage(_anchor("a1"), "anchor") == "content"

    def test_better_parent_triggers_reparent(self, hp):
        anchor_vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        current_parent_vec = np.array([0.0, 1, 0, 0], dtype=np.float32)  # far
        better_parent_vec = anchor_vec.copy()  # perfect match

        db = _mkdb(
            embs={
                "a1": anchor_vec,
                "p_old": current_parent_vec,
                "p_new": better_parent_vec,
            },
            parents={"a1": [_context("p_old")]},
            children={"p_old": [_anchor("a1")]},  # no duplicate sibling
            ctx_nodes=[_context("p_old"), _context("p_new")],
        )
        r = Restructurer(db, hp)
        decision = r._triage(_anchor("a1"), "anchor")
        assert decision[0] == "reparent"
        assert decision[1] == "p_new"
        assert decision[2] == "p_old"

    def test_marginal_gain_stays_content(self, hp):
        """If migration gain is below threshold, stay content (avoid churn)."""
        anchor_vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        # Current parent distance = 0.2, better parent = 0.10 → gain 0.10 < 0.15
        current_parent_vec = anchor_vec * 0.8
        current_parent_vec = current_parent_vec / np.linalg.norm(current_parent_vec)
        better_parent_vec = anchor_vec.copy()

        # Need to construct vectors so current_dist - best_other_dist < 0.15.
        # Use explicit distances by patching compute_raw_surprise would be
        # easier, but keeping it numerical to exercise the real math.
        # Build a case where both are fairly close.
        a = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        b = np.array([0.95, 0.3, 0.0, 0.0], dtype=np.float32)
        b = b / np.linalg.norm(b)
        c = np.array([0.98, 0.2, 0.0, 0.0], dtype=np.float32)
        c = c / np.linalg.norm(c)

        db = _mkdb(
            embs={"a1": a, "p_old": b, "p_new": c},
            parents={"a1": [_context("p_old")]},
            children={"p_old": [_anchor("a1")]},
            ctx_nodes=[_context("p_old"), _context("p_new")],
        )
        r = Restructurer(db, hp)
        assert r._triage(_anchor("a1"), "anchor") == "content"

    def test_duplicate_beats_reparent(self, hp):
        """If both merge and reparent candidates exist, merge wins (cheaper)."""
        vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        other = np.array([0.0, 1.0, 0, 0], dtype=np.float32)
        db = _mkdb(
            embs={
                "a1": vec, "a2": vec.copy(),     # duplicate sibling
                "p_old": other,                   # current parent (far)
                "p_new": vec.copy(),              # better parent
            },
            parents={"a1": [_context("p_old")]},
            children={"p_old": [_anchor("a1"), _anchor("a2")]},
            ctx_nodes=[_context("p_old"), _context("p_new")],
        )
        r = Restructurer(db, hp)
        decision = r._triage(_anchor("a1"), "anchor")
        assert decision[0] == "merge"


class TestProcessJobDispatch:
    def test_dispatches_to_merge_handler(self, hp):
        vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        anchor = _anchor("a1")
        db = _mkdb(
            embs={"a1": vec, "a2": vec.copy(), "p": vec.copy()},
            parents={"a1": [_context("p")]},
            children={"p": [anchor, _anchor("a2")]},
            nodes={"a1": anchor},
        )
        r = Restructurer(db, hp)
        job = {"id": 1, "node_id": "a1", "scope": "anchor", "reason": "value_feedback"}

        with patch.object(r, "_call_llm") as mock_llm, \
             patch.object(r, "_mark_processed") as mock_mark:
            result = r._process_job(job)

        mock_llm.assert_not_called()
        assert result["action"] == "restructure_merge"
        assert result["merged_into"] == "a2"
        db.merge_into_parent.assert_called_once_with(child_id="a1", parent_id="a2")
        mock_mark.assert_called_once_with(1, "done")

    def test_dispatches_to_content_llm_path(self, hp):
        """No structural signals → LLM rewrite runs as before."""
        vec = np.array([1.0, 0, 0, 0], dtype=np.float32)
        anchor = _anchor("a1", content="original content")
        db = _mkdb(
            embs={"a1": vec, "p": vec.copy()},
            parents={"a1": [_context("p")]},
            children={"p": [anchor]},  # no siblings
            ctx_nodes=[_context("p")],  # no better other CTX
            nodes={"a1": anchor},
        )
        r = Restructurer(db, hp)
        job = {"id": 5, "node_id": "a1", "scope": "anchor", "reason": "x"}

        with patch.object(r, "_call_llm", return_value="rewritten"), \
             patch.object(r, "_apply_regen") as mock_apply, \
             patch.object(r, "_mark_processed"):
            result = r._process_job(job)

        assert result["action"] == "restructure"
        mock_apply.assert_called_once()

    def test_user_edited_skips_triage_too(self, hp):
        """is_user_edited must short-circuit before triage kicks in."""
        anchor = _anchor("a1")
        anchor["is_user_edited"] = 1
        db = _mkdb(embs={}, nodes={"a1": anchor})
        r = Restructurer(db, hp)
        job = {"id": 1, "node_id": "a1", "scope": "anchor", "reason": "x"}

        with patch.object(r, "_triage") as mock_triage, \
             patch.object(r, "_mark_processed"):
            result = r._process_job(job)
        mock_triage.assert_not_called()
        assert result["action"] == "restructure_skipped"
        assert result["reason"] == "is_user_edited"
