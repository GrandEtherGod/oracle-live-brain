# Architecture Overview — AetherLinkOS / Theia Engine

## High-Level Overview

AetherLinkOS is an AI-native operating platform. The **Theia Engine** is the IDE core — an Eclipse Theia application extended with Claude AI integration, a live voice terminal, and a pluggable agent layer.

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌─────────────────┐   ┌───────────────────────┐│
│  │  Theia IDE UI   │   │   Voice Terminal UI    ││
│  │  (extensions)   │   │  xterm.js + Web Speech ││
│  └────────┬────────┘   └──────────┬────────────┘│
└───────────┼────────────────────────┼─────────────┘
            │ HTTP/WS                │ WebSocket
┌───────────┼────────────────────────┼─────────────┐
│           │     Node.js Backend    │             │
│  ┌────────▼────────┐   ┌──────────▼────────────┐│
│  │  Theia Backend  │   │   Terminal Server      ││
│  │  (plugins, API) │   │   Express + WS + PTY   ││
│  └────────┬────────┘   └──────────┬────────────┘│
│           │                        │             │
│  ┌────────▼────────┐   ┌──────────▼────────────┐│
│  │   Agent Layer   │   │    Claude API Proxy    ││
│  │  (src/agents/)  │   │   @anthropic-ai/sdk    ││
│  └─────────────────┘   └───────────────────────┘│
└─────────────────────────────────────────────────┘
```

---

## Module Descriptions

### `src/core/`
Shared utilities, base types, event bus, and platform bootstrap logic. All other modules depend on core.

### `src/theia/`
Eclipse Theia extensions, configuration, and plugin registry. Each extension lives in its own subdirectory and follows the Theia extension pattern (see `.claude/skills/theia-dev/SKILL.md`).

### `src/agents/`
Claude AI agent integration — tool definitions, the agent loop, and tool execution handlers. Agents receive user intent (from the voice terminal or IDE commands) and act on the system via tools.

### `src/api/`
Public HTTP and WebSocket API surface (Express routers). Provides programmatic access to platform capabilities for external integrations.

### `src/terminal/`
The live voice terminal — a full-stack feature:

- **`server/`** — Node.js Express + WebSocket server. Manages PTY processes and proxies Claude API calls.
- **`public/`** — Single-page browser app. Renders the xterm.js terminal and handles voice I/O via the Web Speech API.

---

## Voice Terminal Data Flow

```
1. User speaks
2. SpeechRecognition (Web Speech API) → transcribed text
3. WebSocket message → { type: "voice_input", text: "..." }
4. Claude API (tool use) → decides which command to run
5. PTY executes the shell command
6. Output streamed via WebSocket → { type: "output", data: "..." }
7. xterm.js renders the output
8. SpeechSynthesis speaks a summary of the response
```

---

---

## OpenClaw Agents (`packages/openclaw/`)

OpenClaw is the Python pip-installable agent layer for AetherLinkOS. It exposes the same Claude tool-use architecture as the TypeScript voice terminal, but as a standalone Python package usable by external tooling, scripts, and CI pipelines.

```
packages/openclaw/
├── pyproject.toml          # pip package config  (pip install openclaw-agents)
├── openclaw/
│   ├── agent.py            # OpenClawAgent — base class (Claude tool-use loop)
│   ├── tools.py            # Tool, ToolRegistry, @tool decorator
│   ├── cli.py              # `openclaw` CLI  (run / chat / list-agents)
│   └── agents/
│       ├── terminal.py     # TerminalAgent  — run_command + speak tools
│       └── theia.py        # TheiaAgent     — theia_open_file / run_task / workspace_info
└── tests/                  # pytest unit tests (no API key required)
```

**Install**: `pip install openclaw-agents`
**CLI**: `openclaw run "list my files"` / `openclaw chat --agent theia`

### Agent architecture

```
User prompt
    │
    ▼
OpenClawAgent.run()
    │  appends to conversation history
    ▼
anthropic.Anthropic.messages.create()   ← Claude API (tool_use loop)
    │
    ▼
ToolRegistry.execute(tool_name, inputs) ← Python handler
    │
    ▼
result dict  {tool: str, result: Any}
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Claude API on backend only | API key security; browser-side keys would be exposed |
| xterm.js for terminal | Industry standard; integrates cleanly with Theia |
| Web Speech API (no third-party STT) | Zero cost, no extra dependencies; works in Chromium |
| Eclipse Theia (not VS Code directly) | Embeddable, open-source, supports both browser and desktop |
| TypeScript throughout | Type safety across the entire stack |
| Python for OpenClaw pip package | Enables use in Python scripts, CI, and data tooling outside the Node.js runtime |

---

## Adding a New Module

1. Create the directory under `src/`
2. Add a brief description to this file
3. Register any new npm packages in `package.json`
4. Export public API from `src/<module>/index.ts`
