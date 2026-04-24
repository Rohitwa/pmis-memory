"""Tests for narrator dispatch order (Track C: Claude → Gemini → Ollama)."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from sync import narrator  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    """Strip all provider keys by default — tests set what they need."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


class TestDispatchOrder:
    def test_claude_wins_when_key_and_flag_set(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")

        called = {"anthropic": 0, "gemini": 0, "ollama": 0}

        def fake_anthropic(prompt, api_key, *, model, timeout_s):
            called["anthropic"] += 1
            return "## Story\n- You shipped X. [1]"

        def fake_gemini(prompt, api_key, model=None, timeout_s=0):
            called["gemini"] += 1
            return "should not be called"

        def fake_ollama(prompt, model=None, timeout_s=0):
            called["ollama"] += 1
            return "should not be called"

        monkeypatch.setattr(narrator, "_call_anthropic", fake_anthropic)
        monkeypatch.setattr(
            "sync.humanizer._call_gemini", fake_gemini, raising=True
        )
        monkeypatch.setattr(
            "sync.humanizer._call_ollama", fake_ollama, raising=True
        )
        monkeypatch.setattr(
            "sync.humanizer._resolve_gemini_key",
            lambda: "gemini-key",
            raising=True,
        )

        hp = {"humanize_use_cloud": True, "narrator_use_claude": True}
        result = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert "shipped X" in result
        assert called == {"anthropic": 1, "gemini": 0, "ollama": 0}

    def test_falls_through_to_gemini_when_no_anthropic_key(self, monkeypatch):
        called = {"anthropic": 0, "gemini": 0, "ollama": 0}

        def fake_anthropic(*args, **kwargs):
            called["anthropic"] += 1
            return ""  # not reached without key

        def fake_gemini(prompt, api_key, model=None, timeout_s=0):
            called["gemini"] += 1
            return "gemini output"

        def fake_ollama(*args, **kwargs):
            called["ollama"] += 1
            return ""

        monkeypatch.setattr(narrator, "_call_anthropic", fake_anthropic)
        monkeypatch.setattr("sync.humanizer._call_gemini", fake_gemini)
        monkeypatch.setattr("sync.humanizer._call_ollama", fake_ollama)
        monkeypatch.setattr(
            "sync.humanizer._resolve_gemini_key", lambda: "gemini-key"
        )

        hp = {"humanize_use_cloud": True, "narrator_use_claude": True}
        result = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert result == "gemini output"
        # Anthropic not reached because key is absent — no function call at all.
        assert called["anthropic"] == 0
        assert called["gemini"] == 1

    def test_falls_through_when_anthropic_returns_empty(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        called = {"anthropic": 0, "gemini": 0}

        def fake_anthropic(*args, **kwargs):
            called["anthropic"] += 1
            return ""

        def fake_gemini(prompt, api_key, model=None, timeout_s=0):
            called["gemini"] += 1
            return "gemini output"

        monkeypatch.setattr(narrator, "_call_anthropic", fake_anthropic)
        monkeypatch.setattr("sync.humanizer._call_gemini", fake_gemini)
        monkeypatch.setattr(
            "sync.humanizer._call_ollama", lambda *a, **kw: ""
        )
        monkeypatch.setattr(
            "sync.humanizer._resolve_gemini_key", lambda: "gemini-key"
        )

        hp = {"humanize_use_cloud": True, "narrator_use_claude": True}
        result = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert result == "gemini output"
        assert called["anthropic"] == 1
        assert called["gemini"] == 1

    def test_flag_off_skips_claude(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        called = {"anthropic": 0, "gemini": 0}

        monkeypatch.setattr(
            narrator, "_call_anthropic",
            lambda *a, **kw: (called.__setitem__("anthropic", called["anthropic"] + 1) or "claude"),
        )
        monkeypatch.setattr(
            "sync.humanizer._call_gemini",
            lambda *a, **kw: (called.__setitem__("gemini", called["gemini"] + 1) or "gemini"),
        )
        monkeypatch.setattr("sync.humanizer._call_ollama", lambda *a, **kw: "")
        monkeypatch.setattr(
            "sync.humanizer._resolve_gemini_key", lambda: "gemini-key"
        )

        hp = {"humanize_use_cloud": True, "narrator_use_claude": False}
        result = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert result == "gemini"
        assert called["anthropic"] == 0

    def test_offline_falls_all_the_way_to_ollama(self, monkeypatch):
        monkeypatch.setattr(narrator, "_call_anthropic", lambda *a, **kw: "")
        monkeypatch.setattr("sync.humanizer._call_gemini", lambda *a, **kw: "")
        monkeypatch.setattr(
            "sync.humanizer._resolve_gemini_key", lambda: None
        )
        monkeypatch.setattr(
            "sync.humanizer._call_ollama",
            lambda *a, **kw: "qwen output",
        )

        hp = {"humanize_use_cloud": False, "narrator_use_claude": True}
        result = narrator._call_model([{"id": "1", "outcome": "x", "title": "t"}], hp)
        assert result == "qwen output"


class TestCallAnthropic:
    def test_parses_200_response(self):
        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {
            "content": [
                {"type": "text", "text": "## Story\n"},
                {"type": "text", "text": "- You did X. [1]"},
            ]
        }
        with patch("httpx.post", return_value=mock_resp) as mock_post:
            result = narrator._call_anthropic(
                "prompt", "sk-ant-key", model="claude-haiku-4-5-20251001"
            )
        assert result == "## Story\n- You did X. [1]"
        args, kwargs = mock_post.call_args
        assert args[0] == "https://api.anthropic.com/v1/messages"
        assert kwargs["headers"]["x-api-key"] == "sk-ant-key"
        assert kwargs["json"]["model"] == "claude-haiku-4-5-20251001"

    def test_returns_empty_on_non_200(self):
        mock_resp = MagicMock(status_code=429, text="rate limited")
        with patch("httpx.post", return_value=mock_resp):
            result = narrator._call_anthropic(
                "prompt", "sk-ant-key", model="claude-haiku-4-5-20251001"
            )
        assert result == ""

    def test_returns_empty_on_exception(self):
        with patch("httpx.post", side_effect=Exception("network down")):
            result = narrator._call_anthropic(
                "prompt", "sk-ant-key", model="claude-haiku-4-5-20251001"
            )
        assert result == ""

    def test_skips_non_text_content_blocks(self):
        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {
            "content": [
                {"type": "thinking", "thinking": "reasoning..."},
                {"type": "text", "text": "actual output"},
            ]
        }
        with patch("httpx.post", return_value=mock_resp):
            result = narrator._call_anthropic(
                "prompt", "sk-ant-key", model="claude-haiku-4-5-20251001"
            )
        assert result == "actual output"
