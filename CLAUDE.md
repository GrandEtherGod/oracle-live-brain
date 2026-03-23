# AetherLinkOS / Theia Engine — Claude Instructions

## Project Identity

- **Name**: AetherLinkOS — Theia Engine
- **Organization**: AxiusEnterprises
- **Description**: AI-native cloud operating platform built on Eclipse Theia with live voice terminal, Claude AI integration, and a pluggable agent layer
- **Primary branch**: `main` / `master`
- **Feature branches**: `feature/<name>` for features, `fix/<name>` for bugs, `claude/<task>-<id>` for Claude-automated work

---

## Essential Commands

```bash
# Dependencies
npm install              # Install all dependencies (preferred over npm ci for caching)

# Development
npm run build            # Compile TypeScript and bundle
npm run start            # Start the full platform locally
npm run terminal         # Start the voice terminal only (backend on :3000, frontend served)
npm run dev              # Start in watch/dev mode

# Quality
npm test                 # Run the full test suite
npm run test:unit        # Unit tests only
npm run lint             # Run ESLint across src/
npm run typecheck        # TypeScript type-check without emitting

# Utilities
./scripts/setup.sh       # First-time environment bootstrap
./scripts/lint.sh        # Lint check (no autofix)
./scripts/test.sh        # Test runner wrapper
```

---

## Architecture

```
src/
  core/       Shared utilities, base types, event bus, platform bootstrap
  theia/      Eclipse Theia extensions, configuration, plugin registry
  agents/     Claude AI agent integration — tool definitions, agent loop, tool execution
  api/        HTTP/WebSocket API surface (Express routers)
  terminal/   Live voice terminal
    server/   Node.js backend — Claude API proxy, WebSocket handler, command execution
    public/   Browser frontend — xterm.js terminal, Web Speech API, voice UI
```

### Voice Terminal Architecture

The voice terminal at `src/terminal/` is a full-stack feature:

1. **Browser** (`src/terminal/public/`): xterm.js terminal + Web Speech API (SpeechRecognition for STT, SpeechSynthesis for TTS)
2. **Backend** (`src/terminal/server/`): Express + WebSocket server, Claude API proxy via `@anthropic-ai/sdk`, PTY process management
3. **Flow**: Voice input → STT → Claude API (tool use) → execute command → output → TTS

The Claude API key is set via `ANTHROPIC_API_KEY` environment variable (never commit keys).

---

## Development Guidelines

1. **Always work on a branch** — never commit directly to `main` or `master`
2. **The Stop hook enforces clean state** — `~/.claude/stop-hook-git-check.sh` runs before every session ends and will block if you have uncommitted changes or unpushed commits. Do not bypass with `--no-verify`
3. **Keep `docs/architecture.md` updated** when making structural changes to `src/`
4. **Environment variables** — use `.env` at the repo root (it is gitignored); never hardcode keys
5. **TypeScript throughout** — all source files in `src/` must be `.ts`
6. **Tests** — co-locate as `*.test.ts` or in `__tests__/` subdirectories
7. **`npm install` over `npm ci`** — preferred in remote sessions because container state gets cached after the SessionStart hook

---

## File Conventions

| Pattern | Purpose |
|---------|---------|
| `src/**/*.ts` | TypeScript source |
| `src/**/*.test.ts` | Unit/integration tests (co-located) |
| `src/**/__tests__/` | Test subdirectory (alternative) |
| `docs/*.md` | Project documentation |
| `scripts/*.sh` | Shell utility scripts (always `chmod +x`) |
| `.claude/hooks/` | Claude Code lifecycle hooks |
| `.claude/skills/` | Project-specific Claude Code skills |

---

## Claude Code Skills (this project)

| Skill | Location | Purpose |
|-------|----------|---------|
| `session-start-hook` | `~/.claude/skills/session-start-hook/` | Create/update SessionStart hooks |
| `theia-dev` | `.claude/skills/theia-dev/` | Theia extension development workflows |
| `voice-terminal` | `.claude/skills/voice-terminal/` | Voice terminal feature development |
| `update-config` | system | Configure `settings.json` |
| `simplify` | system | Review and fix changed code |
| `loop` | system | Recurring task runner |
| `claude-api` | system | Build with Anthropic SDK |

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for voice terminal AI | Yes (for terminal) |
| `PORT` | Backend server port (default: 3000) | No |
| `NODE_ENV` | `development` or `production` | No (set by SessionStart hook) |

Set these in `.env` at the project root (gitignored).
