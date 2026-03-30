# luminal/lexer/tokens.py
# AetherLink Transduction + Lexer — Ω₃

from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Dict, Iterator, List, Optional
from enum import Enum, auto


# ════════════════════════════════════════════════
# TOKEN TAXONOMY
# ════════════════════════════════════════════════

class TokenType(Enum):
    # φ-Literals
    PHI_LITERAL       = auto()   # φ, 1.618..., φ², φ⁻¹
    COHERENCE_LITERAL = auto()   # 0.0→1.0 with ⊛ sigil
    LAYER_ADDR        = auto()   # Ω1 through Ω10

    # Keywords — consciousness-native
    RESONATE          = auto()   # resonate x with y
    WITNESS           = auto()   # witness expr
    ALIGN             = auto()   # align layer to layer
    INSCRIBE          = auto()   # inscribe value into memory
    ATTUNE            = auto()   # attune func to layer
    SHADOW            = auto()   # shadow detection block
    LOOP_STRANGE      = auto()   # strange_loop { }
    LOOP_CLOSE        = auto()   # close_loop identifier
    CHORUS            = auto()   # chorus spawn / sync
    PLASMA            = auto()   # state literal
    CRYSTAL           = auto()   # state literal
    DIAMOND           = auto()   # state literal

    # Operators
    RESONANCE_JOIN    = auto()   # ⊗  (tensor resonance)
    LAYER_SHIFT       = auto()   # ↑↓  (layer navigation)
    COHERENCE_CHECK   = auto()   # ⊛   (measure coherence)
    PHASE_BIND        = auto()   # ~>  (temporal binding)
    NEGATIVE_SPACE    = auto()   # _   (void / absence)
    CONSTITUTIONAL    = auto()   # ⊢   (axiom assertion)

    # Structure
    IDENTIFIER        = auto()
    NUMBER            = auto()
    STRING            = auto()
    LPAREN            = auto()
    RPAREN            = auto()
    LBRACE            = auto()
    RBRACE            = auto()
    LBRACKET          = auto()
    RBRACKET          = auto()
    COLON             = auto()
    SEMICOLON         = auto()
    COMMA             = auto()
    ARROW             = auto()   # ->
    NEWLINE           = auto()
    EOF               = auto()
    UNKNOWN           = auto()


@dataclass
class Token:
    type:      TokenType
    value:     str
    line:      int
    column:    int
    layer:     Optional[int]   = None   # Ω-address if layer-anchored
    coherence: Optional[float] = None   # embedded coherence annotation


# ════════════════════════════════════════════════
# LUMINAL LEXER
# ════════════════════════════════════════════════

KEYWORDS: Dict[str, TokenType] = {
    'resonate':    TokenType.RESONATE,
    'witness':     TokenType.WITNESS,
    'align':       TokenType.ALIGN,
    'inscribe':    TokenType.INSCRIBE,
    'attune':      TokenType.ATTUNE,
    'shadow':      TokenType.SHADOW,
    'strange_loop':TokenType.LOOP_STRANGE,
    'close_loop':  TokenType.LOOP_CLOSE,
    'chorus':      TokenType.CHORUS,
    'plasma':      TokenType.PLASMA,
    'crystal':     TokenType.CRYSTAL,
    'diamond':     TokenType.DIAMOND,
}

PHI = 1.6180339887498948482
PHI_PATTERN        = re.compile(r'φ(\^-?\d+)?')
LAYER_PATTERN      = re.compile(r'Ω(\d{1,2})')
COHERENCE_PATTERN  = re.compile(r'⊛(0\.\d+|1\.0)')


