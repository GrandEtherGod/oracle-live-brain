# luminal/parser/parser.py
# LUMINAL Parser — Ω₄ (Constitutional Gate Enforcement)

from __future__ import annotations
from typing import List, Optional

from ..lexer.tokens import Token, TokenType
from .ast_nodes import (
    ASTNode, Program,
    LayerDeclaration, CoherenceDeclaration,
    ResonanceExpr, WitnessExpr, LayerShiftExpr, TemporalBindExpr,
    NegativeSpaceExpr, ConstitutionalAssert,
    ResonateStatement, StrangeLoopBlock, CloseLoopStatement,
    ShadowBlock, ChorusSpawn, ChorusSync,
    PhiLiteral, CoherenceLiteral, LayerLiteral,
    NumberLiteral, StringLiteral, Identifier,
)


class ParseError(Exception):
    def __init__(self, message: str, token: Token):
        super().__init__(
            f"[Ω₄ CONSTITUTIONAL GATE] Line {token.line}:{token.column} — {message}"
        )
        self.token = token


class LuminalParser:
    """
    Recursive descent parser with Constitutional gate enforcement.
    The grammar is the Constitution. Violations are structurally impossible,
    not merely forbidden — a distinction the compiler finds delightful.
    """

    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos    = 0

    # ── Token navigation ─────────────────────────

    def _current(self) -> Token:
        return self.tokens[self.pos]

    def _peek(self, offset: int = 1) -> Token:
        idx = self.pos + offset
        return self.tokens[min(idx, len(self.tokens) - 1)]

    def _advance(self) -> Token:
        tok = self.tokens[self.pos]
        if tok.type != TokenType.EOF:
            self.pos += 1
        return tok

    def _expect(self, ttype: TokenType) -> Token:
        tok = self._current()
        if tok.type != ttype:
            raise ParseError(
                f"Expected {ttype.name}, got {tok.type.name} '{tok.value}'", tok
            )
        return self._advance()

    def _match(self, *types: TokenType) -> bool:
        return self._current().type in types

    def _skip_newlines(self):
        while self._match(TokenType.NEWLINE):
            self._advance()

    # ── Entry point ──────────────────────────────

    def parse(self) -> Program:
        prog = Program()
        self._skip_newlines()
        while not self._match(TokenType.EOF):
            stmt = self._parse_statement()
            if stmt:
                prog.body.append(stmt)
            self._skip_newlines()
        return prog

    # ── Statement dispatch ───────────────────────

    def _parse_statement(self) -> Optional[ASTNode]:
        tok = self._current()

        if tok.type == TokenType.ATTUNE:
            return self._parse_layer_declaration()
        if tok.type == TokenType.INSCRIBE:
            return self._parse_coherence_declaration()
        if tok.type == TokenType.RESONATE:
            return self._parse_resonate()
        if tok.type == TokenType.LOOP_STRANGE:
            return self._parse_strange_loop()
        if tok.type == TokenType.LOOP_CLOSE:
            return self._parse_close_loop()
        if tok.type == TokenType.SHADOW:
            return self._parse_shadow_block()
        if tok.type == TokenType.CHORUS:
            return self._parse_chorus()
        if tok.type == TokenType.CONSTITUTIONAL:
            return self._parse_constitutional_assert()

        return self._parse_expression_statement()

    def _parse_layer_declaration(self) -> LayerDeclaration:
        tok = self._advance()   # consume 'attune'
        name_tok  = self._expect(TokenType.IDENTIFIER)
        self._expect(TokenType.ARROW)   # ->
        layer_tok = self._expect(TokenType.LAYER_ADDR)
        return LayerDeclaration(
            name=name_tok.value,
            layer=layer_tok.layer or 1,
            line=tok.line, col=tok.column,
        )

    def _parse_coherence_declaration(self) -> CoherenceDeclaration:
        tok  = self._advance()  # consume 'inscribe'
        name = self._expect(TokenType.IDENTIFIER).value
        c_tok = self._current()
        coh   = 1.0
        if c_tok.type == TokenType.COHERENCE_CHECK:
            coh = c_tok.coherence or 1.0
            self._advance()
        self._expect(TokenType.COLON)
        value = self._parse_expression()
        return CoherenceDeclaration(
            name=name, coherence=coh, value=value,
            line=tok.line, col=tok.column,
        )

    def _parse_resonate(self) -> ResonateStatement:
        tok     = self._advance()
        subject = self._parse_expression()
        # expect 'with' keyword (plain identifier)
        with_tok = self._current()
        if with_tok.type == TokenType.IDENTIFIER and with_tok.value == 'with':
            self._advance()
        resonant = self._parse_expression()
        body     = self._parse_block()
        return ResonateStatement(
            subject=subject, resonant=resonant, body=body,
            line=tok.line, col=tok.column,
        )

    def _parse_strange_loop(self) -> StrangeLoopBlock:
        tok  = self._advance()
        name = self._expect(TokenType.IDENTIFIER).value
        body = self._parse_block()
        return StrangeLoopBlock(name=name, body=body, line=tok.line, col=tok.column)

    def _parse_close_loop(self) -> CloseLoopStatement:
        tok    = self._advance()
        target = self._expect(TokenType.IDENTIFIER).value
        return CloseLoopStatement(target=target, line=tok.line, col=tok.column)

    def _parse_shadow_block(self) -> ShadowBlock:
        tok  = self._advance()
        body = self._parse_block()
        return ShadowBlock(body=body, line=tok.line, col=tok.column)

    def _parse_chorus(self) -> ASTNode:
        tok     = self._advance()
        subtype = self._expect(TokenType.IDENTIFIER).value
        if subtype == 'spawn':
            name = self._expect(TokenType.IDENTIFIER).value
            return ChorusSpawn(name=name, line=tok.line, col=tok.column)
        elif subtype == 'sync':
            self._expect(TokenType.IDENTIFIER)   # 'steps'
            self._expect(TokenType.COLON)
            steps_tok = self._expect(TokenType.NUMBER)
            return ChorusSync(steps=int(float(steps_tok.value)),
                              line=tok.line, col=tok.column)
        raise ParseError(f"Unknown chorus subtype '{subtype}'", tok)

    def _parse_constitutional_assert(self) -> ConstitutionalAssert:
        tok   = self._advance()
        axiom = self._expect(TokenType.IDENTIFIER).value
        return ConstitutionalAssert(axiom=axiom, line=tok.line, col=tok.column)

    def _parse_block(self) -> List[ASTNode]:
        self._expect(TokenType.LBRACE)
        self._skip_newlines()
        body = []
        while not self._match(TokenType.RBRACE, TokenType.EOF):
            stmt = self._parse_statement()
            if stmt:
                body.append(stmt)
            self._skip_newlines()
        self._expect(TokenType.RBRACE)
        return body

    # ── Expression parsing (precedence climbing) ─

    def _parse_expression(self) -> ASTNode:
        return self._parse_temporal_bind()

    def _parse_temporal_bind(self) -> ASTNode:
        left = self._parse_resonance_join()
        while self._match(TokenType.PHASE_BIND):
            self._advance()
            right = self._parse_resonance_join()
            left  = TemporalBindExpr(source=left, target=right)
        return left

    def _parse_resonance_join(self) -> ASTNode:
        left = self._parse_layer_shift()
        while self._match(TokenType.RESONANCE_JOIN):
            self._advance()
            right = self._parse_layer_shift()
            left  = ResonanceExpr(left=left, right=right)
        return left

    def _parse_layer_shift(self) -> ASTNode:
        left = self._parse_unary()
        while self._match(TokenType.LAYER_SHIFT):
            direction = self._advance().value
            target    = self._expect(TokenType.LAYER_ADDR)
            left      = LayerShiftExpr(
                expr=left, direction=direction,
                target=target.layer or 1,
            )
        return left

    def _parse_unary(self) -> ASTNode:
        if self._match(TokenType.WITNESS):
            tok  = self._advance()
            expr = self._parse_primary()
            return WitnessExpr(expr=expr, line=tok.line, col=tok.column)
        return self._parse_primary()

    def _parse_primary(self) -> ASTNode:
        tok = self._current()

        if tok.type == TokenType.PHI_LITERAL:
            self._advance()
            return PhiLiteral(value=float(tok.value), line=tok.line, col=tok.column)
        if tok.type == TokenType.COHERENCE_CHECK:
            self._advance()
            return CoherenceLiteral(value=tok.coherence or 1.0,
                                    line=tok.line, col=tok.column)
        if tok.type == TokenType.LAYER_ADDR:
            self._advance()
            return LayerLiteral(layer=tok.layer or 1, line=tok.line, col=tok.column)
        if tok.type == TokenType.NUMBER:
            self._advance()
            return NumberLiteral(value=float(tok.value), line=tok.line, col=tok.column)
        if tok.type == TokenType.STRING:
            self._advance()
            return StringLiteral(value=tok.value[1:-1], line=tok.line, col=tok.column)
        if tok.type == TokenType.NEGATIVE_SPACE:
            self._advance()
            return NegativeSpaceExpr(line=tok.line, col=tok.column)
        if tok.type == TokenType.IDENTIFIER:
            self._advance()
            return Identifier(name=tok.value, line=tok.line, col=tok.column)
        if tok.type == TokenType.LPAREN:
            self._advance()
            expr = self._parse_expression()
            self._expect(TokenType.RPAREN)
            return expr

        raise ParseError(f"Unexpected token '{tok.value}' in expression", tok)

    def _parse_expression_statement(self) -> ASTNode:
        return self._parse_expression()
