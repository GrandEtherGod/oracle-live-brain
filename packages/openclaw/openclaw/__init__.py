"""OpenClaw Agents — AI agent layer for AetherLinkOS / Theia Engine.

Quickstart::

    from openclaw import TerminalAgent

    agent = TerminalAgent()          # reads ANTHROPIC_API_KEY from env
    result = agent.run("list files in the current directory")
    print(result["result"])

Install::

    pip install openclaw-agents
"""

from .agent import OpenClawAgent
from .agents.terminal import TerminalAgent
from .agents.theia import TheiaAgent
from .tools import Tool, ToolRegistry, tool

__version__ = "0.1.0"
__all__ = [
    "OpenClawAgent",
    "TerminalAgent",
    "TheiaAgent",
    "Tool",
    "ToolRegistry",
    "tool",
]
