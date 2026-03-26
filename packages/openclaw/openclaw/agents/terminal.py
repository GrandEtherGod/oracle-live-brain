"""TerminalAgent — executes shell commands via Claude tool use.

This agent mirrors the ``run_command`` / ``speak`` tool pair from the
TypeScript voice terminal backend (``src/terminal/server/claude.ts``),
making the same behaviour available as an importable Python agent.
"""

from __future__ import annotations

import shlex
import subprocess

from ..agent import OpenClawAgent
from ..tools import Tool


class TerminalAgent(OpenClawAgent):
    """Agent that can execute shell commands in the local environment.

    Tools registered:

    * ``run_command`` — run a shell command and return its stdout/stderr
    * ``speak`` — return a plain-text response without running a command
    """

    system_prompt = (
        "You are AetherLink Terminal, an AI agent embedded in a live terminal. "
        "You help users run shell commands, inspect files, and automate development tasks. "
        "Use run_command to execute commands. "
        "Use speak to answer questions or explain results. "
        "Keep spoken responses brief — 1-3 sentences."
    )

    def _register_tools(self) -> None:
        self.tools.register(
            Tool(
                name="run_command",
                description=(
                    "Execute a shell command and return its output. "
                    'Use for requests like "list files", "show git status", "run tests", etc.'
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": 'The shell command to run (e.g. "ls -la", "git status")',
                        },
                        "cwd": {
                            "type": "string",
                            "description": "Working directory for the command (optional)",
                        },
                    },
                    "required": ["command"],
                },
                handler=self._run_command,
            )
        )
        self.tools.register(
            Tool(
                name="speak",
                description=(
                    "Send a plain-text response to the user without running a command. "
                    "Use to answer questions, acknowledge requests, or explain output."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "The text to return to the user",
                        }
                    },
                    "required": ["text"],
                },
                handler=lambda text: text,
            )
        )

    @staticmethod
    def _run_command(command: str, cwd: str | None = None) -> str:
        """Run *command* in a subprocess and return combined stdout/stderr."""
        try:
            result = subprocess.run(
                shlex.split(command),
                capture_output=True,
                text=True,
                timeout=30,
                cwd=cwd,
            )
            output = (result.stdout + result.stderr).strip()
            return output or "(no output)"
        except subprocess.TimeoutExpired:
            return "Command timed out after 30 seconds"
        except FileNotFoundError:
            return f"Command not found: {shlex.split(command)[0]}"
        except Exception as exc:  # noqa: BLE001
            return f"Error running command: {exc}"
