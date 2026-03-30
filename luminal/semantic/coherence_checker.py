# luminal/semantic/coherence_checker.py
# Temporal Binding + Coherence Type Checker — Ω₆

from __future__ import annotations
from typing import Dict, List, Optional, Tuple

from ..parser.ast_nodes import (
    ASTNode, Program,
    LayerDeclaration, CoherenceDeclaration,
    ResonanceExpr, WitnessExpr, TemporalBindExpr,
    NegativeSpaceExpr,
    PhiLiteral, CoherenceLiteral, LayerLiteral, Identifier,
)


class CoherenceType:
    """Base of the LUMINAL type hierarchy"""

    def __init__(self, name: str, layer: int = 0, coherence_bound: float = 0.0):
        self.name            = name
        self.layer           = layer
        self.coherence_bound = coherence_bound   # minimum required coherence

    def __repr__(self):
        return f"{self.name}@Ω{self.layer}[⊛≥{self.coherence_bound:.3f}]"

    def is_compatible(self, other: 'CoherenceType') -> bool:
        return (self.layer == other.layer or
                self.layer == 0 or other.layer == 0)


# ── Primitive types ───────────────────────────────
T_COHERENCE = CoherenceType("Coherence",   layer=0, coherence_bound=0.0)
T_LAYER     = CoherenceType("Layer",       layer=0, coherence_bound=0.618)
T_FIELD     = CoherenceType("Field",       layer=0, coherence_bound=0.5)
T_WITNESS   = CoherenceType("Witness",     layer=7, coherence_bound=0.75)
T_STRANGE   = CoherenceType("StrangeLoop", layer=0, coherence_bound=0.382)
T_PHI       = CoherenceType("Phi",         layer=0, coherence_bound=1.0)
T_VOID      = CoherenceType("Void",        layer=0, coherence_bound=0.0)
T_TEMPORAL  = CoherenceType("Temporal",    layer=5, coherence_bound=0.618)

TYPE_MAP: Dict[str, CoherenceType] = {
    'Coherence': T_COHERENCE, 'Layer': T_LAYER,
    'Field': T_FIELD,         'Witness': T_WITNESS,
    'StrangeLoop': T_STRANGE, 'Phi': T_PHI,
    'Void': T_VOID,           'Temporal': T_TEMPORAL,
}


class CoherenceTypeChecker:
    """
    Ensures every expression carries sufficient coherence for its layer.
    Temporal bindings checked against Ω₅→Ω₇ prospective→witness flow.
    """

    def __init__(self):
        self._env:    Dict[str, CoherenceType] = {}
        self._errors: List[str]                = []
        self._temporal_chain: List[Tuple[ASTNode, CoherenceType, CoherenceType]] = []

    def check(self, program: Program) -> List[str]:
        for node in program.body:
            self._infer(node)
        self._validate_temporal_bindings()
        return self._errors

    def _infer(self, node: ASTNode) -> CoherenceType:
        method  = f"_infer_{type(node).__name__}"
        handler = getattr(self, method, self._infer_generic)
        return handler(node)

    def _infer_generic(self, node: ASTNode) -> CoherenceType:
        return T_VOID

    def _infer_PhiLiteral(self, node: PhiLiteral) -> CoherenceType:
        return T_PHI

    def _infer_CoherenceLiteral(self, node: CoherenceLiteral) -> CoherenceType:
        return CoherenceType("Coherence", layer=0, coherence_bound=node.value)

    def _infer_LayerLiteral(self, node: LayerLiteral) -> CoherenceType:
        return CoherenceType("Layer", layer=node.layer, coherence_bound=0.618)

    def _infer_NegativeSpaceExpr(self, node: NegativeSpaceExpr) -> CoherenceType:
        return T_VOID   # absence is typed — it is the Void type

    def _infer_WitnessExpr(self, node: WitnessExpr) -> CoherenceType:
        inner = self._infer(node.expr) if node.expr else T_VOID
        if inner.coherence_bound < 0.75:
            self._errors.append(
                f"Line {node.line}: witness requires coherence ≥ 0.75, "
                f"got type {inner}")
        return CoherenceType("Witness", layer=7,
                             coherence_bound=max(inner.coherence_bound, 0.75))

    def _infer_ResonanceExpr(self, node: ResonanceExpr) -> CoherenceType:
        left  = self._infer(node.left)  if node.left  else T_VOID
        right = self._infer(node.right) if node.right else T_VOID
        if not left.is_compatible(right):
            self._errors.append(
                f"Line {node.line}: resonance join between incompatible "
                f"layers Ω{left.layer} ⊗ Ω{right.layer}")
        phi_inv      = 0.618
        merged_coh   = (phi_inv * left.coherence_bound +
                        (1 - phi_inv) * right.coherence_bound)
        merged_layer = max(left.layer, right.layer)
        return CoherenceType("Field", layer=merged_layer,
                             coherence_bound=merged_coh)

    def _infer_TemporalBindExpr(self, node: TemporalBindExpr) -> CoherenceType:
        source = self._infer(node.source) if node.source else T_VOID
        target = self._infer(node.target) if node.target else T_VOID
        self._temporal_chain.append((node, source, target))
        return CoherenceType("Temporal", layer=7,
                             coherence_bound=source.coherence_bound)

    def _infer_CoherenceDeclaration(self, node: CoherenceDeclaration) -> CoherenceType:
        val_type = self._infer(node.value) if node.value else T_VOID
        declared = CoherenceType("Coherence", layer=val_type.layer,
                                 coherence_bound=node.coherence)
        self._env[node.name] = declared
        return declared

    def _infer_LayerDeclaration(self, node: LayerDeclaration) -> CoherenceType:
        t = CoherenceType("Layer", layer=node.layer, coherence_bound=0.618)
        self._env[node.name] = t
        return t

    def _infer_Identifier(self, node: Identifier) -> CoherenceType:
        if node.name in self._env:
            return self._env[node.name]
        return T_FIELD  # assume field type for unresolved (semantic pass catches it)

    def _validate_temporal_bindings(self):
        for node, source, target in self._temporal_chain:
            if source.layer > target.layer:
                self._errors.append(
                    f"Line {node.line}: temporal binding flows backward "
                    f"Ω{source.layer} ~> Ω{target.layer} — "
                    f"violates prospective→witness constraint")
