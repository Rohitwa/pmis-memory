"""Tests for ContextClassifier — focuses on the deterministic Track B path."""

import asyncio

import pytest

from src.pipeline.context_classifier import ContextClassifier, _classify_medium


@pytest.fixture
def config():
    return {
        "llm": {"provider_order": ["openai", "ollama"]},
        "openai": {"text_model": "gpt-4o-mini", "timeout": 45},
        "ollama": {
            "text_model": "qwen2.5:3b",
            "base_url": "http://localhost:11434",
            "timeout": 60,
        },
    }


@pytest.fixture
def classifier(config):
    return ContextClassifier(config)


class TestClassifyMedium:
    def test_browser_detection(self):
        assert _classify_medium("Google Chrome") == "browser"
        assert _classify_medium("Firefox") == "browser"
        assert _classify_medium("Arc") == "browser"

    def test_ide_detection(self):
        assert _classify_medium("Visual Studio Code") == "ide"
        assert _classify_medium("Cursor") == "ide"
        assert _classify_medium("PyCharm") == "ide"

    def test_terminal_detection(self):
        assert _classify_medium("Terminal") == "terminal"
        assert _classify_medium("iTerm2") == "terminal"

    def test_chat_detection(self):
        assert _classify_medium("Slack") == "chat"
        assert _classify_medium("Discord") == "chat"

    def test_office_detection(self):
        assert _classify_medium("Microsoft Word") == "office"
        assert _classify_medium("Notion") == "office"

    def test_unknown_returns_other(self):
        assert _classify_medium("SomeRandomApp") == "other"
        assert _classify_medium("") == "other"
        assert _classify_medium(None) == "other"


class TestDeterministicSynthesis:
    def test_use_llm_hardwired_true(self, classifier):
        """use_llm is always True after the OpenAI-only refactor; deterministic
        synthesis is now a failure fallback inside classify_segment, not a flag."""
        assert classifier.use_llm is True

    def test_worker_majority_vote(self, classifier):
        """Majority of frame.worker_type decides segment worker."""
        frames = [
            {"worker_type": "human", "detailed_summary": "typing"},
            {"worker_type": "human", "detailed_summary": "typing"},
            {"worker_type": "agent", "detailed_summary": "auto-edit"},
        ]
        window = {"title": "Code", "app_name": "VS Code"}
        result = asyncio.run(
            classifier.classify_segment("TS-001", frames, window, agent_active=False)
        )
        assert result["worker"] == "human"

    def test_worker_falls_back_to_agent_flag_when_no_frames(self, classifier):
        frames = [{"detailed_summary": "some task"}]  # no worker_type
        result = asyncio.run(
            classifier.classify_segment(
                "TS-001", frames, {"title": "X", "app_name": "Y"}, agent_active=True
            )
        )
        assert result["worker"] == "agent"

    def test_medium_from_app_name(self, classifier):
        frames = [{"worker_type": "human", "detailed_summary": "browsing"}]
        window = {"title": "Google", "app_name": "Safari"}
        result = asyncio.run(
            classifier.classify_segment("TS-001", frames, window, agent_active=False)
        )
        assert result["medium"] == "browser"

    def test_task_dedup_and_top_title(self, classifier):
        """Repeated tasks should collapse; most-frequent becomes short_title."""
        frames = [
            {"worker_type": "human", "detailed_summary": "Reviewing a pull request"},
            {"worker_type": "human", "detailed_summary": "Reviewing a pull request"},
            {"worker_type": "human", "detailed_summary": "Reviewing a pull request"},
            {"worker_type": "human", "detailed_summary": "Checking CI logs"},
        ]
        window = {"title": "GitHub", "app_name": "Chrome"}
        result = asyncio.run(
            classifier.classify_segment("TS-001", frames, window, agent_active=False)
        )
        assert "Reviewing a pull request" in result["short_title"]
        assert result["medium"] == "browser"
        # Both unique tasks should appear in the detailed summary.
        assert "Reviewing a pull request" in result["detailed_summary"]
        assert "Checking CI logs" in result["detailed_summary"]

    def test_empty_frames_still_produces_valid_schema(self, classifier):
        result = asyncio.run(
            classifier.classify_segment(
                "TS-001", [], {"title": "Empty", "app_name": "Terminal"},
                agent_active=False,
            )
        )
        assert set(result.keys()) >= {
            "short_title", "detailed_summary", "full_text", "worker", "medium",
        }
        assert result["medium"] == "terminal"
        assert result["worker"] == "human"
        assert result["short_title"]  # non-empty

    def test_full_text_dedupes_raw_text(self, classifier):
        """raw_text dedup should collapse identical strings."""
        frames = [
            {"worker_type": "human", "raw_text": "def foo():"},
            {"worker_type": "human", "raw_text": "def foo():"},
            {"worker_type": "human", "raw_text": "def bar():"},
        ]
        result = asyncio.run(
            classifier.classify_segment(
                "TS-001", frames, {"title": "x", "app_name": "Cursor"},
                agent_active=False,
            )
        )
        # Both unique texts present, joined with " | "
        assert "def foo()" in result["full_text"]
        assert "def bar()" in result["full_text"]
        # Duplicate should not appear twice — count " | " sections
        assert result["full_text"].count("def foo()") == 1
