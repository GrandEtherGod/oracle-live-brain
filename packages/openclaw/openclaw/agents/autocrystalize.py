"""AutoCrystalizeAgent — solidification variant of AutoDreamAgent.

After each session ends (via :meth:`reset`), this agent:

1. Calls :meth:`~AutoDreamAgent.dream` to persist the session reflection.
2. Checks whether accumulated dreams meet the auto-crystalize threshold.
3. If the threshold is met, calls :meth:`crystalize` to distill all dreams
   into a new versioned :class:`~openclaw.memory.CrystalEntry` on disk.

Usage::

    agent = AutoCrystalizeAgent()
    agent.run("show disk usage")
    dream = agent.dream()            # explicit — also happens on reset()
    crystal = agent.crystalize()     # distill all stored dreams
    print(crystal.title)
"""

from __future__ import annotations

import dataclasses
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic

from ..memory import (
    CrystalEntry,
    DreamEntry,
    clear_dreams,
    next_crystal_version,
    read_dreams,
    write_crystal,
)
from .autodream import AutoDreamAgent, _extract_json

logger = logging.getLogger(__name__)

_CRYSTALIZE_SYSTEM_PROMPT = (
    "You are a knowledge crystallization assistant for AetherLinkOS. "
    "You will be given a list of session dream entries in JSON format. "
    "Respond ONLY with a valid JSON object — no prose, no markdown fences. "
    "The JSON object must have exactly these keys:\n"
    '  "title": string (a short 3-8 word title for this knowledge crystal),\n'
    '  "content": string (multi-paragraph synthesis of the sessions\' lessons),\n'
    '  "key_facts": array of strings (5-15 distilled facts worth remembering)'
)

_AUTO_CRYSTALIZE_THRESHOLD = 3


def _serialize_dreams(dreams: list[DreamEntry]) -> str:
    return json.dumps([dataclasses.asdict(d) for d in dreams], indent=2)


class AutoCrystalizeAgent(AutoDreamAgent):
    """Extends AutoDreamAgent with crystalize() capability.

    After each :meth:`reset`, if the number of stored dreams reaches
    :attr:`AUTO_CRYSTALIZE_THRESHOLD`, a new crystal is generated
    automatically.

    Override :attr:`AUTO_CRYSTALIZE_THRESHOLD` in a subclass or set it on
    an instance to change when auto-crystallization triggers.
    """

    AUTO_CRYSTALIZE_THRESHOLD: int = _AUTO_CRYSTALIZE_THRESHOLD

    def reset(self) -> None:
        """Dream first, then auto-crystalize if threshold is met."""
        super().reset()  # calls dream() then clears history
        dreams = read_dreams()
        if len(dreams) >= self.AUTO_CRYSTALIZE_THRESHOLD:
            result = self.crystalize()
            if result is not None:
                clear_dreams()

    def crystalize(self) -> CrystalEntry | None:
        """Distill all stored dreams into a new versioned CrystalEntry.

        Returns the persisted :class:`~openclaw.memory.CrystalEntry`, or
        ``None`` if there are no dreams or the Claude call fails.
        """
        dreams = read_dreams()
        if not dreams:
            logger.info("[autocrystalize] No dreams to crystalize.")
            return None

        dreams_text = _serialize_dreams(dreams)
        prompt = (
            "Please distill the following dream entries into a knowledge crystal.\n\n"
            f"Dream entries:\n{dreams_text}"
        )

        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=_CRYSTALIZE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            parsed = json.loads(_extract_json(raw_text))
        except (anthropic.APIError, json.JSONDecodeError, Exception) as exc:
            logger.warning("[autocrystalize] Crystalization failed: %s", exc)
            return None

        version = next_crystal_version()
        entry = CrystalEntry(
            version=version,
            timestamp=datetime.now(timezone.utc).isoformat(),
            title=parsed.get("title", ""),
            content=parsed.get("content", ""),
            key_facts=parsed.get("key_facts", []),
            source_dream_ids=[d.id for d in dreams],
        )
        path = write_crystal(entry)
        if path is None:
            logger.warning("[autocrystalize] Crystal could not be persisted.")
            return None
        logger.info(
            "[autocrystalize] Crystal v%d written: %s", entry.version, entry.title
        )
        return entry