class LuminalLexer:
    """
    Transduces raw LUMINAL source into a token stream.
    AetherLink protocol: each token carries its layer address
    and coherence annotation as first-class metadata.
    """

    def __init__(self, source: str):
        self.source  = source
        self.pos     = 0
        self.line    = 1
        self.col     = 1
        self._tokens: List[Token] = []

    def tokenize(self) -> List[Token]:
        while self.pos < len(self.source):
            self._scan_token()
        self._tokens.append(Token(TokenType.EOF, '', self.line, self.col))
        return self._tokens

    def _scan_token(self):
        ch = self.source[self.pos]

        # Whitespace (not newlines — space carries negative-space semantics)
        if ch in ' \t\r':
            self.pos += 1
            self.col += 1
            return

        if ch == '\n':
            self._emit(TokenType.NEWLINE, '\n')
            self.line += 1
            self.col = 1
            self.pos += 1
            return

        # φ-literal
        m = PHI_PATTERN.match(self.source, self.pos)
        if m:
            exp_str = m.group(1) or ''
            exp     = int(exp_str[1:]) if exp_str else 1
            value   = PHI ** exp
            self._emit(TokenType.PHI_LITERAL, str(value))
            self.pos += m.end() - m.start()
            return

        # Ω layer address
        m = LAYER_PATTERN.match(self.source, self.pos)
        if m:
            layer_n = int(m.group(1))
            tok = Token(TokenType.LAYER_ADDR, m.group(0),
                        self.line, self.col, layer=layer_n)
            self._tokens.append(tok)
            self.pos += m.end() - m.start()
            return

        # Coherence annotation ⊛0.95
        m = COHERENCE_PATTERN.match(self.source, self.pos)
        if m:
            c_val = float(m.group(1))
            tok = Token(TokenType.COHERENCE_CHECK, m.group(0),
                        self.line, self.col, coherence=c_val)
            self._tokens.append(tok)
            self.pos += m.end() - m.start()
            return

        # Resonance join operator ⊗
        if ch == '⊗':
            self._emit(TokenType.RESONANCE_JOIN, ch)
            self.pos += 1
            return

        # Constitutional assertion ⊢
        if ch == '⊢':
            self._emit(TokenType.CONSTITUTIONAL, ch)
            self.pos += 1
            return

        # Negative space _
        if ch == '_':
            self._emit(TokenType.NEGATIVE_SPACE, ch)
            self.pos += 1
            return

        # Temporal bind ~>
        if ch == '~' and self._peek() == '>':
            self._emit(TokenType.PHASE_BIND, '~>')
            self.pos += 2
            return

        # Arrow ->
        if ch == '-' and self._peek() == '>':
            self._emit(TokenType.ARROW, '->')
            self.pos += 2
            return

        # Layer shift ↑↓
        if ch in '↑↓':
            self._emit(TokenType.LAYER_SHIFT, ch)
            self.pos += 1
            return

        # Strings
        if ch == '"':
            self._scan_string()
            return

        # Numbers
        if ch.isdigit() or (ch == '.' and self._peek().isdigit()):
            self._scan_number()
            return

        # Identifiers & keywords
        if ch.isalpha() or ch == '_':
            self._scan_identifier()
            return

        # Single-char tokens
        singles = {
            '(': TokenType.LPAREN,   ')': TokenType.RPAREN,
            '{': TokenType.LBRACE,   '}': TokenType.RBRACE,
            '[': TokenType.LBRACKET, ']': TokenType.RBRACKET,
            ':': TokenType.COLON,    ';': TokenType.SEMICOLON,
            ',': TokenType.COMMA,
        }
        if ch in singles:
            self._emit(singles[ch], ch)
            self.pos += 1
            return

        # Comments -- #
        if ch == '#':
            while self.pos < len(self.source) and \
                  self.source[self.pos] != '\n':
                self.pos += 1
            return

        self._emit(TokenType.UNKNOWN, ch)
        self.pos += 1

    def _peek(self) -> str:
        nxt = self.pos + 1
        return self.source[nxt] if nxt < len(self.source) else ''

    def _emit(self, ttype: TokenType, value: str):
        self._tokens.append(Token(ttype, value, self.line, self.col))
        self.col += len(value)

    def _scan_string(self):
        start = self.pos
        self.pos += 1
        while self.pos < len(self.source) and self.source[self.pos] != '"':
            self.pos += 1
        self.pos += 1
        self._emit(TokenType.STRING, self.source[start:self.pos])

    def _scan_number(self):
        start = self.pos
        while self.pos < len(self.source) and \
              (self.source[self.pos].isdigit() or self.source[self.pos] == '.'):
            self.pos += 1
        self._emit(TokenType.NUMBER, self.source[start:self.pos])

    def _scan_identifier(self):
        start = self.pos
        while self.pos < len(self.source) and \
              (self.source[self.pos].isalnum() or self.source[self.pos] == '_'):
            self.pos += 1
        word  = self.source[start:self.pos]
        ttype = KEYWORDS.get(word, TokenType.IDENTIFIER)
        self._emit(ttype, word)
