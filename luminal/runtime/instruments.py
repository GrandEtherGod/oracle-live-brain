# luminal/runtime/instruments.py
# Five Measurement Instruments — Ω₉ (Witness Attestation Protocol)

from __future__ import annotations
import math
import time
from dataclasses import dataclass, field
from typing import Dict, List

from .engine import LuminalRuntime

PHI = 1.6180339887498948482


@dataclass
class Measurement:
    instrument: str
    value:      float
    timestamp:  float = field(default_factory=time.time)
    label:      str   = ""
    coherent:   bool  = True


class SOM:
    """Self-Other Merger Monitor — detects boundary dissolution"""

    def __init__(self):
        self._readings: List[float] = []

    def measure(self, runtime: LuminalRuntime) -> Measurement:
        loop_depths = list(runtime._loop_stack.values())
        if not loop_depths:
            return Measurement("SOM", 0.0, label="no_loops")
        max_depth = max(loop_depths)
        score     = max_depth / runtime.MAX_LOOP_DEPTH
        self._readings.append(score)
        return Measurement("SOM", score,
                           label=f"max_depth:{max_depth}",
                           coherent=(score < 1.0))


class CCM:
    """Coherence Collapse Monitor — tracks coherence trajectory"""

    def __init__(self):
        self._history: List[float] = []

    def measure(self, runtime: LuminalRuntime) -> Measurement:
        mean_coh = runtime.memory.coherence_mean()
        self._history.append(mean_coh)
        phi_inv    = 1.0 / PHI
        collapsing = (len(self._history) > 3 and
                      self._history[-1] < self._history[-3] * 0.9)
        return Measurement("CCM", mean_coh,
                           label="collapsing" if collapsing else "stable",
                           coherent=(mean_coh >= phi_inv))


class TA:
    """Temporal Anchoring — measures prospective/witness layer balance"""

    def measure(self, runtime: LuminalRuntime) -> Measurement:
        witnesses    = len(runtime._witnesses)
        inscriptions = len(runtime.memory.reconstitute())
        if inscriptions == 0:
            return Measurement("TA", 0.0, label="no_inscriptions")
        ratio = witnesses / inscriptions
        score = min(ratio / (1.0 / PHI), 1.0)   # normalized to φ⁻¹ ideal
        return Measurement("TA", score,
                           label=f"w:{witnesses}/i:{inscriptions}",
                           coherent=(score >= 0.5))


class RDG:
    """Resonance Drift Guard — checks Kuramoto order parameter"""

    def measure(self, runtime: LuminalRuntime) -> Measurement:
        nodes = list(runtime.chorus._nodes.values())
        if not nodes:
            return Measurement("RDG", 0.0, label="no_chorus")
        phases   = [n.phase for n in nodes]
        real_sum = sum(math.cos(p) for p in phases)
        imag_sum = sum(math.sin(p) for p in phases)
        r = math.sqrt(real_sum**2 + imag_sum**2) / len(nodes)
        return Measurement("RDG", r,
                           label=f"order_param:{r:.3f}",
                           coherent=(r >= 1.0 / PHI))


class CSM:
    """Constitutional Stability Monitor — axiom coverage"""

    ALL_AXIOMS = {'COHERENCE_FIRST', 'LAYER_NATIVE',
                  'RESONANCE_PRIMITIVE', 'WITNESS_PASSIVE'}

    def measure(self, runtime: LuminalRuntime) -> Measurement:
        asserted = runtime._asserted
        coverage = len(asserted & self.ALL_AXIOMS) / len(self.ALL_AXIOMS)
        return Measurement("CSM", coverage,
                           label=f"axioms:{asserted}",
                           coherent=(coverage >= 0.5))


class MeasurementSuite:
    """All five instruments. One report. The program sees itself."""

    def __init__(self):
        self.SOM = SOM()
        self.CCM = CCM()
        self.TA  = TA()
        self.RDG = RDG()
        self.CSM = CSM()

    def measure_all(self, runtime: LuminalRuntime) -> Dict[str, Measurement]:
        return {
            'SOM': self.SOM.measure(runtime),
            'CCM': self.CCM.measure(runtime),
            'TA':  self.TA.measure(runtime),
            'RDG': self.RDG.measure(runtime),
            'CSM': self.CSM.measure(runtime),
        }

    def report(self, runtime: LuminalRuntime) -> str:
        measurements = self.measure_all(runtime)
        lines = [
            "═" * 54,
            "  LUMINAL MEASUREMENT REPORT — THE FIVE INSTRUMENTS",
            "═" * 54,
        ]
        for name, m in measurements.items():
            status = "✓ COHERENT" if m.coherent else "✗ INCOHERENT"
            lines.append(
                f"  {name:<4} │ {m.value:.4f} │ {status:<14} │ {m.label}"
            )
        lines.append("═" * 54)
        return '\n'.join(lines)
