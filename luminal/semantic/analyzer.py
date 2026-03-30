# luminal/semantic/analyzer.py
# Kuramoto Sync + Semantic Analysis — Ω₅

from __future__ import annotations
import math
from typing import Dict, List, Optional, Set, Tuple

from ..parser.ast_nodes import (
    ASTNode, Program,
    LayerDeclaration, CoherenceDeclaration,
    ResonanceExpr, WitnessExpr, TemporalBindExpr,
    StrangeLoopBlock, CloseLoopStatement, ConstitutionalAssert,
    CoherenceLiteral, PhiLiteral, Identifier,
)
from ..core.chrysalis import ChrysalisMemory, LayerAddress, MemoryState


class SemanticError(Exception):
    def __init__(self, msg: str, node: ASTNode):
        super().__init__(f"[Ω₅ SEMANTIC] Line {node.line}:{node.col} — {msg}")
        self.node = node


class CoherenceScope:
    """
    A scope where symbols carry coherence annotations and layer addresses.
    Not a symbol table — a resonance field.
    """

    def __init__(self, parent: Optional['CoherenceScope'] = None):
        self.parent   = parent
        self._symbols: Dict[str, Tuple[float, int]] = {}
        # name → (coherence, layer)

    def declare(self, name: str, coherence: float, layer: int):
        self._symbols[name] = (coherence, layer)

    def resolve(self, name: str) -> Optional[Tuple[float, int]]:
        if name in self._symbols:
            return self._symbols[name]
        if self.parent:
            return self.parent.resolve(name)
        return None

    def child(self) -> 'CoherenceScope':
        return CoherenceScope(parent=self)


class LuminalSemanticAnalyzer:
    """
    Walks the AST, enforces layer-locality, coherence bounds,
    Constitutional axiom obligations, and Strange Loop safety.
    Kuramoto order parameter must exceed φ⁻¹ for program coherence.
    """

    PHI_INV = 1.0 / 1.6180339887498948482   # ≈ 0.618

    CONSTITUTIONAL_AXIOMS: Set[str] = {
        'COHERENCE_FIRST',
        'LAYER_NATIVE',
        'RESONANCE_PRIMITIVE',
        'WITNESS_PASSIVE',
    }

    def __init__(self):
        self.scope             = CoherenceScope()
        self.memory            = ChrysalisMemory("semantic_pass")
        self._open_loops:      Set[str]         = set()
        self._loop_depths:     Dict[str, int]   = {}
        self._errors:          List[SemanticError] = []
        self._coherences:      List[float]      = []
        self._asserted_axioms: Set[str]         = set()

    def analyze(self, program: Program) -> List[SemanticError]:
        for node in program.body:
            self._visit(node)
        self._check_program_coherence()
        self._check_axiom_obligations()
        return self._errors

    def _visit(self, node: ASTNode):
        method  = f"_visit_{type(node).__name__}"
        visitor = getattr(self, method, self._visit_generic)
        visitor(node)

    def _visit_generic(self, node: ASTNode):
        for attr in vars(node).values():
            if isinstance(attr, ASTNode):
                self._visit(attr)
            elif isinstance(attr, list):
                for item in attr:
                    if isinstance(item, ASTNode):
                        self._visit(item)

    def _visit_LayerDeclaration(self, node: LayerDeclaration):
        self.scope.declare(node.name, coherence=1.0, layer=node.layer)
        self.memory.inscribe(LayerAddress(node.layer), f"decl:{node.name}")

    def _visit_CoherenceDeclaration(self, node: CoherenceDeclaration):
        if node.coherence < 0.0 or node.coherence > 1.0:
            self._errors.append(SemanticError(
                f"Coherence {node.coherence} out of [0,1] bounds", node))
        self.scope.declare(node.name, node.coherence, layer=1)
        self._coherences.append(node.coherence)
        if node.value:
            self._visit(node.value)

    def _visit_StrangeLoopBlock(self, node: StrangeLoopBlock):
        if node.name in self._open_loops:
            self._errors.append(SemanticError(
                f"Strange loop '{node.name}' nested inside itself — "
                f"Strange Loop Collapse detected", node))
            return
        self._open_loops.add(node.name)
        self._loop_depths[node.name] = self._loop_depths.get(node.name, 0) + 1
        if self._loop_depths[node.name] > 3:
            self._errors.append(SemanticError(
                f"Strange loop '{node.name}' exceeded depth 3 "
                f"— Ω₈ collapse threshold", node))
        child_scope = self.scope.child()
        saved       = self.scope
        self.scope  = child_scope
        for stmt in node.body:
            self._visit(stmt)
        self.scope = saved
        self._open_loops.discard(node.name)

    def _visit_CloseLoopStatement(self, node: CloseLoopStatement):
        if node.target not in self._loop_depths:
            self._errors.append(SemanticError(
                f"close_loop '{node.target}' has no matching strange_loop", node))

    def _visit_ConstitutionalAssert(self, node: ConstitutionalAssert):
        if node.axiom not in self.CONSTITUTIONAL_AXIOMS:
            self._errors.append(SemanticError(
                f"Unknown Constitutional axiom '{node.axiom}'. "
                f"Valid: {self.CONSTITUTIONAL_AXIOMS}", node))
        self._asserted_axioms.add(node.axiom)

    def _visit_ResonanceExpr(self, node: ResonanceExpr):
        if node.left:
            self._visit(node.left)
        if node.right:
            self._visit(node.right)
        left_coh  = self._coherence_of(node.left)
        right_coh = self._coherence_of(node.right)
        joined = (self.PHI_INV * left_coh + (1 - self.PHI_INV) * right_coh)
        self._coherences.append(joined)

    def _visit_Identifier(self, node: Identifier):
        result = self.scope.resolve(node.name)
        if result is None:
            self._errors.append(SemanticError(
                f"Unresolved identifier '{node.name}'", node))

    def _coherence_of(self, node: Optional[ASTNode]) -> float:
        if node is None:
            return 0.5
        if isinstance(node, CoherenceLiteral):
            return node.value
        if isinstance(node, PhiLiteral):
            return min(node.value / 2.0, 1.0)
        if isinstance(node, Identifier):
            result = self.scope.resolve(node.name)
            return result[0] if result else 0.5
        return 0.75

    def _check_program_coherence(self):
        if not self._coherences:
            return
        r = sum(self._coherences) / len(self._coherences)
        if r < self.PHI_INV:
            self._errors.append(SemanticError(
                f"Program coherence {r:.3f} below φ⁻¹ = {self.PHI_INV:.3f} "
                f"— Kuramoto order parameter insufficient for execution",
                Program()))

    def _check_axiom_obligations(self):
        required = {'COHERENCE_FIRST'}
        missing  = required - self._asserted_axioms
        if missing:
            self._errors.append(SemanticError(
                f"Missing required Constitutional assertions: {missing}",
                Program()))
