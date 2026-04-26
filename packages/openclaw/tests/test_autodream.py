"""Tests for AutoDreamAgent."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import openclaw.memory as mem
from openclaw.agents.autodream import AutoDreamAgent


def _mock_claude_response(payload: dict[str, Any]) -> MagicMock:
    """Build a mock Anthropic messages.create() response."""
    block = MagicMock()
    block.type = "text"
    block.text = json.dumps(payload)
    response = MagicMock()
    response.content = [block]
    response.stop_reason = "end_turn"
    return response


@pytest.fixture()
def agent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AutoDreamAgent:
    monkeypatch.setattr(mem, "_dreams_path", lambda: tmp_path / "dreams.jsonl")
    with patch("openclaw.agents.autodream.anthropic.Anthropic") as MockClient:
        MockClient.return_value = MagicMock()
        return AutoDreamAgent(api_key="test-key")


class TestAutoDreamAgentDream:
    def test_returns_none_on_empty_history(self, agent: AutoDreamAgent) -> None:
        assert agent.dream() is None

    def test_calls_claude_and_returns_entry(self, agent: AutoDreamAgent, tmp_path: Path) -> None:
        # Put something in history
        agent._history = [{"role": "user", "content": "hello"}]
        payload = {
            "summary": "User said hello.",
            "key_insights": ["The user greeted the agent."],
            "topics": ["greeting"],
            "commands_run": [],
        }
        agent._client.messages.create.return_value = _mock_claude_response(payload)  # type: ignore[attr-defined]

        entry = agent.dream()

        assert entry is not None
        assert entry.summary == "User said hello."
        assert entry.topics == ["greeting"]
        assert entry.session_duration_s >= 0

    def test_writes_jsonl_entry(self, agent: AutoDreamAgent, tmp_path: Path) -> None:
        agent._history = [{"role": "user", "content": "run ls"}]
        payload = {
            "summary": "Ran ls.",
            "key_insights": ["Listed files."],
            "topics": ["filesystem"],
            "commands_run": ["ls"],
        }
        agent._client.messages.create.return_value = _mock_claude_response(payload)  # type: ignore[attr-defined]

        agent.dream()

        dreams_file = tmp_path / "dreams.jsonl"
        assert dreams_file.exists()
        lines = [line for line in dreams_file.read_text().splitlines() if line.strip()]
        assert len(lines) == 1
        data = json.loads(lines[0])
        assert data["commands_run"] == ["ls"]

    def test_dream_called_on_reset(self, agent: AutoDreamAgent) -> None:
        agent._history = [{"role": "user", "content": "test"}]
        payload = {
            "summary": "Test.",
            "key_insights": [],
            "topics": [],
            "commands_run": [],
        }
        agent._client.messages.create.return_value = _mock_claude_response(payload)  # type: ignore[attr-defined]

        agent.reset()

        agent._client.messages.create.assert_called_once()  # type: ignore[attr-defined]
        assert agent._history == []

    def test_dream_returns_none_on_api_error(self, agent: AutoDreamAgent) -> None:
        import anthropic as anthropic_module

        agent._history = [{"role": "user", "content": "test"}]
        agent._client.messages.create.side_effect = anthropic_module.APIConnectionError(  # type: ignore[attr-defined]
            request=MagicMock()
        )

        result = agent.dream()
        assert result is None

    def test_dream_returns_none_on_json_error(self, agent: AutoDreamAgent) -> None:
        block = MagicMock()
        block.type = "text"
        block.text = "this is not json"
        response = MagicMock()
        response.content = [block]
        agent._client.messages.create.return_value = response  # type: ignore[attr-defined]

        agent._history = [{"role": "user", "content": "test"}]
        result = agent.dream()
        assert result is None
