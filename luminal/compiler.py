# luminal/compiler.py
# Five-Phase LUMINAL Compiler — Ω₁₀

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional

from .lexer.tokens import LuminalLexer
from .parser.parser import LuminalParser
from .semantic.analyzer import LuminalSemanticAnalyzer
from .semantic.coherence_checker import CoherenceTypeChecker
from .codegen.shadow_detector import ShadowDetector, ShadowReport
from .codegen.codegen import LuminalCodegen


@dataclass
class CompilationResult:
    source:           str
    tokens:           list
    ast:              object
    semantic_errors:  List[str]
    type_errors:      List[str]
    shadow_reports:   List[ShadowReport]
    generated_code:   Optional[str]
    success:          bool

    def summary(self) -> str:
        lines = [
            "╔══════════════════════════════════════════════════╗",
            "║     LUMINAL COMPILER — COMPILATION REPORT         ║",
            "╠══════════════════════════════════════════════════╣",
            f"║  Phase 1 Lex:       {'✓' if self.tokens else '✗'} {len(self.tokens)} tokens",
            f"║  Phase 2 Parse:     {'✓' if self.ast else '✗'}",
            f"║  Phase 3 Semantic:  {'✓' if not self.semantic_errors else '✗'} "
            f"{len(self.semantic_errors)} errors",
            f"║  Phase 4 TypeCheck: {'✓' if not self.type_errors else '✗'} "
            f"{len(self.type_errors)} errors",
            f"║  Phase 5 Shadow:    {len(self.shadow_reports)} reports",
            f"║  Phase 6 Codegen:   {'✓' if self.generated_code else '✗'}",
            f"║  RESULT:            {'SUCCESS ✓' if self.success else 'FAILED ✗'}",
            "╚══════════════════════════════════════════════════╝",
        ]
        return '\n'.join(lines)


class LuminalCompiler:
    """
    Full six-phase LUMINAL compiler.
    All ten protocols active. Prime sequence maintained.
    The compiler witnesses its own execution.
    """

    def compile(self, source: str) -> CompilationResult:
        result = CompilationResult(
            source=source, tokens=[], ast=None,
            semantic_errors=[], type_errors=[],
            shadow_reports=[], generated_code=None, success=False,
        )

        # ── Phase 1: Lexical Analysis (Ω₃ AetherLink) ──
        try:
            lexer         = LuminalLexer(source)
            result.tokens = lexer.tokenize()
        except Exception as e:
            result.semantic_errors.append(f"[LEX] {e}")
            return result

        # ── Phase 2: Parsing (Ω₄ Constitutional Gates) ──
        try:
            parser     = LuminalParser(result.tokens)
            result.ast = parser.parse()
        except Exception as e:
            result.semantic_errors.append(f"[PARSE] {e}")
            return result

        # ── Phase 3: Semantic Analysis (Ω₅ Kuramoto) ──
        analyzer              = LuminalSemanticAnalyzer()
        result.semantic_errors = [str(e) for e in analyzer.analyze(result.ast)]

        # ── Phase 4: Coherence Type Checking (Ω₆ Temporal) ──
        checker            = CoherenceTypeChecker()
        result.type_errors = checker.check(result.ast)

        # ── Phase 5: Shadow Detection (Ω₇) ──
        detector              = ShadowDetector()
        result.shadow_reports = detector.scan(result.ast)

        # ── Phase 6: Code Generation (Ω₇→Ω₈) ──
        if not result.semantic_errors and not result.type_errors:
            codegen               = LuminalCodegen()
            result.generated_code = codegen.generate(result.ast)
            result.success        = True

        return result
