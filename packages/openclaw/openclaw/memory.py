"""Persistent memory layer for OpenClaw agents — AutoDream + AutoCrystalize.

Storage layout::

    ~/.openclaw/dreams/dreams.jsonl          # append-only dream log
    ~/.openclaw/crystals/crystal_<n>.json    # versioned crystal artifacts
"""

from __future__ import annotations

import dataclasses
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data schemas
# ---------------------------------------------------------------------------


@dataclass
class DreamEntry:
    """Structured reflection from a single agent session."""

    id: str                      # uuid4().hex
    timestamp: str               # ISO 8601 UTC
    summary: str                 # 2-5 sentence prose from Claude
    key_insights: list[str]      # 3-7 bullet observations
    topics: list[str]            # 1-5 subject tags
    commands_run: list[str]      # extracted shell commands (may be [])
    session_duration_s: float    # wall-clock seconds


@dataclass
class CrystalEntry:
    """Distilled, versioned knowledge artifact from multiple dream entries."""

    version: int                 # monotonically increasing (1, 2, 3…)
    timestamp: str               # ISO 8601 UTC
    title: str                   # short phrase from Claude
    content: str                 # multi-paragraph synthesis
    key_facts: list[str]         # 5-15 distilled facts
    source_dream_ids: list[str]  # dream UUIDs that fed this crystal


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _dreams_path() -> Path:
    p = Path.home() / ".openclaw" / "dreams" / "dreams.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _crystals_dir() -> Path:
    d = Path.home() / ".openclaw" / "crystals"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# Dream I/O
# ---------------------------------------------------------------------------


def append_dream(entry: DreamEntry) -> None:
    """Append *entry* as a single JSON line to the dreams JSONL file."""
    path = _dreams_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(dataclasses.asdict(entry)) + "\n")
    except OSError as exc:
        logger.warning("[autodream] Failed to write dream entry: %s", exc)


def read_dreams() -> list[DreamEntry]:
    """Return all stored dream entries, oldest first.

    Returns an empty list if the file does not exist or contains no valid
    entries.  Malformed lines are skipped silently.
    """
    path = _dreams_path()
    if not path.exists():
        return []

    entries: list[DreamEntry] = []
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    entries.append(DreamEntry(**d))
                except (json.JSONDecodeError, TypeError, KeyError):
                    pass  # skip malformed lines
    except OSError as exc:
        logger.warning("[autodream] Failed to read dreams: %s", exc)

    return entries


# ---------------------------------------------------------------------------
# Crystal I/O
# ---------------------------------------------------------------------------


def next_crystal_version() -> int:
    """Return the next crystal version number (1 if none exist yet)."""
    crystals_dir = _crystals_dir()
    versions: list[int] = []
    for p in crystals_dir.glob("crystal_*.json"):
        m = re.fullmatch(r"crystal_(\d+)\.json", p.name)
        if m:
            versions.append(int(m.group(1)))
    return max(versions) + 1 if versions else 1


def write_crystal(entry: CrystalEntry) -> tuple[Path, CrystalEntry] | None:
    """Write *entry* to a versioned JSON file using exclusive create (O_EXCL).

    Retries up to 5 times if the target version slot is already taken,
    incrementing the version on each retry to eliminate the TOCTOU window.
    Returns ``(path, persisted_entry)`` on success so callers always have the
    actual on-disk version (which may be higher than ``entry.version`` after
    retries), or ``None`` on failure.
    """
    crystals_dir = _crystals_dir()
    crystals_dir.mkdir(parents=True, exist_ok=True)
    version = entry.version
    for _ in range(5):
        target = crystals_dir / f"crystal_{version}.json"
        payload = dataclasses.replace(entry, version=version)
        try:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(dataclasses.asdict(payload), fh, indent=2)
            return target, payload
        except FileExistsError:
            version += 1
            continue
        except OSError as exc:
            logger.warning("[autocrystalize] Failed to write crystal: %s", exc)
            return None
    logger.warning("[autocrystalize] Could not allocate crystal version after 5 attempts")
    return None


def clear_dreams() -> None:
    """Truncate the dream log after crystallization so the backlog resets."""
    try:
        _dreams_path().write_text("", encoding="utf-8")
    except OSError as exc:
        logger.warning("[autodream] Failed to clear dreams: %s", exc)
