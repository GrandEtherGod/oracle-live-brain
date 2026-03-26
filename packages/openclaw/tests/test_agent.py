"""Unit tests for openclaw.agent.OpenClawAgent."""

import pytest

from openclaw.agent import OpenClawAgent
from openclaw.tools import Tool


class TestOpenClawAgentInit:
    def test_raises_without_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            OpenClawAgent(api_key=None)

    def test_init_with_explicit_key(self) -> None:
        agent = OpenClawAgent(api_key="test-key")
        assert agent.model == "claude-sonnet-4-6"
        assert agent.max_tokens == 2048
        assert agent._history == []

    def test_custom_model_and_tokens(self) -> None:
        agent = OpenClawAgent(api_key="test-key", model="claude-haiku-4-5-20251001", max_tokens=512)
        assert agent.model == "claude-haiku-4-5-20251001"
        assert agent.max_tokens == 512

    def test_reset_clears_history(self) -> None:
        agent = OpenClawAgent(api_key="test-key")
        agent._history.append({"role": "user", "content": "hello"})
        agent.reset()
        assert agent._history == []

    def test_tool_registry_starts_empty(self) -> None:
        agent = OpenClawAgent(api_key="test-key")
        assert agent.tools.definitions() == []


class TestOpenClawAgentToolRegistration:
    def test_subclass_registers_tools(self) -> None:
        class EchoAgent(OpenClawAgent):
            def _register_tools(self) -> None:
                self.tools.register(Tool("echo", "Echo.", {}, handler=lambda text: text))

        agent = EchoAgent(api_key="test-key")
        defs = agent.tools.definitions()
        assert len(defs) == 1
        assert defs[0]["name"] == "echo"

    def test_tool_execution_via_registry(self) -> None:
        class CalcAgent(OpenClawAgent):
            def _register_tools(self) -> None:
                self.tools.register(Tool("add", "Add.", {}, handler=lambda a, b: a + b))

        agent = CalcAgent(api_key="test-key")
        result = agent.tools.execute("add", {"a": 3, "b": 4})
        assert result == 7
