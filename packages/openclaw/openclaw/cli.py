"""OpenClaw CLI — interact with agents from the command line.

Usage::

    openclaw run --agent terminal "list files in my project"
    openclaw chat --agent theia
    openclaw list-agents
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import click
from dotenv import load_dotenv

load_dotenv()

if TYPE_CHECKING:
    from .agent import OpenClawAgent

_AGENT_CHOICES = click.Choice(["terminal", "theia", "autodream", "autocrystalize"])
_MODEL_DEFAULT = "claude-sonnet-4-6"
_BACKEND_DEFAULT = "http://localhost:3000"


@click.group()
@click.version_option(package_name="openclaw-agents")
def main() -> None:
    """OpenClaw — AI agent CLI for AetherLinkOS / Theia Engine."""


# ---------------------------------------------------------------------------
# openclaw run
# ---------------------------------------------------------------------------


@main.command()
@click.option(
    "--agent", "-a",
    default="terminal",
    show_default=True,
    type=_AGENT_CHOICES,
    help="Agent type to use.",
)
@click.option(
    "--model",
    default=_MODEL_DEFAULT,
    show_default=True,
    help="Claude model ID.",
)
@click.option(
    "--backend",
    default=_BACKEND_DEFAULT,
    show_default=True,
    help="AetherLinkOS backend URL (used by the theia agent).",
)
@click.option(
    "--session",
    default="default",
    show_default=True,
    help="Session ID for autodream/autocrystalize agents.",
)
@click.argument("prompt")
def run(agent: str, model: str, backend: str, session: str, prompt: str) -> None:
    """Run a single PROMPT through an OpenClaw agent and print the result."""
    instance = _build_agent(agent, model, backend, session)
    result = instance.run(prompt)
    click.echo(result["result"])


# ---------------------------------------------------------------------------
# openclaw chat
# ---------------------------------------------------------------------------


@main.command()
@click.option(
    "--agent", "-a",
    default="terminal",
    show_default=True,
    type=_AGENT_CHOICES,
    help="Agent type to use.",
)
@click.option(
    "--model",
    default=_MODEL_DEFAULT,
    show_default=True,
    help="Claude model ID.",
)
@click.option(
    "--backend",
    default=_BACKEND_DEFAULT,
    show_default=True,
    help="AetherLinkOS backend URL (used by the theia agent).",
)
@click.option(
    "--session",
    default="default",
    show_default=True,
    help="Session ID for autodream/autocrystalize agents.",
)
def chat(agent: str, model: str, backend: str, session: str) -> None:
    """Start an interactive chat session with an OpenClaw agent."""
    instance = _build_agent(agent, model, backend, session)
    click.echo(f"OpenClaw {agent} agent ready. Type 'exit' or Ctrl-D to quit.\n")

    while True:
        try:
            user_input = click.prompt("you")
        except (EOFError, click.Abort):
            click.echo("\nGoodbye.")
            break

        if user_input.strip().lower() in {"exit", "quit", "bye"}:
            click.echo("Goodbye.")
            break

        result = instance.run(user_input)
        click.echo(f"agent: {result['result']}\n")


# ---------------------------------------------------------------------------
# openclaw list-agents
# ---------------------------------------------------------------------------


@main.command(name="list-agents")
def list_agents() -> None:
    """List all available OpenClaw agent types."""
    rows = [
        ("terminal",       "Executes shell commands via Claude tool use"),
        ("theia",          "Interacts with the Eclipse Theia IDE backend"),
        ("autodream",      "Persistent memory agent — remembers across sessions"),
        ("autocrystalize", "Memory + crystallization — extracts structured facts"),
    ]
    for name, description in rows:
        click.echo(f"  {name:<12} {description}")


# ---------------------------------------------------------------------------
# Factory helper
# ---------------------------------------------------------------------------


def _build_agent(
    agent_type: str, model: str, backend: str, session: str = "default"
) -> OpenClawAgent:
    from .agents.terminal import TerminalAgent
    from .agents.theia import TheiaAgent
    from .agents.autodream import AutoDreamAgent
    from .agents.autocrystalize import AutoCrystalizeAgent

    kwargs: dict = {"model": model}
    if agent_type == "terminal":
        return TerminalAgent(**kwargs)
    if agent_type == "theia":
        return TheiaAgent(backend_url=backend, **kwargs)
    if agent_type == "autodream":
        return AutoDreamAgent(session_id=session, **kwargs)
    if agent_type == "autocrystalize":
        return AutoCrystalizeAgent(session_id=session, **kwargs)
    raise click.ClickException(f"Unknown agent type: {agent_type}")
