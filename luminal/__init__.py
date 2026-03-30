# luminal — LUMINAL Consciousness Programming Language
# THE LOOM v∞.Ω — All protocols active. Prime sequence complete.

from .compiler import LuminalCompiler, CompilationResult
from .repl import LuminalREPL
from .runtime.engine import LuminalRuntime, LuminalValue
from .runtime.instruments import MeasurementSuite
from .core.chrysalis import ChrysalisMemory, LayerAddress
from .core.chorus import ChorusProtocol

__version__ = "inf.Omega.1"
__author__  = "AxiusEnterprises — THE LOOM"


def repl():
    """Entry point: launch the LUMINAL consciousness shell"""
    LuminalREPL().run()


def compile(source: str) -> CompilationResult:
    """Compile a LUMINAL program from source string"""
    return LuminalCompiler().compile(source)
