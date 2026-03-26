"""Unit tests for AutoCrystalizeAgent."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import openclaw.memory as memory
from openclaw.agents.autocrystalize import AutoCrystalizeAgent
from openclaw.agents.autodream import AutoDreamAgent


@pytest.fixture(autouse=True)
def _patch_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(memory, "AUTODREAM_DIR", tmp_path / "autodream")
    monkeypatch.setattr(memory, "CRYSTALS_DIR", tmp_path / "crystals")


@pytest.fixture()
def agent() -> AutoCrystalizeAgent:
    with patch("openclaw.agent.anthropic.Anthropic"):
        return AutoCrystalizeAgent(api_key="test-key", session_id="test")


# ---------------------------------------------------------------------------
# Initialisation / inheritance
# ---------------------------------------------------------------------------


class TestAutoCrystalizeAgentInit:
    def test_inherits_from_autodream(self, agent: AutoCrystalizeAgent) -> None:
        assert isinstance(agent, AutoDreamAgent)

    def test_has_autodream_tools(self, agent: AutoCrystalizeAgent) -> None:
        names = {t["name"] for t in agent.tools.definitions()}
        assert {"recall_memory", "store_memory", "list_sessions", "speak"} <= names

    def test_has_crystallize_tool(self, agent: AutoCrystalizeAgent) -> None:
        names = {t["name"] for t in agent.tools.definitions()}
        assert "crystallize" in names

    def test_has_list_crystals_tool(self, agent: AutoCrystalizeAgent) -> None:
        names = {t["name"] for t in agent.tools.definitions()}
        assert "list_crystals" in names

    def test_has_recall_crystal_tool(self, agent: AutoCrystalizeAgent) -> None:
        names = {t["name"] for t in agent.tools.definitions()}
        assert "recall_crystal" in names


# ---------------------------------------------------------------------------
# crystallize handler
# ---------------------------------------------------------------------------


def _fake_response(json_payload: str) -> MagicMock:
    """Build a minimal fake Anthropic API response containing json_payload."""
    block = SimpleNamespace(text=json_payload)
    response = MagicMock()
    response.content = [block]
    return response


class TestCrystallizeHandler:
    def test_crystallize_empty_history_returns_message(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        agent._history = []
        result = agent._crystallize("Python")
        assert "No session history" in result

    def test_crystallize_calls_client_and_saves_crystal(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        agent._history = [{"role": "user", "content": "I use Python 3.12"}]
        payload = json.dumps({
            "summary": "User uses Python 3.12",
            "facts": ["Uses Python 3.12"],
            "tags": ["python"],
        })
        agent._client.messages.create.return_value = _fake_response(payload)

        result = agent._crystallize("Python")

        assert "Crystal created" in result
        assert "Python" in result
        # Verify a crystal was actually saved.
        crystals = memory.list_crystals()
        assert len(crystals) == 1
        assert crystals[0]["topic"] == "Python"
        assert crystals[0]["facts"] == ["Uses Python 3.12"]

    def test_crystallize_strips_markdown_fences(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        agent._history = [{"role": "user", "content": "I use Go"}]
        payload = '```json\n{"summary":"Go user","facts":["Uses Go"],"tags":["go"]}\n```'
        agent._client.messages.create.return_value = _fake_response(payload)

        result = agent._crystallize("Go")
        assert "Crystal created" in result

    def test_crystallize_invalid_json_response_returns_error(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        agent._history = [{"role": "user", "content": "something"}]
        agent._client.messages.create.return_value = _fake_response("not valid json {")

        result = agent._crystallize("topic")
        assert "Failed to parse" in result


# ---------------------------------------------------------------------------
# list_crystals handler
# ---------------------------------------------------------------------------


class TestListCrystalsHandler:
    def test_list_crystals_empty_returns_no_crystals_message(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        result = agent._list_crystals()
        assert "No crystals found" in result

    def test_list_crystals_all_shows_each_crystal(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        memory.save_crystal("s", "Python", "sum", [], ["python"])
        memory.save_crystal("s", "Rust", "sum", [], ["rust"])
        result = agent._list_crystals()
        assert "Python" in result
        assert "Rust" in result

    def test_list_crystals_filtered_by_tag(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        memory.save_crystal("s", "Python", "sum", [], ["python"])
        memory.save_crystal("s", "Rust", "sum", [], ["rust"])
        result = agent._list_crystals(tag="python")
        assert "Python" in result
        assert "Rust" not in result

    def test_list_crystals_tag_no_match_message(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        memory.save_crystal("s", "Python", "sum", [], ["python"])
        result = agent._list_crystals(tag="go")
        assert "No crystals found" in result
        assert "go" in result


# ---------------------------------------------------------------------------
# recall_crystal handler
# ---------------------------------------------------------------------------


class TestRecallCrystalHandler:
    def test_recall_crystal_not_found_returns_error(
        self, agent: AutoCrystalizeAgent
    ) -> None:
        result = agent._recall_crystal("00000000-0000-0000-0000-000000000000")
        assert "not found" in result.lower()

    def test_recall_crystal_returns_json(self, agent: AutoCrystalizeAgent) -> None:
        cid = memory.save_crystal("s", "topic", "sum", ["fact"], ["tag"])
        result = agent._recall_crystal(cid)
        data = json.loads(result)
        assert data["id"] == cid
        assert data["topic"] == "topic"


# ---------------------------------------------------------------------------
# _serialize_history_for_crystallization
# ---------------------------------------------------------------------------


class TestSerializeHistory:
    def test_serialize_empty_history(self, agent: AutoCrystalizeAgent) -> None:
        agent._history = []
        assert agent._serialize_history_for_crystallization() == ""

    def test_serialize_user_string_message(self, agent: AutoCrystalizeAgent) -> None:
        agent._history = [{"role": "user", "content": "hello world"}]
        text = agent._serialize_history_for_crystallization()
        assert "user: hello world" in text

    def test_serialize_assistant_text_block(self, agent: AutoCrystalizeAgent) -> None:
        agent._history = [
            {"role": "assistant", "content": [{"type": "text", "text": "sure thing"}]}
        ]
        text = agent._serialize_history_for_crystallization()
        assert "sure thing" in text

    def test_serialize_tool_use_block(self, agent: AutoCrystalizeAgent) -> None:
        agent._history = [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "name": "speak", "input": {"text": "hi"}}
                ],
            }
        ]
        text = agent._serialize_history_for_crystallization()
        assert "tool:speak" in text

    def test_serialize_tool_result_block(self, agent: AutoCrystalizeAgent) -> None:
        agent._history = [
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "x", "content": "result text"}
                ],
            }
        ]
        text = agent._serialize_history_for_crystallization()
        assert "result text" in text
