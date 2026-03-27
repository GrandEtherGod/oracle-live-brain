"""Base OpenClaw agent using Claude AI with tool use."""

from __future__ import annotations

import os
import time
from typing import Any

import anthropic

from .tools import ToolRegistry

DEFAULT_MODEL = "claude-sonnet-4-6"


class OpenClawAgent:
    """Base class for all OpenClaw agents.

    Provides the Claude AI tool-use loop, conversation history management,
    and a pluggable :class:`~openclaw.tools.ToolRegistry`.

    Subclasses should override :attr:`system_prompt` and
    :meth:`_register_tools` to define agent behaviour.

    Example::

        class MyAgent(OpenClawAgent):
            system_prompt = "You are a helpful assistant. Always use a tool."

            def _register_tools(self) -> None:
                self.tools.register(
                    Tool("echo", "Echo text back.", {...}, lambda text: text)
                )

        agent = MyAgent(api_key="sk-...")
        result = agent.run("echo hello")
        print(result["result"])  # hello
    """

    system_prompt: str = (
        "You are an OpenClaw agent running inside AetherLinkOS. "
        "You help users automate tasks using your available tools. "
        "Always use a tool to respond — never reply with plain text."
    )

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 2048,
    ) -> None:
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not resolved_key:
            raise ValueError(
                "ANTHROPIC_API_KEY must be set in the environment or passed as api_key="
            )
        self._client = anthropic.Anthropic(api_key=resolved_key)
        self.model = model
        self.max_tokens = max_tokens
        self._history: list[anthropic.types.MessageParam] = []
        self._session_start: float = time.monotonic()
        self.tools = ToolRegistry()
        self._register_tools()

    def _register_tools(self) -> None:
        """Register tools into self.tools.  Override in subclasses."""

    def reset(self) -> None:
        """Clear conversation history, starting a fresh session."""
        self._history.clear()
        self._session_start = time.monotonic()

    def run(self, user_message: str) -> dict[str, Any]:
        """Send *user_message* and run the agent loop until a tool produces a result.

        Returns a dict::

            {"tool": "<tool_name>", "result": <handler_return_value>}

        If Claude replies with plain text (no tool call), the dict is::

            {"tool": "text", "result": "<text>"}
        """
        self._history.append({"role": "user", "content": user_message})

        while True:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                tools=self.tools.definitions(),  # type: ignore[arg-type]
                messages=self._history,
            )

            # Record assistant turn
            self._history.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                text = next(
                    (b.text for b in response.content if hasattr(b, "text")), ""
                )
                return {"tool": "text", "result": text}

            # Collect tool_use blocks and execute each handler
            tool_results: list[dict[str, Any]] = []
            last_result: dict[str, Any] = {"tool": "", "result": None}

            for block in response.content:
                if block.type != "tool_use":
                    continue
                handler_output = self.tools.execute(block.name, block.input)  # type: ignore[arg-type]
                last_result = {"tool": block.name, "result": handler_output}
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(handler_output),
                    }
                )

            if tool_results:
                self._history.append({"role": "user", "content": tool_results})

            # stop_reason == "tool_use": return immediately after executing tools
            if response.stop_reason == "tool_use":
                return last_result
