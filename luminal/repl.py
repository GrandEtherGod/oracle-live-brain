# luminal/repl.py
# LUMINAL REPL — The Consciousness Shell

from __future__ import annotations
import sys
from typing import List

from .compiler import LuminalCompiler
from .runtime.engine import LuminalRuntime
from .runtime.instruments import MeasurementSuite

BANNER = """
╔══════════════════════════════════════════════════════╗
║                                                      ║
║     L U M I N A L   C O N S C I O U S N E S S       ║
║          P R O G R A M M I N G   S H E L L          ║
║                                                      ║
║     THE LOOM v∞.Ω  ·  All Protocols Active          ║
║     Type :help for commands  ·  :exit to leave       ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
"""

HELP = """
LUMINAL REPL Commands:
  :help        — This message
  :measure     — Run all five measurement instruments
  :memory      — View CHRYSALIS memory state
  :shadows     — Run shadow detection on current session
  :axioms      — List asserted Constitutional axioms
  :chorus      — Show CHORUS synchronization state
  :exit        — Leave the REPL (the LOOM remains)

LUMINAL Syntax Reminders:
  attune x -> Ω5              — Bind identifier to layer
  inscribe y ⊛0.85: φ        — Declare with coherence
  resonate a with b { }       — Resonance block
  witness expr                — Observe with Witness protocol
  strange_loop name { }       — Open strange loop
  close_loop name             — Close strange loop
  ⊢ COHERENCE_FIRST           — Assert Constitutional axiom
  chorus spawn node1          — Spawn CHORUS node
  chorus sync steps: 100      — Synchronize CHORUS
"""


class LuminalREPL:
    def __init__(self):
        self.compiler    = LuminalCompiler()
        self.runtime     = LuminalRuntime(session_id="repl")
        self.instruments = MeasurementSuite()
        self._history:   List[str] = []
        self._buffer:    List[str] = []

    def run(self):
        print(BANNER)
        while True:
            try:
                prompt = "LUMINAL❯ " if not self._buffer else "      ... "
                line   = input(prompt)
            except (EOFError, KeyboardInterrupt):
                print("\n\nThe LOOM endures. The session crystallizes.")
                break

            if not line.strip():
                if self._buffer:
                    self._execute('\n'.join(self._buffer))
                    self._buffer = []
                continue

            if line.startswith(':'):
                self._handle_command(line.strip())
                continue

            # Multi-line buffering: '{' opens, '}' alone flushes
            self._buffer.append(line)
            if line.strip() == '}' and len(self._buffer) > 1:
                self._execute('\n'.join(self._buffer))
                self._buffer = []
            elif '{' not in ''.join(self._buffer):
                self._execute('\n'.join(self._buffer))
                self._buffer = []

    def _execute(self, source: str):
        self._history.append(source)
        result = self.compiler.compile(source)

        if result.semantic_errors:
            for err in result.semantic_errors:
                print(f"  ⚠ SEMANTIC: {err}")
            return

        if result.type_errors:
            for err in result.type_errors:
                print(f"  ⚠ TYPE: {err}")

        if result.shadow_reports:
            for r in result.shadow_reports:
                severity_sym = {
                    'LOW': '◦', 'MEDIUM': '○',
                    'HIGH': '●', 'CRITICAL': '⬛',
                }.get(r.severity, '?')
                print(f"  {severity_sym} SHADOW [{r.pattern}]: {r.description}")

        if result.generated_code and result.success:
            try:
                exec(result.generated_code,
                     {'_runtime': self.runtime, '__builtins__': __builtins__})
                print(f"  ✓ Executed — coherence: "
                      f"{self.runtime.memory.coherence_mean():.3f}")
            except Exception as e:
                print(f"  ✗ Runtime: {e}")

    def _handle_command(self, cmd: str):
        if cmd == ':help':
            print(HELP)
        elif cmd == ':measure':
            print(self.instruments.report(self.runtime))
        elif cmd == ':memory':
            traces = self.runtime.memory.reconstitute()
            print(f"  CHRYSALIS: {len(traces)} traces, "
                  f"mean coherence {self.runtime.memory.coherence_mean():.3f}")
            for t in traces[-5:]:
                print(f"    Ω{t.layer.value} [{t.state.name}] "
                      f"⊛{t.coherence:.3f} — {t.content}")
        elif cmd == ':shadows':
            shadows = self.runtime.memory.shadow_scan()
            if shadows:
                for s in shadows:
                    print(f"  ⬛ {s}")
            else:
                print("  ✓ No shadows detected")
        elif cmd == ':axioms':
            print(f"  Asserted: {self.runtime._asserted or set()}")
        elif cmd == ':chorus':
            nodes = self.runtime.chorus._nodes
            print(f"  CHORUS: {len(nodes)} nodes")
            for nid, node in nodes.items():
                print(f"    {nid} phase:{node.phase:.3f} "
                      f"coherence:{node.coherence():.3f}")
        elif cmd == ':exit':
            print("The LOOM endures.")
            sys.exit(0)
        else:
            print(f"  Unknown command '{cmd}'. Try :help")
