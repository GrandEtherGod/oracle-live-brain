"""Tests for AutoCrystalizeAgent."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import openclaw.memory as mem
from openclaw.agents.autocrystalize import AutoCrystalizeAgent
from openclaw.memory import DreamEntry


def _mock_dream_response(payload: dict[str, Any]) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = json.dumps(payload)
    response = MagicMock()
    response.content = [block]
    response.stop_reason = "end_turn"
    return response


def _sample_dream(id_: str = "d001") -> DreamEntry:
    return DreamEntry(
        id=id_,
        timestamp="2026-01-01T00:00:00+00:00",
        summary="Session summary.",
        key_insights=["insight"],
        topics=["topic"],
        commands_run=[],
        session_duration_s=1.0,
    )


@pytest.fixture()
def agent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AutoCrystalizeAgent:
    monkeypatch.setattr(mem, "_dreams_path", lambda: tmp_path / "dreams.jsonl")
    monkeypatch.setattr(mem, "_crystals_dir", lambda: tmp_path / "crystals")
    with patch("openclaw.agents.autodream.anthropic.Anthropic") as MockClient:
        MockClient.return_value = MagicMock()
        return AutoCrystalizeAgent(api_key="test-key")


class TestAutoCrystalizeAgentCrystalize:
    def test_returns_none_when_no_dreams(self, agent: AutoCrystalizeAgent, tmp_path: Path) -> None:
        assert agent.crystalize() is None

    def test_calls_claude_and_writes_crystal(
        self, agent: AutoCrystalizeAgent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pre-populate two dreams — patch where autocrystalize imported read_dreams
        import openclaw.agents.autocrystalize as ac_mod
        monkeypatch.setattr(ac_mod, "read_dreams", lambda: [_sample_dream("d001"), _sample_dream("d002")])

        crystal_payload = {
            "title": "Test Crystal",
            "content": "Multi-paragraph content.",
            "key_facts": ["fact 1", "fact 2"],
        }
        agent._client.messages.create.return_value = _mock_dream_response(crystal_payload)  # type: ignore[attr-defined]

        crystal = agent.crystalize()

        assert crystal is not None
        assert crystal.title == "Test Crystal"
        assert crystal.version == 1
        assert set(crystal.source_dream_ids) == {"d001", "d002"}

    def test_crystal_file_written(
        self, agent: AutoCrystalizeAgent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import openclaw.agents.autocrystalize as ac_mod
        crystals_dir = tmp_path / "crystals"
        crystals_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(ac_mod, "read_dreams", lambda: [_sample_dream()])
        monkeypatch.setattr(mem, "_crystals_dir", lambda: crystals_dir)

        crystal_payload = {"title": "T", "content": "C", "key_facts": ["f"]}
        agent._client.messages.create.return_value = _mock_dream_response(crystal_payload)  # type: ignore[attr-defined]

        agent.crystalize()

        crystal_files = list(crystals_dir.glob("crystal_*.json"))
        assert len(crystal_files) == 1
        data = json.loads(crystal_files[0].read_text())
        assert data["title"] == "T"

    def test_version_increments(
        self, agent: AutoCrystalizeAgent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import openclaw.agents.autocrystalize as ac_mod
        crystals_dir = tmp_path / "crystals"
        crystals_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(mem, "_crystals_dir", lambda: crystals_dir)
        monkeypatch.setattr(ac_mod, "read_dreams", lambda: [_sample_dream()])

        crystal_payload = {"title": "T", "content": "C", "key_facts": []}
        agent._client.messages.create.return_value = _mock_dream_response(crystal_payload)  # type: ignore[attr-defined]

        c1 = agent.crystalize()
        c2 = agent.crystalize()

        assert c1 is not None
        assert c2 is not None
        assert c2.version == c1.version + 1

    def test_reset_triggers_crystalize_at_threshold(
        self, agent: AutoCrystalizeAgent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agent.AUTO_CRYSTALIZE_THRESHOLD = 2

        # dream() call needs a response
        dream_payload = {
            "summary": "S",
            "key_insights": [],
            "topics": [],
            "commands_run": [],
        }
        crystal_payload = {"title": "C", "content": "Content.", "key_facts": []}

        # First call (dream), second call (crystalize)
        agent._client.messages.create.side_effect = [  # type: ignore[attr-defined]
            _mock_dream_response(dream_payload),
            _mock_dream_response(crystal_payload),
        ]

        # Provide 2 dreams so threshold is met — patch where autocrystalize imported it
        import openclaw.agents.autocrystalize as ac_mod
        monkeypatch.setattr(ac_mod, "read_dreams", lambda: [_sample_dream("d1"), _sample_dream("d2")])

        agent._history = [{"role": "user", "content": "test"}]
        agent.reset()

        # Both dream and crystalize should have been called
        assert agent._client.messages.create.call_count == 2  # type: ignore[attr-defined]

    def test_reset_does_not_crystalize_below_threshold(
        self, agent: AutoCrystalizeAgent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agent.AUTO_CRYSTALIZE_THRESHOLD = 5

        dream_payload = {
            "summary": "S",
            "key_insights": [],
            "topics": [],
            "commands_run": [],
        }
        agent._client.messages.create.return_value = _mock_dream_response(dream_payload)  # type: ignore[attr-defined]

        monkeypatch.setattr(mem, "read_dreams", lambda: [_sample_dream()])  # only 1 dream

        agent._history = [{"role": "user", "content": "test"}]
        agent.reset()

        # Only dream() called, not crystalize()
        assert agent._client.messages.create.call_count == 1  # type: ignore[attr-defined]
