"""Unit tests for openclaw.agents.terminal.TerminalAgent."""

import pytest

from openclaw.agents.terminal import TerminalAgent


class TestTerminalAgentTools:
    @pytest.fixture()
    def agent(self) -> TerminalAgent:
        return TerminalAgent(api_key="test-key")

    def test_has_run_command_tool(self, agent: TerminalAgent) -> None:
        names = {d["name"] for d in agent.tools.definitions()}
        assert "run_command" in names

    def test_has_speak_tool(self, agent: TerminalAgent) -> None:
        names = {d["name"] for d in agent.tools.definitions()}
        assert "speak" in names

    def test_run_command_echo(self, agent: TerminalAgent) -> None:
        output = agent.tools.execute("run_command", {"command": "echo hello"})
        assert output == "hello"

    def test_run_command_captures_stderr(self, agent: TerminalAgent) -> None:
        output = agent.tools.execute("run_command", {"command": "ls /nonexistent_path_xyz"})
        assert output  # some error message returned

    def test_run_command_not_found(self, agent: TerminalAgent) -> None:
        output = agent.tools.execute("run_command", {"command": "nonexistent_command_xyz_abc"})
        assert "not found" in output.lower() or "error" in output.lower()

    def test_run_command_with_cwd(self, agent: TerminalAgent, tmp_path) -> None:
        output = agent.tools.execute("run_command", {"command": "pwd", "cwd": str(tmp_path)})
        assert str(tmp_path) in output

    def test_speak_returns_text(self, agent: TerminalAgent) -> None:
        output = agent.tools.execute("speak", {"text": "Hello, world!"})
        assert output == "Hello, world!"

    def test_run_command_no_output(self, agent: TerminalAgent) -> None:
        output = agent.tools.execute("run_command", {"command": "true"})
        assert output == "(no output)"
