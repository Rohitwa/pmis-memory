"""Tests for Track D.1 — Birth pass warm-start.

When a cluster's centroid is already close to an existing Context, we attach
the cluster and skip the LLM naming call. These tests mock the DB and LLM
path to verify dispatch without exercising the full consolidation engine.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from consolidation.nightly import NightlyConsolidation  # noqa: E402


@pytest.fixture
def hp():
    return {
        "birth_min_orphans": 3,
        "birth_cluster_threshold": 0.35,
        "birth_warm_start_threshold": 0.15,
        "temporal_embedding_dim": 16,
        "era_boundaries": {},
        "local_embedding_dimensions": 4,
        "use_local": True,
        "poincare_dimensions": 32,
        "consolidation_model_local": "qwen2.5:14b",
        "consolidation_max_tokens": 128,
    }


def _orphan(node_id: str, content: str = "orphan content") -> dict:
    return {"id": node_id, "content": content, "level": "ANC"}


def _context(node_id: str, content: str = "existing context") -> dict:
    return {"id": node_id, "content": content, "level": "CTX", "tree_id": "t1"}


def _make_engine(hp, orphan_embs, ctx_nodes, ctx_embs):
    """Build a NightlyConsolidation with a mocked DB.

    orphan_embs: dict of {orphan_id: np.ndarray}
    ctx_nodes: list of context dicts
    ctx_embs: dict of {ctx_id: np.ndarray}
    """
    db = MagicMock()
    db.get_orphan_nodes.return_value = [_orphan(oid) for oid in orphan_embs]

    def get_embeddings(node_id):
        if node_id in orphan_embs:
            return {"euclidean": orphan_embs[node_id]}
        if node_id in ctx_embs:
            return {"euclidean": ctx_embs[node_id]}
        return {"euclidean": None}

    db.get_embeddings.side_effect = get_embeddings
    db.get_nodes_by_level.return_value = ctx_nodes
    db.attach_to_parent = MagicMock()
    db.create_node = MagicMock()

    engine = NightlyConsolidation(db, hyperparams=hp)
    return engine, db


class TestWarmStart:
    def test_attaches_to_nearest_context_when_similar(self, hp):
        """Cluster centroid ≈ existing CTX embedding → attach, no LLM call."""
        shared = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        orphan_embs = {
            "o1": shared.copy(),
            "o2": shared.copy(),
            "o3": shared.copy(),
        }
        ctx_embs = {"ctx_existing": shared.copy()}
        ctx_nodes = [_context("ctx_existing")]

        engine, db = _make_engine(hp, orphan_embs, ctx_nodes, ctx_embs)

        with patch.object(engine, "_generate_context_summary") as mock_llm:
            actions = engine._pass_birth()

        # LLM must not be called — this is the whole point of warm-start.
        mock_llm.assert_not_called()
        assert len(actions) == 1
        assert actions[0]["action"] == "birth_warmstart_attach"
        assert actions[0]["attached_context_id"] == "ctx_existing"
        assert set(actions[0]["orphan_ids"]) == {"o1", "o2", "o3"}
        # No new node created.
        db.create_node.assert_not_called()
        # Three attach calls, all to the existing context.
        assert db.attach_to_parent.call_count == 3
        for call in db.attach_to_parent.call_args_list:
            assert call.args[1] == "ctx_existing"

    def test_births_new_context_when_no_close_ctx_exists(self, hp):
        """No CTX close to centroid → fall through to LLM + create_node."""
        orphan_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        far_ctx_vec = np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32)
        orphan_embs = {
            "o1": orphan_vec.copy(),
            "o2": orphan_vec.copy(),
            "o3": orphan_vec.copy(),
        }
        ctx_embs = {"ctx_far": far_ctx_vec}
        ctx_nodes = [_context("ctx_far")]

        engine, db = _make_engine(hp, orphan_embs, ctx_nodes, ctx_embs)

        with patch.object(
            engine, "_generate_context_summary", return_value="A new topic label"
        ) as mock_llm:
            actions = engine._pass_birth()

        mock_llm.assert_called_once()
        assert len(actions) == 1
        assert actions[0]["action"] == "birth"
        assert "new_context_id" in actions[0]
        db.create_node.assert_called_once()

    def test_births_new_context_when_no_ctx_nodes_at_all(self, hp):
        """Empty CTX set → nearest is None → straight to cold-start birth."""
        vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        orphan_embs = {"o1": vec, "o2": vec, "o3": vec}
        engine, db = _make_engine(hp, orphan_embs, ctx_nodes=[], ctx_embs={})

        with patch.object(
            engine, "_generate_context_summary", return_value="Brand new topic"
        ) as mock_llm:
            actions = engine._pass_birth()

        mock_llm.assert_called_once()
        assert actions[0]["action"] == "birth"

    def test_under_min_orphans_skips_entirely(self, hp):
        """Fewer than min_orphans → no clustering, no LLM, no actions."""
        vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        orphan_embs = {"o1": vec, "o2": vec}  # only 2, min is 3
        engine, db = _make_engine(hp, orphan_embs, ctx_nodes=[], ctx_embs={})

        with patch.object(engine, "_generate_context_summary") as mock_llm:
            actions = engine._pass_birth()
        mock_llm.assert_not_called()
        assert actions == []


class TestFindNearestContextByEmbedding:
    def test_returns_nearest_with_distance(self, hp):
        vec_a = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        vec_b = np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32)
        ctx_nodes = [_context("ctx_a"), _context("ctx_b")]
        ctx_embs = {"ctx_a": vec_a, "ctx_b": vec_b}
        engine, _ = _make_engine(hp, orphan_embs={}, ctx_nodes=ctx_nodes, ctx_embs=ctx_embs)

        nearest, dist = engine._find_nearest_context_by_embedding(vec_a.copy())
        assert nearest["id"] == "ctx_a"
        assert dist < 0.01  # essentially 0

    def test_returns_none_when_no_ctx(self, hp):
        engine, _ = _make_engine(hp, orphan_embs={}, ctx_nodes=[], ctx_embs={})
        nearest, dist = engine._find_nearest_context_by_embedding(
            np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        )
        assert nearest is None
        assert dist == float("inf")

    def test_skips_ctx_without_embedding(self, hp):
        vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        ctx_nodes = [_context("ctx_bad"), _context("ctx_good")]
        # ctx_bad has no embedding; ctx_good matches.
        ctx_embs = {"ctx_good": vec}
        engine, _ = _make_engine(hp, orphan_embs={}, ctx_nodes=ctx_nodes, ctx_embs=ctx_embs)
        nearest, _ = engine._find_nearest_context_by_embedding(vec.copy())
        assert nearest["id"] == "ctx_good"
