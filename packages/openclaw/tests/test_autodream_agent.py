"""Unit tests for AutoDreamAgent.

All tests avoid live Claude API calls.  The _build_agent factory is patched
where needed, and tool handlers are exercised directly via tools.execute().
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import openclaw.memory as memory
from openclaw.agents.autodream import AutoDreamAgent


@pytest.fixture(autouse=True)
def _patch_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(memory, "AUTODREAM_DIR", tmp_path / "autodream")
    monkeypatch.setattr(memory, "CRYSTALS_DIR", tmp_path / "crystals")


@pytest.fixture()
def agent() -> AutoDreamAgent:
    with patch("openclaw.agent.anthropic.Anthropic"):
        return AutoDreamAgent(api_key="test-key", session_id="test")


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------


class TestAutoDreamAgentInit:
    def test_default_session_id(self) -> None:
        with patch("openclaw.agent.anthropic.Anthropic"):
            a = AutoDreamAgent(api_key="k")
        assert a.session_id == "default"

    def test_custom_session_id(self) -> None:
        with patch("openclaw.agent.anthropic.Anthropic"):
            a = AutoDreamAgent(api_key="k", session_id="my-session")
        assert a.session_id == "my-session"

    def test_loads_existing_session_on_init(self, tmp_path: Path) -> None:
        messages = [{"role": "user", "content": "remembered"}]
        notes = [{"stored_at": "2026-01-01T00:00:00+00:00", "text": "note A"}]
        memory.save_session("existing", messages, notes)

        with patch("openclaw.agent.anthropic.Anthropic"):
            a = AutoDreamAgent(api_key="k", session_id="existing")

        assert a._history == messages
        assert a._notes == notes

    def test_does_not_crash_if_session_missing(self) -> None:
        with patch("openclaw.agent.anthropic.Anthropic"):
            a = AutoDreamAgent(api_key="k", session_id="no-such-session")
        assert a._history == []
        assert a._notes == []


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------


class TestAutoDreamTools:
    def test_has_recall_memory_tool(self, agent: AutoDreamAgent) -> None:
        names = [t["name"] for t in agent.tools.definitions()]
        assert "recall_memory" in names

    def test_has_store_memory_tool(self, agent: AutoDreamAgent) -> None:
        names = [t["name"] for t in agent.tools.definitions()]
        assert "store_memory" in names

    def test_has_list_sessions_tool(self, agent: AutoDreamAgent) -> None:
        names = [t["name"] for t in agent.tools.definitions()]
        assert "list_sessions" in names

    def test_has_speak_tool(self, agent: AutoDreamAgent) -> None:
        names = [t["name"] for t in agent.tools.definitions()]
        assert "speak" in names


# ---------------------------------------------------------------------------
# Tool handlers (exercised via tools.execute)
# ---------------------------------------------------------------------------


class TestAutoDreamToolHandlers:
    def test_recall_memory_returns_no_results_message_when_empty(
        self, agent: AutoDreamAgent
    ) -> None:
        result = agent.tools.execute("recall_memory", {"query": "xyz"})
        assert "No past sessions" in result

    def test_recall_memory_finds_stored_note(self, agent: AutoDreamAgent) -> None:
        memory.save_session(
            "test",
            [],
            [{"stored_at": "2026-01-01T00:00:00+00:00", "text": "I love pytest"}],
        )
        result = agent.tools.execute("recall_memory", {"query": "pytest"})
        parsed = json.loads(result)
        assert len(parsed) == 1
        assert "pytest" in parsed[0]["context"]

    def test_store_memory_appends_to_notes(self, agent: AutoDreamAgent) -> None:
        assert len(agent._notes) == 0
        agent.tools.execute("store_memory", {"note": "user prefers dark mode"})
        assert len(agent._notes) == 1
        assert agent._notes[0]["text"] == "user prefers dark mode"

    def test_store_memory_returns_confirmation(self, agent: AutoDreamAgent) -> None:
        result = agent.tools.execute("store_memory", {"note": "my note"})
        assert "my note" in result

    def test_list_sessions_returns_no_sessions_message_when_empty(
        self, agent: AutoDreamAgent
    ) -> None:
        result = agent.tools.execute("list_sessions", {})
        assert "No sessions" in result

    def test_list_sessions_returns_ids(self, agent: AutoDreamAgent) -> None:
        memory.save_session("alpha", [], [])
        memory.save_session("test", [], [])
        result = agent.tools.execute("list_sessions", {})
        assert "alpha" in result
        assert "test" in result

    def test_speak_returns_text(self, agent: AutoDreamAgent) -> None:
        result = agent.tools.execute("speak", {"text": "hello"})
        assert result == "hello"


# ---------------------------------------------------------------------------
# reset()
# ---------------------------------------------------------------------------


class TestAutoDreamReset:
    def test_reset_clears_history_and_notes(self, agent: AutoDreamAgent) -> None:
        agent._history = [{"role": "user", "content": "hi"}]
        agent._notes = [{"stored_at": "now", "text": "note"}]
        agent.reset()
        assert agent._history == []
        assert agent._notes == []

    def test_reset_saves_cleared_state_to_disk(self, agent: AutoDreamAgent) -> None:
        agent._history = [{"role": "user", "content": "hi"}]
        agent._notes = [{"stored_at": "now", "text": "note"}]
        agent.reset()
        data = memory.load_session("test")
        assert data is not None
        assert data["messages"] == []
        assert data["notes"] == []


# ---------------------------------------------------------------------------
# run() persistence guarantee
# ---------------------------------------------------------------------------


class TestAutoDreamRunPersists:
    def test_run_saves_session_on_success(self, agent: AutoDreamAgent) -> None:
        with patch.object(
            agent.__class__.__bases__[0],  # OpenClawAgent
            "run",
            return_value={"tool": "speak", "result": "ok"},
        ):
            agent.run("hello")

        data = memory.load_session("test")
        assert data is not None  # file was written

    def test_run_saves_session_even_on_exception(self, agent: AutoDreamAgent) -> None:
        agent._history = [{"role": "user", "content": "pre-existing"}]

        with patch.object(
            agent.__class__.__bases__[0],
            "run",
            side_effect=RuntimeError("boom"),
        ):
            with pytest.raises(RuntimeError):
                agent.run("crash me")

        # Despite the exception, _save_session() ran via finally.
        data = memory.load_session("test")
        assert data is not None
