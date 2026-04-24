"""Tests for Track D.3 — manual_project deterministic daily-report draft."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from consolidation.manual_project import ManualProjectConsolidator  # noqa: E402


def _seg(summary: str, window: str = "Cursor", ts: str = "2026-04-24T10:00:00") -> dict:
    return {
        "id": "s1", "summary": summary, "window": window,
        "platform": "macOS", "duration_secs": 60, "worker": "human",
        "timestamp_start": ts,
    }


@pytest.fixture
def consolidator(tmp_path):
    """Consolidator with a real sqlite DB so project-name lookups work."""
    import sqlite3
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO projects VALUES ('p1', 'Test Project')")
    conn.commit()
    conn.close()

    db = MagicMock()
    db.db_path = str(db_path)
    return ManualProjectConsolidator(db, hyperparams={})


class TestDispatch:
    def test_default_is_deterministic(self, consolidator):
        segs = [_seg("Drafted the outreach email to CISO")]
        with patch("httpx.post") as mock_post:
            out = consolidator.draft_summary("p1", "2026-04-24", segs)
        mock_post.assert_not_called()
        assert "### Accomplishments" in out
        assert "### Decisions" in out
        assert "### Open items" in out

    def test_empty_segments_returns_empty(self, consolidator):
        out = consolidator.draft_summary("p1", "2026-04-24", [])
        assert out == ""

    def test_flag_true_routes_to_llm(self, tmp_path):
        import sqlite3
        db_path = tmp_path / "t.db"
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)")
        conn.execute("INSERT INTO projects VALUES ('p1', 'X')")
        conn.commit()
        conn.close()
        db = MagicMock(); db.db_path = str(db_path)
        c = ManualProjectConsolidator(
            db, hyperparams={"manual_project_use_llm": True, "use_local": True},
        )
        with patch.object(c, "_call_ollama", return_value="### LLM output") as mock_llm:
            out = c.draft_summary("p1", "2026-04-24", [_seg("x")])
        mock_llm.assert_called_once()
        assert out == "### LLM output"


class TestAccomplishments:
    def test_outcome_verb_lead_captured(self, consolidator):
        segs = [
            _seg("Drafted the outreach email"),
            _seg("Fixed the flaky CI test"),
        ]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        assert "Drafted the outreach email" in out
        assert "Fixed the flaky CI test" in out

    def test_completion_phrase_captured(self, consolidator):
        segs = [_seg("User completed the migration for module X")]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        assert "completed the migration" in out.lower()

    def test_dedupes_repeated_accomplishments(self, consolidator):
        segs = [_seg("Drafted the email"), _seg("Drafted the email")]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        assert out.lower().count("drafted the email") == 1

    def test_none_when_no_matches(self, consolidator):
        segs = [_seg("Reading a blog post about Kubernetes")]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        acc_block = out.split("### Accomplishments\n", 1)[1].split("###", 1)[0]
        assert "_None_" in acc_block


class TestDecisions:
    def test_decision_verbs_captured(self, consolidator):
        segs = [
            _seg("Decided to use Claude Haiku for narrator"),
            _seg("Chose qwen2.5 as local fallback"),
            _seg("Rejected the proposal for a full rewrite"),
        ]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        dec_block = out.split("### Decisions\n", 1)[1].split("###", 1)[0]
        assert "Claude Haiku" in dec_block
        assert "qwen2.5" in dec_block
        assert "rewrite" in dec_block.lower()


class TestOpenItems:
    def test_todo_pattern_captured(self, consolidator):
        segs = [
            _seg("TODO wire up the dHash buffer"),
            _seg("Need to review the PR tomorrow"),
            _seg("Stuck on the embedding dimension mismatch"),
        ]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        open_block = out.split("### Open items\n", 1)[1]
        assert "dHash buffer" in open_block
        assert "PR tomorrow" in open_block
        assert "dimension mismatch" in open_block


class TestCapPerSection:
    def test_max_5_bullets_per_section(self, consolidator):
        segs = [
            _seg(f"Drafted proposal number {i}")
            for i in range(10)
        ]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        acc_block = out.split("### Accomplishments\n", 1)[1].split("###", 1)[0]
        bullet_count = sum(1 for line in acc_block.splitlines() if line.startswith("- "))
        assert bullet_count <= 5


class TestMultiSectionClassification:
    def test_sentence_can_hit_multiple_sections(self, consolidator):
        """A sentence like 'Decided to fix the bug' matches both decision
        (decided) and open-items (bug). Triager is not mutually exclusive."""
        segs = [_seg("Decided to fix the bug in auth module")]
        out = consolidator.draft_summary("p1", "2026-04-24", segs)
        # Decision fires on "decided"
        dec_block = out.split("### Decisions\n", 1)[1].split("###", 1)[0]
        assert "fix the bug" in dec_block.lower()
        # Open items fires on "bug"
        open_block = out.split("### Open items\n", 1)[1]
        assert "bug" in open_block.lower()
