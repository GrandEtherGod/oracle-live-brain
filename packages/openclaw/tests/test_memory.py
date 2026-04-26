"""Tests for openclaw.memory — I/O primitives for AutoDream + AutoCrystalize."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import openclaw.memory as mem
from openclaw.memory import (
    CrystalEntry,
    DreamEntry,
    append_dream,
    next_crystal_version,
    read_dreams,
    write_crystal,
)


def _make_dream(id_: str = "abc123") -> DreamEntry:
    return DreamEntry(
        id=id_,
        timestamp="2026-01-01T00:00:00+00:00",
        summary="Test session summary.",
        key_insights=["insight 1", "insight 2"],
        topics=["testing"],
        commands_run=["echo hello"],
        session_duration_s=1.5,
    )


def _make_crystal(version: int = 1) -> CrystalEntry:
    return CrystalEntry(
        version=version,
        timestamp="2026-01-01T00:00:00+00:00",
        title="Test Crystal",
        content="Synthesized content.",
        key_facts=["fact 1", "fact 2"],
        source_dream_ids=["abc123"],
    )


# ---------------------------------------------------------------------------
# Dreams I/O
# ---------------------------------------------------------------------------


class TestAppendDream:
    def test_creates_file_and_directory(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams" / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)
        assert not target.parent.exists()

        append_dream(_make_dream())

        assert target.parent.exists()
        assert target.exists()

    def test_appends_correct_json(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        entry = _make_dream("id001")
        append_dream(entry)

        lines = target.read_text().strip().splitlines()
        assert len(lines) == 1
        parsed = json.loads(lines[0])
        assert parsed["id"] == "id001"
        assert parsed["summary"] == "Test session summary."

    def test_multiple_appends(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        append_dream(_make_dream("id001"))
        append_dream(_make_dream("id002"))

        lines = target.read_text().strip().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[1])["id"] == "id002"


class TestReadDreams:
    def test_returns_empty_list_when_file_missing(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "nonexistent.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        assert read_dreams() == []

    def test_round_trips_dream_entry(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        entry = _make_dream("round001")
        append_dream(entry)

        results = read_dreams()
        assert len(results) == 1
        assert results[0].id == "round001"
        assert results[0].topics == ["testing"]

    def test_skips_malformed_lines(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        target.write_text('{"broken": true}\n' + json.dumps({
            "id": "good001", "timestamp": "t", "summary": "s",
            "key_insights": [], "topics": [], "commands_run": [], "session_duration_s": 0.0
        }) + "\n")

        results = read_dreams()
        assert len(results) == 1
        assert results[0].id == "good001"

    def test_skips_empty_lines(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        target = tmp_path / "dreams.jsonl"
        monkeypatch.setattr(mem, "_dreams_path", lambda: target)

        entry = _make_dream("skip001")
        append_dream(entry)
        target.write_text(target.read_text() + "\n\n")

        results = read_dreams()
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Crystals I/O
# ---------------------------------------------------------------------------


class TestNextCrystalVersion:
    def test_returns_one_when_no_crystals(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        assert next_crystal_version() == 1

    def test_returns_max_plus_one(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        (tmp_path / "crystal_1.json").write_text("{}")
        (tmp_path / "crystal_3.json").write_text("{}")
        assert next_crystal_version() == 4

    def test_ignores_non_crystal_files(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        (tmp_path / "other.json").write_text("{}")
        assert next_crystal_version() == 1


class TestWriteCrystal:
    def test_creates_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        entry = _make_crystal(version=1)
        result = write_crystal(entry)
        assert result is not None
        path, _ = result
        assert path.exists()

    def test_file_contains_valid_json(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        entry = _make_crystal(version=1)
        result = write_crystal(entry)
        assert result is not None
        path, persisted = result
        data = json.loads(path.read_text())
        assert data["title"] == "Test Crystal"
        assert data["version"] == 1
        assert persisted.version == 1

    def test_version_increments_correctly(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        write_crystal(_make_crystal(version=1))
        write_crystal(_make_crystal(version=2))
        files = sorted(tmp_path.glob("crystal_*.json"))
        assert len(files) == 2
        assert files[0].name == "crystal_1.json"
        assert files[1].name == "crystal_2.json"

    def test_returns_none_when_all_slots_occupied(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path)
        for i in range(1, 6):
            (tmp_path / f"crystal_{i}.json").write_text("{}")
        result = write_crystal(_make_crystal(version=1))
        assert result is None
