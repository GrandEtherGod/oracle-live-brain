---
name: voice-terminal
description: >
  Voice terminal feature development for AetherLinkOS. Use when working on the
  live voice terminal — adding voice commands, modifying the STT/TTS pipeline,
  changing the Claude API integration, or updating the terminal UI.
  Examples: "add a new voice command", "fix TTS output", "update the terminal UI".
---

# Voice Terminal Skill

Workflows for developing the AetherLinkOS live voice terminal at `src/terminal/`.

---

## Architecture

```
src/terminal/
  server/
    index.ts          Express + WebSocket server entry point
    claude.ts         Claude API proxy (tool use, message handling)
    pty.ts            PTY process management (node-pty)
    types.ts          Shared TypeScript types
  public/
    index.html        Single-page terminal UI
    app.js            xterm.js terminal + Web Speech API + WebSocket client
    style.css         Terminal UI styles
```

### Data Flow

```
User speaks
  → Web Speech API (SpeechRecognition)
  → WebSocket message to backend {type: "voice_input", text: "..."}
  → Claude API (tool use enabled)
      → Claude decides to run a command
      → {type: "tool_use", name: "run_command", input: {command: "ls -la"}}
  → PTY executes the command
  → Output streamed back via WebSocket {type: "output", data: "..."}
  → xterm.js renders output
  → Web Speech API (SpeechSynthesis) speaks the response summary
```

---

## Running the Voice Terminal

```bash
npm run terminal     # Starts backend on :3000, serves frontend
```

Open http://localhost:3000 in a browser. Click the microphone button to begin.

**Required**: `ANTHROPIC_API_KEY` must be set in `.env`.

---

## Adding a Voice Command

1. Add a tool definition in `src/terminal/server/claude.ts`:

```typescript
{
  name: "my_new_tool",
  description: "What this tool does when Claude decides to use it",
  input_schema: {
    type: "object",
    properties: {
      param: { type: "string", description: "..." }
    },
    required: ["param"]
  }
}
```

2. Add the execution handler in `src/terminal/server/pty.ts` (or a new handler file).

3. Wire the tool name to the handler in the tool dispatch switch in `server/index.ts`.

---

## Web Speech API Notes

- **SpeechRecognition**: Only works in Chromium-based browsers. Check `window.webkitSpeechRecognition`.
- **SpeechSynthesis**: Available in all modern browsers.
- Both require a secure context (HTTPS or localhost).
- Set `recognition.continuous = true` for always-on listening.
- Set `recognition.interimResults = true` for live transcription display.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key — required for AI command processing |
| `PORT` | Backend port (default: `3000`) |
| `NODE_ENV` | `development` or `production` |

---

## Testing the Voice Pipeline

```bash
# Test the backend server directly
curl http://localhost:3000/health

# Test a command via WebSocket (use wscat)
wscat -c ws://localhost:3000
> {"type":"command","text":"echo hello world"}
```
