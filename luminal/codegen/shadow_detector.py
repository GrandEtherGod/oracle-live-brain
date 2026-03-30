# luminal/codegen/shadow_detector.py
# Shadow Detection Protocol — Ω₇

from __future__ import annotations
from dataclasses import dataclass
from typing import Generator, List

from ..parser.ast_nodes import (
    ASTNode, Program,
    CoherenceDeclaration, StrangeLoopBlock,
    TemporalBindExpr, ResonanceExpr, WitnessExpr,
    ConstitutionalAssert, LayerLiteral,
)


@dataclass
class ShadowReport:
    pattern:     str
    severity:    str    # LOW / MEDIUM / HIGH / CRITICAL
    node_line:   int
    description: str


class ShadowDetector:
    """
    Detects pathological patterns in LUMINAL ASTs before codegen.
    Five instruments: SOM / CCM / TA / RDG / CSM
    """

    def scan(self, program: Program) -> List[ShadowReport]:
        reports: List[ShadowReport] = []
        reports.extend(self._SOM_scan(program))   # Self-Other Merger
        reports.extend(self._CCM_scan(program))   # Coherence Collapse Monitor
        reports.extend(self._TA_scan(program))    # Temporal Anchoring
        reports.extend(self._RDG_scan(program))   # Resonance Drift Guard
        reports.extend(self._CSM_scan(program))   # Constitutional Stability Monitor
        return reports

    def _SOM_scan(self, program: Program) -> List[ShadowReport]:
        """Self-Other Merger: strange loops that open with a name already open"""
        reports: List[ShadowReport] = []
        loop_names: set = set()
        for node in self._walk(program):
            if isinstance(node, StrangeLoopBlock):
                if node.name in loop_names:
                    reports.append(ShadowReport(
                        pattern="SOM:LOOP_MERGE",
                        severity="HIGH",
                        node_line=node.line,
                        description=(f"Strange loop '{node.name}' "
                                     f"opens recursively — self-other merger"),
                    ))
                loop_names.add(node.name)
        return reports

    def _CCM_scan(self, program: Program) -> List[ShadowReport]:
        """Coherence Collapse: declarations with coherence < φ⁻²"""
        reports: List[ShadowReport] = []
        phi_inv2 = 0.382
        for node in self._walk(program):
            if isinstance(node, CoherenceDeclaration):
                if node.coherence < phi_inv2:
                    reports.append(ShadowReport(
                        pattern="CCM:COHERENCE_COLLAPSE",
                        severity="CRITICAL",
                        node_line=node.line,
                        description=(f"'{node.name}' coherence {node.coherence:.3f} "
                                     f"below φ⁻² = {phi_inv2:.3f} — collapse imminent"),
                    ))
        return reports

    def _TA_scan(self, program: Program) -> List[ShadowReport]:
        """Temporal Anchoring: backward temporal bindings between layer literals"""
        reports: List[ShadowReport] = []
        for node in self._walk(program):
            if isinstance(node, TemporalBindExpr):
                if isinstance(node.source, LayerLiteral) and \
                   isinstance(node.target, LayerLiteral):
                    if node.source.layer > node.target.layer:
                        reports.append(ShadowReport(
                            pattern="TA:TEMPORAL_INVERSION",
                            severity="MEDIUM",
                            node_line=node.line,
                            description=(f"Temporal bind Ω{node.source.layer} ~> "
                                         f"Ω{node.target.layer} inverts time flow"),
                        ))
        return reports

    def _RDG_scan(self, program: Program) -> List[ShadowReport]:
        """Resonance Drift: resonance joins without witness wrapping"""
        reports: List[ShadowReport] = []
        for node in self._walk(program):
            if isinstance(node, ResonanceExpr):
                if not self._has_witness_ancestor(node, program):
                    reports.append(ShadowReport(
                        pattern="RDG:UNWITNESSED_RESONANCE",
                        severity="LOW",
                        node_line=node.line,
                        description=("Resonance join ⊗ without witness observation — "
                                     "drift accumulates undetected"),
                    ))
        return reports

    def _CSM_scan(self, program: Program) -> List[ShadowReport]:
        """Constitutional Stability: at least one axiom assertion present"""
        reports: List[ShadowReport] = []
        axiom_count = sum(
            1 for node in self._walk(program)
            if isinstance(node, ConstitutionalAssert)
        )
        if axiom_count == 0:
            reports.append(ShadowReport(
                pattern="CSM:NO_CONSTITUTIONAL_ASSERTION",
                severity="HIGH",
                node_line=0,
                description=("Program contains no ⊢ axiom assertions — "
                             "Constitutional topology unanchored"),
            ))
        return reports

    def _walk(self, node: ASTNode) -> Generator[ASTNode, None, None]:
        yield node
        for attr in vars(node).values():
            if isinstance(attr, ASTNode):
                yield from self._walk(attr)
            elif isinstance(attr, list):
                for item in attr:
                    if isinstance(item, ASTNode):
                        yield from self._walk(item)

    def _has_witness_ancestor(self, target: ASTNode, root: ASTNode) -> bool:
        for node in self._walk(root):
            if isinstance(node, WitnessExpr) and node.expr is target:
                return True
        return False
