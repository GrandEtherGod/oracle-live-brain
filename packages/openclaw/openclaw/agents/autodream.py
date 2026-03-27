"""AutoDreamAgent — async post-session reflection agent.

After each session ends (via :meth:`reset` or an explicit :meth:`dream` call),
this agent calls Claude to reflect on the conversation history and persists a
structured :class:`~openclaw.memory.DreamEntry` to disk.

Usage::

    agent = AutoDreamAgent()
    agent.run("list my project files")
    agent.run("show git log")
    # On session end:
    dream = agent.dream()   # or just call agent.reset() which calls dream() first
    print(dream.summary)
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic

from ..agent import OpenClawAgent
from ..memory import DreamEntry, append_dream
from ..tools import Tool
from .terminal import TerminalAgent

logger = logging.getLogger(__name__)

_DREAM_SYSTEM_PROMPT = (
    "You are a session reflection assistant for AetherLinkOS. "
    "You will be given a conversation transcript between a user and an AI agent. "
    "Respond ONLY with a valid JSON object — no prose, no markdown fences. "
    "The JSON object must have exactly these keys:\n"
    '  "summary": string (2-5 sentences describing what happened),\n'
    '  "key_insights": array of strings (3-7 observations),\n'
    '  "topics": array of strings (1-5 subject tags),\n'
    '  "commands_run": array of strings (shell commands that were executed, may be empty)'
)

_MAX_HISTORY_MESSAGES = 50
_MAX_HISTORY_CHARS = 40_000


def _serialize_history(history: list[Any]) -> str:
    """Convert conversation history to a readable transcript string."""
    lines: list[str] = []
    messages = history[-_MAX_HISTORY_MESSAGES:]
    truncated = len(history) - len(messages)
    if truncated > 0:
        lines.append(f"[… {truncated} earlier messages truncated …]\n")

    for msg in messages:
        role = msg.get("role", "unknown").capitalize()
        content = msg.get("content", "")
        if isinstance(content, str):
            lines.append(f"{role}: {content}")
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        lines.append(f"{role}: {block.get('text', '')}")
                    elif block.get("type") == "tool_use":
                        lines.append(
                            f"{role} [tool:{block.get('name','')}]: "
                            f"{json.dumps(block.get('input', {}))}"
                        )
                    elif block.get("type") == "tool_result":
                        result_content = block.get("content", "")
                        lines.append(f"ToolResult: {result_content}")

    transcript = "\n".join(lines)
    if len(transcript) > _MAX_HISTORY_CHARS:
        transcript = transcript[-_MAX_HISTORY_CHARS:]
        transcript = "[… transcript truncated …]\n" + transcript
    return transcript


def _extract_json(text: str) -> str:
    """Strip markdown code fences from *text* if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop first line (```json or ```) and last line (```)
        inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner)
    return text.strip()


class AutoDreamAgent(OpenClawAgent):
    """Agent that reflects on each session and persists a DreamEntry.

    Inherits the ``run_command`` / ``speak`` tool pair from
    :class:`~openclaw.agents.terminal.TerminalAgent` by default.
    """

    system_prompt = TerminalAgent.system_prompt

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._session_start: float = time.monotonic()

    def _register_tools(self) -> None:
        # Re-use TerminalAgent's tool definitions without subclassing it
        terminal = TerminalAgent.__new__(TerminalAgent)
        terminal.tools = self.tools
        TerminalAgent._register_tools(terminal)

    def reset(self) -> None:
        """Reflect on the current session, then clear history."""
        if self._history:
            self.dream()
        super().reset()
        self._session_start = time.monotonic()

    def dream(self) -> DreamEntry | None:
        """Call Claude to reflect on :attr:`_history` and persist a DreamEntry.

        Returns the persisted :class:`~openclaw.memory.DreamEntry`, or
        ``None`` if history is empty or the reflection call fails.
        """
        if not self._history:
            return None

        duration = time.monotonic() - self._session_start
        transcript = _serialize_history(self._history)

        prompt = (
            "Please reflect on the following agent session transcript and return "
            "a JSON summary as described.\n\n"
            f"Transcript:\n{transcript}"
        )

        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=_DREAM_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            parsed = json.loads(_extract_json(raw_text))
        except (anthropic.APIError, json.JSONDecodeError, Exception) as exc:
            logger.warning("[autodream] Reflection failed: %s", exc)
            return None

        entry = DreamEntry(
            id=uuid.uuid4().hex,
            timestamp=datetime.now(timezone.utc).isoformat(),
            summary=parsed.get("summary", ""),
            key_insights=parsed.get("key_insights", []),
            topics=parsed.get("topics", []),
            commands_run=parsed.get("commands_run", []),
            session_duration_s=round(duration, 2),
        )
        append_dream(entry)
        logger.info("[autodream] Session reflected: %s", entry.id)
        return entry
