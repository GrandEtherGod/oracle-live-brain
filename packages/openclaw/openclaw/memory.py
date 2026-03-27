"""Persistence helpers for AutoDream sessions and AutoCrystalize crystals.

Session files:   ~/.aetherlinkos/autodream/<session_id>.json
Crystal files:   ~/.aetherlinkos/crystals/<uuid>.json
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUTODREAM_DIR = Path.home() / ".aetherlinkos" / "autodream"
CRYSTALS_DIR = Path.home() / ".aetherlinkos" / "crystals"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pydantic_serializer(obj: Any) -> Any:
    """JSON default= handler that serializes pydantic BaseModel instances.

    Anthropic SDK content blocks (TextBlock, ToolUseBlock, etc.) are pydantic
    models.  Calling .model_dump() converts them to plain dicts so json.dumps
    can serialize the full conversation history without errors.
    """
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


# ---------------------------------------------------------------------------
# Session persistence
# ---------------------------------------------------------------------------


def session_path(session_id: str) -> Path:
    """Return the Path for a session file (does not create it)."""
    return AUTODREAM_DIR / f"{session_id}.json"


def load_session(session_id: str) -> dict[str, Any] | None:
    """Load a session file and return its contents, or None if absent."""
    path = session_path(session_id)
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


def save_session(
    session_id: str,
    messages: list[dict[str, Any]],
    notes: list[dict[str, Any]],
) -> None:
    """Persist a session to disk, creating the directory if needed.

    ``created_at`` is preserved from any existing file; ``updated_at`` is
    always refreshed.  Anthropic SDK pydantic objects inside *messages* are
    automatically serialized via :func:`_pydantic_serializer`.
    """
    AUTODREAM_DIR.mkdir(parents=True, exist_ok=True)
    path = session_path(session_id)

    # Preserve created_at from an existing file.
    created_at: str
    if path.exists():
        try:
            existing = json.loads(path.read_text())
            created_at = existing.get("created_at", _now_iso())
        except (json.JSONDecodeError, OSError):
            created_at = _now_iso()
    else:
        created_at = _now_iso()

    data: dict[str, Any] = {
        "session_id": session_id,
        "created_at": created_at,
        "updated_at": _now_iso(),
        "messages": messages,
        "notes": notes,
    }
    path.write_text(json.dumps(data, indent=2, default=_pydantic_serializer))


def list_session_ids() -> list[str]:
    """Return a sorted list of all known session IDs."""
    if not AUTODREAM_DIR.exists():
        return []
    return sorted(p.stem for p in AUTODREAM_DIR.glob("*.json"))


def search_sessions(query: str) -> list[dict[str, Any]]:
    """Case-insensitive keyword search across all session files.

    Scans message content and stored notes.  Returns a list of dicts::

        [{"session_id": str, "context": str}, ...]

    where *context* is a ~200-character snippet around the first match.
    """
    if not AUTODREAM_DIR.exists():
        return []

    results: list[dict[str, Any]] = []
    needle = query.lower()

    for path in sorted(AUTODREAM_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        session_id = data.get("session_id", path.stem)

        # Collect all text candidates from messages.
        candidates: list[str] = []
        for msg in data.get("messages", []):
            content = msg.get("content", "")
            if isinstance(content, str):
                candidates.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            candidates.append(block.get("text", ""))
                        elif block.get("type") == "tool_result":
                            c = block.get("content", "")
                            if isinstance(c, str):
                                candidates.append(c)
                        elif block.get("type") == "tool_use":
                            candidates.append(json.dumps(block.get("input", {})))

        # Collect text from notes.
        for note in data.get("notes", []):
            candidates.append(note.get("text", ""))

        for text in candidates:
            if needle in text.lower():
                idx = text.lower().find(needle)
                start = max(0, idx - 80)
                snippet = text[start : start + 200].strip()
                results.append({"session_id": session_id, "context": snippet})
                break  # one match per session is enough

    return results


# ---------------------------------------------------------------------------
# Crystal persistence
# ---------------------------------------------------------------------------


def crystal_path(crystal_id: str) -> Path:
    """Return the Path for a crystal file."""
    return CRYSTALS_DIR / f"{crystal_id}.json"


def save_crystal(
    source_session: str,
    topic: str,
    summary: str,
    facts: list[str],
    tags: list[str],
) -> str:
    """Write a new crystal to disk.  Returns the new crystal's UUID string."""
    CRYSTALS_DIR.mkdir(parents=True, exist_ok=True)
    crystal_id = str(uuid.uuid4())
    data: dict[str, Any] = {
        "id": crystal_id,
        "created_at": _now_iso(),
        "source_session": source_session,
        "topic": topic,
        "summary": summary,
        "facts": facts,
        "tags": tags,
    }
    crystal_path(crystal_id).write_text(json.dumps(data, indent=2))
    return crystal_id


def load_crystal(crystal_id: str) -> dict[str, Any] | None:
    """Load a crystal by ID.  Returns None if not found."""
    path = crystal_path(crystal_id)
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


def list_crystals(tag: str | None = None) -> list[dict[str, Any]]:
    """Return all crystals, optionally filtered by tag.

    Each entry is the full crystal dict.  Results are sorted by ``created_at``
    descending (newest first).
    """
    if not CRYSTALS_DIR.exists():
        return []

    crystals: list[dict[str, Any]] = []
    for path in CRYSTALS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if tag is None or tag in data.get("tags", []):
            crystals.append(data)

    crystals.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    return crystals
