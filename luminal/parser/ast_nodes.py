# luminal/parser/ast_nodes.py
# Constitutional Gates + AST — Ω₄

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, List, Optional


# ════════════════════════════════════════════════
# AST NODE HIERARCHY
# ════════════════════════════════════════════════

@dataclass
class ASTNode:
    line: int = 0
    col:  int = 0


@dataclass
class Program(ASTNode):
    body: List[ASTNode] = field(default_factory=list)


# ── Declarations ─────────────────────────────────

@dataclass
class LayerDeclaration(ASTNode):
    """attune identifier -> Ω5"""
    name:  str = ""
    layer: int = 1


@dataclass
class CoherenceDeclaration(ASTNode):
    """inscribe name ⊛0.85: value"""
    name:      str            = ""
    coherence: float          = 1.0
    value:     Optional[ASTNode] = None


# ── Expressions ──────────────────────────────────

@dataclass
class ResonanceExpr(ASTNode):
    """left ⊗ right"""
    left:  Optional[ASTNode] = None
    right: Optional[ASTNode] = None


@dataclass
class WitnessExpr(ASTNode):
    """witness expr"""
    expr: Optional[ASTNode] = None


@dataclass
class LayerShiftExpr(ASTNode):
    """expr ↑ Ω7  or  expr ↓ Ω3"""
    expr:      Optional[ASTNode] = None
    direction: str               = "↑"
    target:    int               = 1


@dataclass
class TemporalBindExpr(ASTNode):
    """source ~> target"""
    source: Optional[ASTNode] = None
    target: Optional[ASTNode] = None


@dataclass
class NegativeSpaceExpr(ASTNode):
    """_ (the meaningful void)"""
    pass


@dataclass
class ConstitutionalAssert(ASTNode):
    """⊢ axiom_name"""
    axiom: str = ""


# ── Control Flow ─────────────────────────────────

@dataclass
class ResonateStatement(ASTNode):
    """resonate x with y { body }"""
    subject:  Optional[ASTNode]  = None
    resonant: Optional[ASTNode]  = None
    body:     List[ASTNode]      = field(default_factory=list)


@dataclass
class StrangeLoopBlock(ASTNode):
    """strange_loop identifier { body }"""
    name:             str        = ""
    body:             List[ASTNode] = field(default_factory=list)
    witness_required: bool       = True


@dataclass
class CloseLoopStatement(ASTNode):
    """close_loop identifier"""
    target: str = ""


@dataclass
class ShadowBlock(ASTNode):
    """shadow { detection_body }"""
    body: List[ASTNode] = field(default_factory=list)


@dataclass
class ChorusSpawn(ASTNode):
    """chorus spawn identifier"""
    name: str = ""


@dataclass
class ChorusSync(ASTNode):
    """chorus sync steps: N"""
    steps: int = 100


# ── Literals ─────────────────────────────────────

@dataclass
class PhiLiteral(ASTNode):
    value: float = 1.618033988749895


@dataclass
class CoherenceLiteral(ASTNode):
    value: float = 1.0


@dataclass
class LayerLiteral(ASTNode):
    layer: int = 1


@dataclass
class NumberLiteral(ASTNode):
    value: float = 0.0


@dataclass
class StringLiteral(ASTNode):
    value: str = ""


@dataclass
class Identifier(ASTNode):
    name: str = ""
