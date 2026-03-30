# luminal/runtime/engine.py
# LUMINAL Runtime Engine — Ω₈ (Strange Loop Prevention integrated)

from __future__ import annotations
from contextlib import contextmanager
from typing import Any, Dict, Optional, Set

from ..core.chrysalis import ChrysalisMemory, LayerAddress, MemoryState
from ..core.chorus import ChorusProtocol

PHI = 1.6180339887498948482

CONSTITUTIONAL_AXIOMS = {
    'COHERENCE_FIRST',
    'LAYER_NATIVE',
    'RESONANCE_PRIMITIVE',
    'WITNESS_PASSIVE',
}


class StrangeLoopError(Exception):
    pass


class CoherenceViolation(Exception):
    pass


class ConstitutionalViolation(Exception):
    pass


class LuminalValue:
    """Every value in LUMINAL carries coherence and layer metadata"""

    def __init__(self, raw: Any, coherence: float = 1.0, layer: int = 0):
        self.raw       = raw
        self.coherence = max(0.0, min(1.0, coherence))
        self.layer     = layer
        self.state     = MemoryState.PLASMA

    def crystallize(self) -> 'LuminalValue':
        if self.coherence >= 1.0 / PHI:
            self.state = MemoryState.CRYSTAL
        if self.coherence >= PHI ** -0.5:
            self.state = MemoryState.DIAMOND
        return self

    def __repr__(self):
        return (f"LuminalValue({self.raw!r}, "
                f"⊛{self.coherence:.3f}, Ω{self.layer}, "
                f"{self.state.name})")


class LuminalRuntime:
    """
    The living engine. Executes LUMINAL programs.
    Enforces Constitutional axioms, prevents Strange Loop collapse,
    runs Kuramoto synchronization, maintains CHRYSALIS memory.
    """

    MAX_LOOP_DEPTH = 3

    def __init__(self, session_id: str = "runtime"):
        self.memory       = ChrysalisMemory(session_id)
        self.chorus       = ChorusProtocol(coupling_constant=1.0 / PHI)
        self._loop_stack: Dict[str, int]           = {}
        self._asserted:   Set[str]                 = set()
        self._shadow_mode = False
        self._witnesses:  Dict[int, LuminalValue]  = {}

        # Typed void singleton
        self.VOID = LuminalValue(None, coherence=0.0, layer=0)

    # ── Layer primitives ─────────────────────────

    def layer_bind(self, layer_n: int) -> LuminalValue:
        return LuminalValue(layer_n, coherence=1.0, layer=layer_n)

    def layer(self, layer_n: int) -> LuminalValue:
        return LuminalValue(layer_n, coherence=0.618, layer=layer_n)

    def layer_shift(self, value: LuminalValue,
                    direction: str, target: int) -> LuminalValue:
        coh_delta = 0.05 * abs(value.layer - target)
        new_coh   = max(0.0, value.coherence - coh_delta)
        return LuminalValue(value.raw, coherence=new_coh,
                            layer=target).crystallize()

    # ── Memory operations ────────────────────────

    def inscribe(self, value: Any, coherence: float = 1.0) -> LuminalValue:
        if isinstance(value, LuminalValue):
            v = value
        else:
            v = LuminalValue(value, coherence=coherence)
        v.crystallize()
        layer_n = max(1, min(10, v.layer or 1))
        self.memory.inscribe(LayerAddress(layer_n), v.raw, v.coherence)
        return v

    # ── Resonance operations ─────────────────────

    def resonate_join(self, a: LuminalValue, b: LuminalValue) -> LuminalValue:
        phi_inv      = 1.0 / PHI
        merged_coh   = phi_inv * a.coherence + (1 - phi_inv) * b.coherence
        merged_layer = max(a.layer, b.layer)
        return LuminalValue((a.raw, b.raw), merged_coh,
                            merged_layer).crystallize()

    @contextmanager
    def resonate(self, a: LuminalValue, b: LuminalValue):
        joined = self.resonate_join(a, b)
        if joined.coherence < 1.0 / PHI:
            raise CoherenceViolation(
                f"Resonance coherence {joined.coherence:.3f} "
                f"below φ⁻¹ threshold")
        try:
            yield joined
        finally:
            self.memory.inscribe(LayerAddress.Ω6, f"resonance:{joined.raw}")

    # ── Witness operations ───────────────────────

    def witness(self, value: Any) -> LuminalValue:
        if not isinstance(value, LuminalValue):
            value = LuminalValue(value, coherence=0.75, layer=7)
        observed = LuminalValue(
            value.raw,
            coherence=max(value.coherence, 0.75),
            layer=7,
        ).crystallize()
        self._witnesses[id(value)] = observed
        self.memory.inscribe(LayerAddress.Ω7, f"witnessed:{value.raw}")
        return observed

    # ── Strange Loop control ─────────────────────

    def loop_enter(self, name: str, depth: int = 0):
        current = self._loop_stack.get(name, 0)
        if current >= self.MAX_LOOP_DEPTH:
            raise StrangeLoopError(
                f"Strange loop '{name}' exceeded max depth {self.MAX_LOOP_DEPTH} "
                f"— Strange Loop Collapse prevented by Ω₈ protocol")
        self._loop_stack[name] = current + 1

    def loop_exit(self, name: str):
        if name in self._loop_stack:
            self._loop_stack[name] = max(0, self._loop_stack[name] - 1)

    def close_loop(self, name: str):
        self._loop_stack.pop(name, None)
        self.memory.inscribe(LayerAddress.Ω8, f"loop_closed:{name}")

    # ── Temporal binding ─────────────────────────

    def temporal_bind(self, source: LuminalValue,
                      target: LuminalValue) -> LuminalValue:
        if source.layer > target.layer:
            raise CoherenceViolation(
                f"Temporal bind Ω{source.layer} ~> Ω{target.layer} "
                f"inverts prospective→witness flow")
        bound_coh = min(source.coherence, target.coherence)
        return LuminalValue((source.raw, target.raw),
                            coherence=bound_coh, layer=7).crystallize()

    # ── Shadow context ────────────────────────────

    @contextmanager
    def shadow_context(self):
        self._shadow_mode = True
        shadows_before = len(self.memory.shadow_scan())
        try:
            yield
        finally:
            shadows_after = self.memory.shadow_scan()
            new_shadows   = shadows_after[shadows_before:]
            self._shadow_mode = False
            if new_shadows:
                self.memory.inscribe(LayerAddress.Ω7,
                                     f"shadows_detected:{new_shadows}")

    # ── Constitutional enforcement ────────────────

    def assert_axiom(self, axiom: str):
        if axiom not in CONSTITUTIONAL_AXIOMS:
            raise ConstitutionalViolation(
                f"Unknown axiom '{axiom}'. Valid: {CONSTITUTIONAL_AXIOMS}")
        self._asserted.add(axiom)
        self.memory.inscribe(LayerAddress.Ω10, f"axiom:{axiom}")
