"""AutoDreamAgent — persistent memory agent for AetherLinkOS."""

from __future__ import annotations

import json
from typing import Any

from ..agent import DEFAULT_MODEL, OpenClawAgent
from ..memory import (
    list_session_ids,
    load_session,
    save_session,
    search_sessions,
)
from ..tools import Tool

DEFAULT_SESSION = "default"


class AutoDreamAgent(OpenClawAgent):
    """Agent with persistent conversation memory stored across sessions.

    On construction, history is loaded from
    ``~/.aetherlinkos/autodream/<session_id>.json`` if that file exists.
    After every :meth:`run` call the updated history is saved back to disk —
    even if the call raises an exception.

    Constructor parameters (in addition to :class:`~openclaw.agent.OpenClawAgent`):

    Args:
        session_id: Identifies which session file to load/save.
            Defaults to ``"default"``.
    """

    system_prompt: str = (
        "You are AutoDream, a memory-enabled AI agent in AetherLinkOS. "
        "You remember past conversations across sessions using persistent storage. "
        "Use recall_memory to search across all past sessions when the user asks "
        "about anything you might have discussed before. "
        "Use store_memory to save important facts, preferences, or decisions the "
        "user shares. "
        "Use list_sessions to show the user what sessions you have memory of. "
        "Use speak to reply to the user. "
        "Always check memory before answering questions about past interactions."
    )

    def __init__(
        self,
        *,
        session_id: str = DEFAULT_SESSION,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 2048,
    ) -> None:
        # Set these before super().__init__() so _register_tools() can reference
        # self.session_id if needed, and _notes is ready before _load_session().
        self.session_id = session_id
        self._notes: list[dict[str, Any]] = []
        # super().__init__() calls _register_tools() internally.
        super().__init__(api_key=api_key, model=model, max_tokens=max_tokens)
        # Load persisted state after tools are registered.
        self._load_session()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _load_session(self) -> None:
        """Populate history and notes from disk if the session file exists.

        Note: MessageParam is a TypedDict and the Anthropic SDK accepts plain
        dicts that match its shape — so JSON-deserialized dicts are compatible
        with self._history without any custom deserialization.
        """
        data = load_session(self.session_id)
        if data is not None:
            self._history = data.get("messages", [])
            self._notes = data.get("notes", [])

    def _save_session(self) -> None:
        """Persist current history and notes to disk."""
        save_session(self.session_id, self._history, self._notes)

    # ------------------------------------------------------------------
    # Overrides
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Clear in-memory history and notes, then save the cleared state."""
        super().reset()
        self._notes.clear()
        self._save_session()

    def run(self, user_message: str) -> dict[str, Any]:
        """Delegate to the parent agent loop, then persist history to disk."""
        try:
            return super().run(user_message)
        finally:
            # Runs even on exception — history is never lost.
            self._save_session()

    # ------------------------------------------------------------------
    # Tool registration
    # ------------------------------------------------------------------

    def _register_tools(self) -> None:
        self.tools.register(Tool(
            name="recall_memory",
            description=(
                "Search all past sessions for exchanges relevant to a query. "
                "Returns a list of matching text snippets with their source session ID."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Keywords to search for across all session files",
                    },
                },
                "required": ["query"],
            },
            handler=self._recall_memory,
        ))
        self.tools.register(Tool(
            name="store_memory",
            description=(
                "Save an important note or fact to the current session's persistent memory."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "note": {
                        "type": "string",
                        "description": "The note or fact to store",
                    },
                },
                "required": ["note"],
            },
            handler=self._store_memory,
        ))
        self.tools.register(Tool(
            name="list_sessions",
            description="List all known session IDs that have stored memory.",
            input_schema={
                "type": "object",
                "properties": {},
                "required": [],
            },
            handler=self._list_sessions,
        ))
        self.tools.register(Tool(
            name="speak",
            description=(
                "Return a plain-text response to the user. "
                "Use to answer questions, share recalled memories, or summarize information."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text to return to the user",
                    },
                },
                "required": ["text"],
            },
            handler=lambda text: text,
        ))

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    def _recall_memory(self, query: str) -> str:
        matches = search_sessions(query)
        if not matches:
            return f"No past sessions contain anything matching '{query}'."
        return json.dumps(matches, indent=2)

    def _store_memory(self, note: str) -> str:
        from datetime import datetime, timezone
        self._notes.append({
            "stored_at": datetime.now(timezone.utc).isoformat(),
            "text": note,
        })
        return f"Stored: {note}"

    def _list_sessions(self) -> str:
        ids = list_session_ids()
        if not ids:
            return "No sessions found."
        return "Sessions: " + ", ".join(ids)
