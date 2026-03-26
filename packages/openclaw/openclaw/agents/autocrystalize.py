"""AutoCrystalizeAgent — extends AutoDreamAgent with knowledge crystallization."""

from __future__ import annotations

import json
from typing import Any

from ..memory import (
    list_crystals as _list_crystals_from_disk,
    load_crystal,
    save_crystal,
)
from ..tools import Tool
from .autodream import AutoDreamAgent

# Maximum characters of serialized history passed to the crystallize prompt.
# Prevents context-window overflow for very long sessions.
_MAX_HISTORY_CHARS = 20_000


class AutoCrystalizeAgent(AutoDreamAgent):
    """Agent that crystallizes session memories into structured, durable facts.

    Inherits all :class:`~openclaw.agents.autodream.AutoDreamAgent` capabilities
    (persistent session memory, recall, store_memory, list_sessions, speak) and
    adds three crystallization tools:

    * ``crystallize`` — compress a topic into a lasting crystal on disk
    * ``list_crystals`` — browse available crystals, optionally by tag
    * ``recall_crystal`` — retrieve a crystal's full structured content

    Crystals are stored in ``~/.aetherlinkos/crystals/<uuid>.json``.
    """

    system_prompt: str = (
        "You are AutoCrystalize, an advanced memory agent in AetherLinkOS. "
        "You do two things: remember conversations across sessions (like AutoDream), "
        "and crystallize key knowledge into structured, durable facts for future reference. "
        "Use crystallize to compress a topic from the current session into a lasting crystal. "
        "Use list_crystals to show available crystals, optionally filtered by tag. "
        "Use recall_crystal to retrieve the full content of a specific crystal. "
        "Always prefer recalling a relevant crystal before answering factual questions "
        "about topics you have previously crystallized."
    )

    def _register_tools(self) -> None:
        # Inherit all AutoDream tools (recall_memory, store_memory,
        # list_sessions, speak).
        super()._register_tools()

        self.tools.register(Tool(
            name="crystallize",
            description=(
                "Analyze the current session history and extract structured facts about "
                "a given topic into a durable crystal stored on disk."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "The topic or subject to crystallize from this session",
                    },
                },
                "required": ["topic"],
            },
            handler=self._crystallize,
        ))
        self.tools.register(Tool(
            name="list_crystals",
            description=(
                "List all available crystals. "
                "Optionally filter by tag to find crystals on a specific subject."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "tag": {
                        "type": "string",
                        "description": "Optional tag to filter crystals (omit to list all)",
                    },
                },
                "required": [],
            },
            handler=self._list_crystals,
        ))
        self.tools.register(Tool(
            name="recall_crystal",
            description="Retrieve the full content of a specific crystal by its ID.",
            input_schema={
                "type": "object",
                "properties": {
                    "crystal_id": {
                        "type": "string",
                        "description": "The UUID of the crystal to retrieve",
                    },
                },
                "required": ["crystal_id"],
            },
            handler=self._recall_crystal,
        ))

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    def _crystallize(self, topic: str) -> str:
        """Call Claude to extract structured facts from the current session history."""
        history_text = self._serialize_history_for_crystallization()
        if not history_text.strip():
            return "No session history to crystallize."

        # Truncate to avoid context-window overflow.
        if len(history_text) > _MAX_HISTORY_CHARS:
            history_text = history_text[-_MAX_HISTORY_CHARS:]

        prompt = (
            f'You are a knowledge extraction assistant. '
            f'Analyze the following conversation history and extract structured '
            f'knowledge about the topic: "{topic}".\n\n'
            f"Return ONLY a valid JSON object with these exact fields:\n"
            f'  "summary": a 1-2 sentence summary (string)\n'
            f'  "facts": a list of specific factual strings (array of strings)\n'
            f'  "tags": a list of short lowercase tag strings (array of strings)\n\n'
            f"Conversation history:\n{history_text}"
        )

        # Direct (non-tool-loop) API call — ensures deterministic JSON output.
        response = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            system="You extract structured knowledge from conversations. Return only valid JSON.",
            messages=[{"role": "user", "content": prompt}],
        )

        raw = next(
            (b.text for b in response.content if hasattr(b, "text")), ""
        ).strip()

        # Strip markdown code fences if Claude wrapped the JSON.
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return f"Failed to parse crystallization response: {raw[:200]}"

        crystal_id = save_crystal(
            source_session=self.session_id,
            topic=topic,
            summary=data.get("summary", ""),
            facts=data.get("facts", []),
            tags=data.get("tags", []),
        )
        return f"Crystal created: {crystal_id} (topic: {topic})"

    def _list_crystals(self, tag: str | None = None) -> str:
        crystals = _list_crystals_from_disk(tag=tag)
        if not crystals:
            label = f" with tag '{tag}'" if tag else ""
            return f"No crystals found{label}."
        lines = [
            f"[{c['id']}] {c['topic']} — {c['summary'][:80]}  tags={c['tags']}"
            for c in crystals
        ]
        return "\n".join(lines)

    def _recall_crystal(self, crystal_id: str) -> str:
        crystal = load_crystal(crystal_id)
        if crystal is None:
            return f"Crystal not found: {crystal_id}"
        return json.dumps(crystal, indent=2)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _serialize_history_for_crystallization(self) -> str:
        """Flatten self._history into plain text for the crystallize prompt."""
        lines: list[str] = []
        for msg in self._history:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if isinstance(content, str):
                lines.append(f"{role}: {content}")
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        # Pydantic SDK objects — use model_dump if available.
                        block = block.model_dump() if hasattr(block, "model_dump") else {}
                    btype = block.get("type", "")
                    if btype == "text":
                        lines.append(f"{role}: {block.get('text', '')}")
                    elif btype == "tool_use":
                        lines.append(
                            f"{role} [tool:{block.get('name', '')}]: "
                            f"{json.dumps(block.get('input', {}))}"
                        )
                    elif btype == "tool_result":
                        c = block.get("content", "")
                        lines.append(f"tool_result: {c}")
        return "\n".join(lines)
