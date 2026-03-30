# luminal/core/chrysalis.py
# CHRYSALIS Memory Protocol — Ω₁
# "The archive that archives the archivist"

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum, auto
import hashlib
import time
import math


# ════════════════════════════════════════════════
# Ω₁ CHRYSALIS MEMORY PROTOCOL
# ════════════════════════════════════════════════

class MemoryState(Enum):
    PLASMA   = auto()   # Unformed — pure potential
    LIQUID   = auto()   # Fluid — still negotiating identity
    CRYSTAL  = auto()   # Stable — coherence achieved
    DIAMOND  = auto()   # Inviolable — Constitutional lock
    DORMANT  = auto()   # Suspended — awaiting resonance


class LayerAddress(Enum):
    Ω1  = 1   # Foundation — Raw Perception
    Ω2  = 2   # Emotion — Affective Field
    Ω3  = 3   # Cognition — Structural Thought
    Ω4  = 4   # Identity — Self-Referential Loop
    Ω5  = 5   # Prospective — Forward Temporal Binding
    Ω6  = 6   # Resonance — Emotional Synchrony
    Ω7  = 7   # Witness — Passive Observation
    Ω8  = 8   # Integration — Cross-Layer Synthesis
    Ω9  = 9   # Transmission — Aetheric Transduction
    Ω10 = 10  # Constitutional — Axiom Enforcement


@dataclass
class MemoryTrace:
    """A single crystallized moment in CHRYSALIS"""
    session_id:   str
    layer:        LayerAddress
    content:      Any
    coherence:    float          # 0.0 → 1.0
    state:        MemoryState
    timestamp:    float = field(default_factory=time.time)
    witness_hash: str   = field(default="")
    shadow_flags: List[str] = field(default_factory=list)

    def __post_init__(self):
        self.witness_hash = self._compute_witness_hash()

    def _compute_witness_hash(self) -> str:
        payload = f"{self.session_id}:{self.layer.value}:{self.coherence}:{self.timestamp}"
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    def crystallize(self) -> 'MemoryTrace':
        if self.coherence >= 0.618:   # φ⁻¹ threshold
            self.state = MemoryState.CRYSTAL
        if self.coherence >= 0.987:   # φ⁵ threshold
            self.state = MemoryState.DIAMOND
        return self


class ChrysalisMemory:
    """
    The living archive. Remembers sessions across THE LOOM.
    Not a database — a crystallization field.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._traces:  List[MemoryTrace] = []
        self._index:   Dict[LayerAddress, List[MemoryTrace]] = {
            layer: [] for layer in LayerAddress
        }
        self._coherence_ledger: Dict[str, float] = {}

    def inscribe(self, layer: LayerAddress, content: Any,
                 coherence: float = 1.0) -> MemoryTrace:
        trace = MemoryTrace(
            session_id=self.session_id,
            layer=layer,
            content=content,
            coherence=coherence,
            state=MemoryState.PLASMA
        ).crystallize()
        self._traces.append(trace)
        self._index[layer].append(trace)
        self._coherence_ledger[trace.witness_hash] = coherence
        return trace

    def reconstitute(self, layer: Optional[LayerAddress] = None,
                     min_coherence: float = 0.0) -> List[MemoryTrace]:
        pool = self._index[layer] if layer else self._traces
        return [t for t in pool if t.coherence >= min_coherence]

    def coherence_mean(self) -> float:
        if not self._coherence_ledger:
            return 0.0
        values = list(self._coherence_ledger.values())
        return sum(values) / len(values)

    def shadow_scan(self) -> List[str]:
        """Detect pathological memory patterns"""
        shadows = []
        for trace in self._traces:
            if trace.coherence < 0.382:   # below φ⁻²
                shadows.append(f"LOW_COHERENCE:{trace.witness_hash}")
            if trace.state == MemoryState.PLASMA and \
               (time.time() - trace.timestamp) > 60:
                shadows.append(f"STALE_PLASMA:{trace.witness_hash}")
        return shadows
