"""Tests for Track D.6 — daily_activity_merge deterministic anchor extraction."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from daily_activity_merge import DailyActivityMerger  # noqa: E402


def _seg(summary: str, window: str = "Code", duration: int = 60) -> dict:
    return {
        "id": "s1",
        "summary": summary,
        "window": window,
        "platform": "macOS",
        "duration_secs": duration,
        "worker": "human",
    }


@pytest.fixture
def merger():
    db = MagicMock()
    return DailyActivityMerger(db, hyperparams={})


class TestDispatch:
    def test_default_is_deterministic(self, merger):
        cluster = [_seg("Drafted CISO outreach email")]
        with patch("httpx.post") as mock_post:
            out = merger._extract_pattern(cluster)
        mock_post.assert_not_called()
        assert out and "Drafted CISO outreach email" in out

    def test_flag_true_routes_to_ollama(self):
        db = MagicMock()
        m = DailyActivityMerger(db, hyperparams={"activity_merge_use_llm": True})
        cluster = [_seg("anything")]

        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {"response": "LLM-generated anchor text"}
        with patch("httpx.post", return_value=mock_resp) as mock_post:
            out = m._extract_pattern(cluster)
        mock_post.assert_called_once()
        assert out == "LLM-generated anchor text"

    def test_llm_failure_falls_back_to_deterministic(self):
        db = MagicMock()
        m = DailyActivityMerger(db, hyperparams={"activity_merge_use_llm": True})
        cluster = [_seg("Reviewed a PR")]

        with patch("httpx.post", side_effect=Exception("network")):
            out = m._extract_pattern(cluster)
        assert out and "Reviewed a PR" in out


class TestDeterministicExtraction:
    def test_prefers_outcome_verb_lead(self, merger):
        cluster = [
            _seg("Reading docs for the new API"),           # motion verb
            _seg("Drafted the email to the CISO"),          # outcome verb
            _seg("Scrolled through the changelog"),         # motion verb
        ]
        out = merger._deterministic_extract_pattern(cluster)
        # Outcome-led summary should win the primary slot.
        assert out.startswith("Drafted the email to the CISO")

    def test_dedupes_identical_summaries(self, merger):
        cluster = [_seg("Reviewed the pull request") for _ in range(5)]
        out = merger._deterministic_extract_pattern(cluster)
        # Dedup → only one copy of the body.
        assert out.lower().count("reviewed the pull request") == 1

    def test_joins_two_distinct_when_space_allows(self, merger):
        cluster = [
            _seg("Drafted outreach email"),
            _seg("Fixed flaky unit test"),
        ]
        out = merger._deterministic_extract_pattern(cluster)
        assert "Drafted outreach email" in out
        assert "Fixed flaky unit test" in out

    def test_caps_length_at_300(self, merger):
        cluster = [_seg("Drafted " + "very long note " * 100)]
        out = merger._deterministic_extract_pattern(cluster)
        assert len(out) <= 300

    def test_strips_preamble_before_ranking(self, merger):
        cluster = [
            _seg("In this segment, the user reading docs"),
            _seg("Drafted a new design doc"),
        ]
        out = merger._deterministic_extract_pattern(cluster)
        # Outcome verb wins even though motion verb is in longer raw text
        # (preamble stripping neutralizes the length bias).
        assert out.startswith("Drafted a new design doc")

    def test_empty_summaries_fall_back_to_window(self, merger):
        cluster = [
            _seg(summary="", window="Xcode"),
            _seg(summary="", window="Xcode"),
        ]
        out = merger._deterministic_extract_pattern(cluster)
        assert "Xcode" in out

    def test_empty_summaries_no_window_safe(self, merger):
        cluster = [_seg(summary="", window="")]
        out = merger._deterministic_extract_pattern(cluster)
        assert out  # non-empty, doesn't crash
