"""Tests for Track D.5 — page_builder deterministic generation.

Default path is now template; LLM path stays reachable via the
`page_builder_use_llm` hp flag.
"""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from sync import page_builder  # noqa: E402


def _seg(summary: str, window: str = "Code", duration: int = 60) -> dict:
    return {"id": "s1", "summary": summary, "window": window,
            "platform": "macOS", "duration_secs": duration, "worker": "human"}


class TestDispatch:
    def test_default_no_hp_uses_deterministic(self):
        cluster = [_seg("Drafted CISO outreach email")]
        with patch.object(page_builder, "_call_ollama") as mock_ollama:
            title, summary = page_builder.llm_generate_title_and_summary(cluster)
        mock_ollama.assert_not_called()
        assert title  # non-empty
        assert summary

    def test_flag_false_uses_deterministic(self):
        cluster = [_seg("Drafted CISO outreach email")]
        with patch.object(page_builder, "_call_ollama") as mock_ollama:
            page_builder.llm_generate_title_and_summary(
                cluster, hp={"page_builder_use_llm": False}
            )
        mock_ollama.assert_not_called()

    def test_flag_true_routes_to_ollama(self):
        cluster = [_seg("Drafted CISO outreach email")]
        with patch.object(
            page_builder, "_call_ollama",
            return_value="TITLE: Email drafting\nSUMMARY: You drafted outreach.",
        ) as mock_ollama:
            title, summary = page_builder.llm_generate_title_and_summary(
                cluster, hp={"page_builder_use_llm": True}
            )
        mock_ollama.assert_called_once()
        assert title == "Email drafting"
        assert "drafted outreach" in summary.lower()


class TestDeterministicTitle:
    def test_uses_most_common_window(self):
        cluster = [
            _seg("A", window="Cursor"),
            _seg("B", window="Cursor"),
            _seg("C", window="Chrome"),
        ]
        title, _ = page_builder._deterministic_title_and_summary(cluster)
        assert title == "Cursor"

    def test_falls_back_to_summary_when_no_windows(self):
        cluster = [
            _seg("Reviewed the project plan", window=""),
            _seg("Checked the diagrams", window=""),
        ]
        title, _ = page_builder._deterministic_title_and_summary(cluster)
        assert title.startswith("Reviewed the project plan")

    def test_truncates_long_window_name(self):
        long_win = "A" * 100
        cluster = [_seg("x", window=long_win)]
        title, _ = page_builder._deterministic_title_and_summary(cluster)
        assert len(title) <= 60

    def test_strips_preamble_in_fallback_title(self):
        cluster = [_seg("In this segment, the user drafted notes", window="")]
        title, _ = page_builder._deterministic_title_and_summary(cluster)
        assert "segment" not in title.lower()  # preamble stripped
        assert "drafted notes" in title


class TestDeterministicSummary:
    def test_includes_duration_and_window(self):
        cluster = [
            _seg("Reviewed PR 42 for edge cases", window="GitHub", duration=600),
            _seg("Checked CI logs for failures", window="GitHub", duration=600),
        ]
        _, summary = page_builder._deterministic_title_and_summary(cluster)
        assert "GitHub" in summary
        assert "min" in summary
        assert "segments" in summary

    def test_dedupes_similar_summaries(self):
        cluster = [
            _seg("Reviewed the pull request", window="GitHub"),
            _seg("Reviewed the pull request", window="GitHub"),
            _seg("Reviewed the pull request", window="GitHub"),
            _seg("Checked CI logs", window="GitHub"),
        ]
        _, summary = page_builder._deterministic_title_and_summary(cluster)
        # Dedup means we see each distinct summary at most once in body.
        assert summary.lower().count("reviewed the pull request") == 1

    def test_summary_budget_capped(self):
        cluster = [_seg("very long summary " * 100, window="X")]
        _, summary = page_builder._deterministic_title_and_summary(cluster)
        assert len(summary) <= 500


class TestDeterministicRestitch:
    def test_keeps_title_when_same_window(self):
        old_title, old_summary = "GitHub", "Existing notes."
        new_cluster = [_seg("More PR review", window="GitHub")]
        title, summary = page_builder._deterministic_restitch_page(
            old_title, old_summary, new_cluster
        )
        assert title == "GitHub"
        assert "Extended" in summary

    def test_swaps_title_on_dominant_new_window(self):
        new_cluster = [
            _seg("a", window="Cursor"),
            _seg("b", window="Cursor"),
            _seg("c", window="Cursor"),
        ]
        title, _ = page_builder._deterministic_restitch_page(
            "GitHub", "old summary", new_cluster
        )
        assert title == "Cursor"

    def test_does_not_append_when_new_is_subset_of_old(self):
        old_summary = (
            "2 segments over 5 min across Slack. Reviewed messages about deploy."
        )
        # The new summary's lead matches the old's content.
        new_cluster = [_seg("Reviewed messages about deploy", window="Slack")]
        title, summary = page_builder._deterministic_restitch_page(
            "Slack", old_summary, new_cluster
        )
        # No "Extended:" tag since the new content is already covered.
        assert "Extended:" not in summary
        assert summary == old_summary

    def test_marginal_new_window_doesnt_swap_title(self):
        """50/50 split → keep old title (no dominant new window)."""
        new_cluster = [
            _seg("a", window="Cursor"),
            _seg("b", window="GitHub"),
        ]
        title, _ = page_builder._deterministic_restitch_page(
            "GitHub", "old", new_cluster
        )
        assert title == "GitHub"
