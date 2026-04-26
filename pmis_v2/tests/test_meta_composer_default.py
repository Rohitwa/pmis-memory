"""Tests for Track D.4 — meta_composer template-by-default.

compose() now defaults to deterministic template rendering. Callers can
override per-call, and the system-wide default is controlled via the
`meta_composer_use_llm` hp flag.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from claude_integration.meta_composer import ProblemStatementComposer  # noqa: E402


def _deliverable():
    return {
        "id": "d1",
        "name": "Test deliverable",
        "project_name": "Test project",
        "project_id": "p1",
        "description": "short description",
        "deadline": None,
    }


def _composer(hp: dict):
    db = MagicMock()
    db.get_deliverable.return_value = _deliverable()
    # Patch _connect for _fetch_redflag_anchors (returns empty rows).
    ctx = MagicMock()
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = []
    ctx.__enter__ = MagicMock(return_value=conn)
    ctx.__exit__ = MagicMock(return_value=False)
    db._connect = MagicMock(return_value=ctx)

    brief_composer = MagicMock()
    brief_composer.compose.return_value = {
        "claude_can_do": [],
        "you_did_before": [],
    }

    embedder = MagicMock()
    return ProblemStatementComposer(
        db=db, embedder=embedder, hyperparams=hp,
        brief_composer=brief_composer,
    )


class TestDefaultIsTemplate:
    def test_no_use_llm_arg_uses_template_by_default(self):
        comp = _composer({})  # no meta_composer_use_llm key → defaults to False
        with patch.object(comp, "_call_meta_llm") as mock_llm, \
             patch.object(comp, "_get_latest_segment", return_value=None):
            bundle = comp.compose("d1")

        mock_llm.assert_not_called()
        assert bundle.mode == "template"
        assert "## Goal" in bundle.problem_statement_md
        assert "## Out of scope" in bundle.problem_statement_md

    def test_hp_flag_true_enables_llm(self):
        comp = _composer({"meta_composer_use_llm": True})
        with patch.object(comp, "_call_meta_llm", return_value="# Mocked LLM output") as mock_llm, \
             patch.object(comp, "_llm_model_name", return_value="qwen2.5:14b"), \
             patch.object(comp, "_get_latest_segment", return_value=None):
            bundle = comp.compose("d1")

        mock_llm.assert_called_once()
        assert bundle.mode == "llm"
        assert "Mocked LLM output" in bundle.problem_statement_md


class TestPerCallOverride:
    def test_explicit_use_llm_true_overrides_hp_false(self):
        comp = _composer({"meta_composer_use_llm": False})
        with patch.object(comp, "_call_meta_llm", return_value="# LLM") as mock_llm, \
             patch.object(comp, "_llm_model_name", return_value="claude"), \
             patch.object(comp, "_get_latest_segment", return_value=None):
            bundle = comp.compose("d1", use_llm=True)

        mock_llm.assert_called_once()
        assert bundle.mode == "llm"

    def test_explicit_use_llm_false_overrides_hp_true(self):
        comp = _composer({"meta_composer_use_llm": True})
        with patch.object(comp, "_call_meta_llm") as mock_llm, \
             patch.object(comp, "_get_latest_segment", return_value=None):
            bundle = comp.compose("d1", use_llm=False)

        mock_llm.assert_not_called()
        assert bundle.mode == "template"


class TestLLMFailureFallback:
    def test_llm_exception_falls_back_to_template(self):
        comp = _composer({"meta_composer_use_llm": True})
        with patch.object(comp, "_call_meta_llm", side_effect=RuntimeError("net")) as mock_llm, \
             patch.object(comp, "_get_latest_segment", return_value=None):
            bundle = comp.compose("d1")

        mock_llm.assert_called_once()
        # Falls back to template, keeps structure.
        assert bundle.mode == "template"
        assert "## Goal" in bundle.problem_statement_md
