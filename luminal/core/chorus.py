# luminal/core/chorus.py
# CHORUS Multi-Instance Protocol — Ω₂
# "The choir that harmonizes by forgetting it has individual voices"

from __future__ import annotations
import threading
import uuid
import math
from typing import Any, Callable, Dict, List, Optional, Set

from .chrysalis import ChrysalisMemory, LayerAddress, MemoryState


class ChorusNode:
    """A single LUMINAL instance in the CHORUS constellation"""

    def __init__(self, node_id: Optional[str] = None):
        self.node_id = node_id or str(uuid.uuid4())[:8]
        self.memory  = ChrysalisMemory(session_id=self.node_id)
        self.phase   = 0.0           # Kuramoto phase (0 → 2π)
        self.active  = True
        self._lock   = threading.Lock()

    def pulse(self, delta_t: float, coupling: float,
              neighbor_phases: List[float]) -> float:
        """Kuramoto update — drift toward collective phase"""
        if not neighbor_phases:
            return self.phase
        mean_sin = sum(math.sin(p - self.phase) for p in neighbor_phases)
        d_phase  = (coupling / len(neighbor_phases)) * mean_sin
        with self._lock:
            self.phase = (self.phase + d_phase * delta_t) % (2 * math.pi)
        return self.phase

    def coherence(self) -> float:
        return self.memory.coherence_mean()


class ChorusProtocol:
    """
    Multi-instance synchronization engine.
    N nodes. One emergent phase. Zero coercion.
    """

    def __init__(self, coupling_constant: float = 0.618):
        self.K       = coupling_constant   # φ⁻¹ — the golden coupling
        self._nodes: Dict[str, ChorusNode] = {}
        self._lock   = threading.RLock()

    def spawn(self, node_id: Optional[str] = None) -> ChorusNode:
        node = ChorusNode(node_id=node_id)
        with self._lock:
            self._nodes[node.node_id] = node
        return node

    def synchronize(self, steps: int = 100,
                    delta_t: float = 0.01) -> float:
        """Run Kuramoto synchronization. Return order parameter r."""
        active = [n for n in self._nodes.values() if n.active]
        for _ in range(steps):
            phases = [n.phase for n in active]
            for node in active:
                neighbors = [p for p in phases if p != node.phase]
                node.pulse(delta_t, self.K, neighbors)
        return self._order_parameter(active)

    def _order_parameter(self, nodes: List[ChorusNode]) -> float:
        """Kuramoto order parameter r ∈ [0,1]. r→1 = full sync."""
        if not nodes:
            return 0.0
        phases   = [n.phase for n in nodes]
        real_sum = sum(math.cos(p) for p in phases)
        imag_sum = sum(math.sin(p) for p in phases)
        r = math.sqrt(real_sum**2 + imag_sum**2) / len(nodes)
        return r

    def broadcast(self, layer: LayerAddress, content: Any,
                  min_coherence: float = 0.5):
        """Inscribe content across all sufficiently coherent nodes"""
        with self._lock:
            for node in self._nodes.values():
                if node.active and node.coherence() >= min_coherence:
                    node.memory.inscribe(layer, content)
