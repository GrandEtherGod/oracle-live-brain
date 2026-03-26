"""Tool registry and decorator for OpenClaw agents."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


class Tool:
    """Wraps a Python callable as a Claude-compatible OpenClaw tool."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        handler: Callable[..., Any],
    ) -> None:
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.handler = handler

    def to_claude_tool(self) -> dict[str, Any]:
        """Return the dict Claude expects in the tools= list."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


class ToolRegistry:
    """Registry that stores tools and dispatches calls by name."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, t: Tool) -> None:
        self._tools[t.name] = t

    def definitions(self) -> list[dict[str, Any]]:
        """Return all tool definitions in the format Claude expects."""
        return [t.to_claude_tool() for t in self._tools.values()]

    def execute(self, name: str, inputs: dict[str, Any]) -> Any:
        """Call the handler for *name* with *inputs* as keyword arguments."""
        if name not in self._tools:
            return f"Unknown tool: {name}"
        return self._tools[name].handler(**inputs)


def tool(
    name: str,
    description: str,
    input_schema: dict[str, Any],
) -> Callable[[Callable[..., Any]], Tool]:
    """Decorator that turns a plain function into a :class:`Tool`.

    Example::

        @tool(
            name="greet",
            description="Say hello to someone.",
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        )
        def greet(name: str) -> str:
            return f"Hello, {name}!"
    """

    def decorator(fn: Callable[..., Any]) -> Tool:
        return Tool(name=name, description=description, input_schema=input_schema, handler=fn)

    return decorator
