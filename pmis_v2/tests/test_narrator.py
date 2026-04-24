"""Tests for narrator OpenAI dispatch."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from sync import narrator  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)


class TestCallModel:
    def test_routes_to_openai(self, monkeypatch):
        called = {"openai": 0}

        def fake_openai(prompt, **kwargs):
            called["openai"] += 1
            assert "stories" in prompt.lower() or "journal" in prompt.lower()
            return "## Story\n- You shipped X. [1]"

        monkeypatch.setattr("sync.humanizer._call_openai", fake_openai, raising=True)
        hp = {"openai_chat_model": "gpt-4o-mini"}
        out = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert called["openai"] == 1
        assert "shipped X" in out

    def test_returns_empty_on_openai_failure(self, monkeypatch):
        monkeypatch.setattr(
            "sync.humanizer._call_openai", lambda *a, **kw: "", raising=True
        )
        out = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], {})
        assert out == ""

    def test_uses_configured_model(self, monkeypatch):
        seen = {}

        def fake_openai(prompt, **kwargs):
            seen["model"] = kwargs.get("model")
            return "ok"

        monkeypatch.setattr("sync.humanizer._call_openai", fake_openai, raising=True)
        narrator._call_model(
            [{"id": "1", "outcome": "x", "title": "t"}],
            {"openai_chat_model": "gpt-4o"},
        )
        assert seen["model"] == "gpt-4o"
