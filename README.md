# AetherLinkOS — Theia Engine

An AI-native operating platform by **AxiusEnterprises**, built on [Eclipse Theia](https://theia-ide.org/). The Theia Engine powers a cloud-capable, voice-enabled development environment where AI agents and humans collaborate in real time.

---

## Features

- **AI-native IDE** — Eclipse Theia core with deep Claude AI integration
- **Voice Terminal** — Full-stack live voice terminal (speech-to-text input, text-to-speech output, Claude AI command processing)
- **Agent Layer** — Pluggable AI agents for code generation, review, and automation
- **Oracle Live Brain** — A live map of agent turns (faculty, size, and time only). See [oracle-live-brain/README.md](oracle-live-brain/README.md)
- **Cloud-Ready** — Designed for Claude Code on the web; SessionStart hook installs all dependencies automatically

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the voice terminal
npm run terminal

# Build the full platform
npm run build

# Run tests
npm test
```

---

## Project Structure

```
src/
  core/        Platform kernel and shared utilities
  theia/       Eclipse Theia extensions and configurations
  agents/      AI agent integration layer
  api/         Public API surface
  terminal/    Live voice terminal (browser frontend + Node.js backend)
docs/          Architecture, setup, and contribution guides
scripts/       Developer utility scripts
.claude/       Claude Code configuration (hooks, skills, settings)
```

---

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Development Setup](docs/setup.md)
- [Contributing](docs/contributing.md)

---

## Organization

**AxiusEnterprises** — [github.com/AxiusEnterprises](https://github.com/AxiusEnterprises)
