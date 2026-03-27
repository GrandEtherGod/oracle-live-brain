"""Unit tests for openclaw.memory — session and crystal persistence helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import openclaw.memory as memory


@pytest.fixture(autouse=True)
def _patch_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect all storage paths into a temporary directory."""
    monkeypatch.setattr(memory, "AUTODREAM_DIR", tmp_path / "autodream")
    monkeypatch.setattr(memory, "CRYSTALS_DIR", tmp_path / "crystals")


# ---------------------------------------------------------------------------
# Session persistence
# ---------------------------------------------------------------------------


class TestSessionPersistence:
    def test_load_nonexistent_returns_none(self) -> None:
        assert memory.load_session("ghost") is None

    def test_save_and_load_roundtrip(self) -> None:
        messages = [{"role": "user", "content": "hello"}]
        notes = [{"stored_at": "2026-01-01T00:00:00+00:00", "text": "hi"}]
        memory.save_session("s1", messages, notes)
        data = memory.load_session("s1")
        assert data is not None
        assert data["session_id"] == "s1"
        assert data["messages"] == messages
        assert data["notes"] == notes

    def test_save_preserves_created_at(self) -> None:
        memory.save_session("s1", [], [])
        first = memory.load_session("s1")
        assert first is not None
        created = first["created_at"]

        memory.save_session("s1", [{"role": "user", "content": "more"}], [])
        second = memory.load_session("s1")
        assert second is not None
        assert second["created_at"] == created

    def test_save_updates_updated_at(self) -> None:
        memory.save_session("s1", [], [])
        first = memory.load_session("s1")
        assert first is not None

        memory.save_session("s1", [], [])
        second = memory.load_session("s1")
        assert second is not None
        # updated_at must be present and a string
        assert isinstance(second["updated_at"], str)

    def test_list_session_ids_empty(self) -> None:
        assert memory.list_session_ids() == []

    def test_list_session_ids_returns_stems(self) -> None:
        memory.save_session("alpha", [], [])
        memory.save_session("beta", [], [])
        assert memory.list_session_ids() == ["alpha", "beta"]

    def test_save_creates_directory_if_missing(self, tmp_path: Path) -> None:
        deep = tmp_path / "deep" / "autodream"
        import openclaw.memory as m
        import importlib
        # Directly test mkdir by patching and calling save_session
        memory.AUTODREAM_DIR.mkdir(parents=True, exist_ok=True)
        memory.save_session("new", [], [])
        assert (memory.AUTODREAM_DIR / "new.json").exists()


class TestSessionSearch:
    def test_search_empty_dir_returns_empty_list(self) -> None:
        assert memory.search_sessions("anything") == []

    def test_search_finds_user_message(self) -> None:
        msgs = [{"role": "user", "content": "I use Python 3.12"}]
        memory.save_session("sess", msgs, [])
        results = memory.search_sessions("Python")
        assert len(results) == 1
        assert results[0]["session_id"] == "sess"
        assert "Python" in results[0]["context"]

    def test_search_finds_note(self) -> None:
        notes = [{"stored_at": "2026-01-01T00:00:00+00:00", "text": "favourite editor is vim"}]
        memory.save_session("sess", [], notes)
        results = memory.search_sessions("vim")
        assert len(results) == 1
        assert "vim" in results[0]["context"]

    def test_search_case_insensitive(self) -> None:
        msgs = [{"role": "user", "content": "I love RUST programming"}]
        memory.save_session("sess", msgs, [])
        results = memory.search_sessions("rust")
        assert len(results) == 1

    def test_search_no_match_returns_empty(self) -> None:
        msgs = [{"role": "user", "content": "Hello world"}]
        memory.save_session("sess", msgs, [])
        assert memory.search_sessions("xyzzy") == []

    def test_search_returns_one_match_per_session(self) -> None:
        msgs = [
            {"role": "user", "content": "Python is great"},
            {"role": "user", "content": "Python rules"},
        ]
        memory.save_session("sess", msgs, [])
        results = memory.search_sessions("Python")
        assert len(results) == 1

    def test_search_across_multiple_sessions(self) -> None:
        memory.save_session("a", [{"role": "user", "content": "docker tip"}], [])
        memory.save_session("b", [{"role": "user", "content": "docker tip"}], [])
        results = memory.search_sessions("docker")
        assert len(results) == 2


# ---------------------------------------------------------------------------
# Crystal persistence
# ---------------------------------------------------------------------------


class TestCrystalPersistence:
    def test_save_crystal_returns_uuid_string(self) -> None:
        cid = memory.save_crystal("s", "topic", "summary", [], [])
        assert isinstance(cid, str)
        assert len(cid) == 36  # UUID4 format

    def test_save_and_load_crystal_roundtrip(self) -> None:
        cid = memory.save_crystal(
            source_session="sess",
            topic="Python",
            summary="User likes Python",
            facts=["Prefers Python 3.12"],
            tags=["python"],
        )
        c = memory.load_crystal(cid)
        assert c is not None
        assert c["id"] == cid
        assert c["source_session"] == "sess"
        assert c["topic"] == "Python"
        assert c["summary"] == "User likes Python"
        assert c["facts"] == ["Prefers Python 3.12"]
        assert c["tags"] == ["python"]

    def test_load_nonexistent_crystal_returns_none(self) -> None:
        assert memory.load_crystal("00000000-0000-0000-0000-000000000000") is None

    def test_list_crystals_empty(self) -> None:
        assert memory.list_crystals() == []

    def test_list_crystals_all(self) -> None:
        memory.save_crystal("s", "A", "sum A", [], ["x"])
        memory.save_crystal("s", "B", "sum B", [], ["y"])
        crystals = memory.list_crystals()
        assert len(crystals) == 2

    def test_list_crystals_filtered_by_tag(self) -> None:
        memory.save_crystal("s", "A", "sum", [], ["python"])
        memory.save_crystal("s", "B", "sum", [], ["rust"])
        results = memory.list_crystals(tag="python")
        assert len(results) == 1
        assert results[0]["topic"] == "A"

    def test_list_crystals_tag_no_match(self) -> None:
        memory.save_crystal("s", "A", "sum", [], ["python"])
        assert memory.list_crystals(tag="go") == []

    def test_save_creates_crystals_directory(self) -> None:
        memory.save_crystal("s", "t", "sum", [], [])
        assert memory.CRYSTALS_DIR.exists()
