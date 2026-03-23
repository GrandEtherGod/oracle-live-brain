# Development Setup

## Prerequisites

- **Node.js** v18 or later (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm** v9 or later (comes with Node.js)
- **ANTHROPIC_API_KEY** — required for the voice terminal's AI features

---

## First-Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/AxiusEnterprises/AetherLinkOS---Theia-Engine.git
cd AetherLinkOS---Theia-Engine

# 2. Run the bootstrap script
./scripts/setup.sh

# 3. Add your API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

---

## Running the Voice Terminal

```bash
npm run terminal
```

Open **http://localhost:3000** in a Chromium-based browser (Chrome, Edge, Brave).

- Click the **microphone button** to enable voice input
- Speak a command (e.g. "list the files in the current directory")
- Claude will interpret the command, execute it, and read the output aloud

> **Note**: Web Speech API requires a Chromium browser and a secure context (HTTPS or localhost).

---

## Running the Full Platform

```bash
npm run start
```

Opens the full Theia IDE with all extensions and the voice terminal integrated.

---

## Development Mode (watch)

```bash
npm run dev
```

Watches for TypeScript changes and rebuilds automatically.

---

## Running Tests

```bash
npm test              # Full test suite
npm run test:unit     # Unit tests only
```

---

## Linting

```bash
npm run lint          # Report issues
```

---

## Environment Variables

Create a `.env` file at the project root (gitignored):

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3000
NODE_ENV=development
```

---

## Claude Code on the Web

When working in Claude Code on the web, the SessionStart hook at `.claude/hooks/session-start.sh` automatically runs `npm install` before your session begins. No manual setup is needed.
