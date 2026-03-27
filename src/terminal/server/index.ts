import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { processVoiceInput } from './claude';
import { createPtySession, runCommand, resizePty } from './pty';
import { ClientMessage, ServerMessage } from './types';
import { runAutoDream } from './autodream';
import { runAutoCrystalize } from './autocrystalize';
import { readDreams } from './memory';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('[terminal] client connected');

  const sessionStartTime = Date.now();

  // Per-connection conversation history for Claude
  const conversationHistory: Anthropic.MessageParam[] = [];
  let voiceInFlight = false;

  // Create a PTY session for this connection
  const ptyProcess = createPtySession(ws);

  ws.on('message', async (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ping': {
        const pong: ServerMessage = { type: 'pong' };
        ws.send(JSON.stringify(pong));
        break;
      }

      case 'command': {
        // Direct command from keyboard input (no AI processing)
        if (msg.text) runCommand(ptyProcess, msg.text);
        break;
      }

      case 'voice_input': {
        if (!msg.text) break;
        if (voiceInFlight) break;

        voiceInFlight = true;

        // Show the transcribed text in the terminal
        const echo: ServerMessage = { type: 'ai_response', text: `[Voice] ${msg.text}` };
        ws.send(JSON.stringify(echo));

        // Voice command: explicit crystalize trigger
        if (/\bcrystall?i[sz]e\b/i.test(msg.text)) {
          try {
            const crystal = await runAutoCrystalize(1);
            const crystalMsg: ServerMessage = {
              type: 'ai_response',
              text: crystal
                ? `[AutoCrystalize] Crystal v${crystal.version} written: ${crystal.title}`
                : '[AutoCrystalize] No dreams to crystallize yet.',
            };
            ws.send(JSON.stringify(crystalMsg));
          } catch (err) {
            const errMsg: ServerMessage = {
              type: 'error',
              message: `AutoCrystalize error: ${err instanceof Error ? err.message : 'unknown error'}`,
            };
            ws.send(JSON.stringify(errMsg));
          }
          break;
        }

        try {
          const action = await processVoiceInput(msg.text, conversationHistory);

          // Window history to last 20 messages to prevent unbounded growth
          if (conversationHistory.length > 20) {
            conversationHistory.splice(0, conversationHistory.length - 20);
          }

          if (action.type === 'command') {
            // Show Claude's chosen command, then execute it
            const cmdMsg: ServerMessage = { type: 'ai_response', text: `[AetherLink] Running: ${action.value}` };
            ws.send(JSON.stringify(cmdMsg));
            runCommand(ptyProcess, action.value);
          } else {
            // Spoken response — send back for TTS
            const speakMsg: ServerMessage = { type: 'ai_response', text: action.value };
            ws.send(JSON.stringify(speakMsg));
          }
        } catch (err) {
          const errMsg: ServerMessage = {
            type: 'error',
            message: `AI error: ${err instanceof Error ? err.message : 'unknown error'}`,
          };
          ws.send(JSON.stringify(errMsg));
        } finally {
          voiceInFlight = false;
        }
        break;
      }

      case 'resize': {
        if (msg.cols && msg.rows) resizePty(ptyProcess, msg.cols, msg.rows);
        break;
      }
    }
  });

  ws.on('close', async () => {
    console.log('[terminal] client disconnected');
    ptyProcess.kill();
    if (conversationHistory.length > 0) {
      try {
        const dream = await runAutoDream(conversationHistory, sessionStartTime);
        console.log(`[autodream] Session reflected: ${dream.id}`);
        const dreams = await readDreams();
        if (dreams.length >= 3) {
          const crystal = await runAutoCrystalize();
          if (crystal) {
            console.log(`[autocrystalize] Crystal v${crystal.version} written: ${crystal.title}`);
          }
        }
      } catch (err) {
        console.warn('[autodream] Post-session reflection failed:', err);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[terminal] WebSocket error:', err.message);
  });
});

server.listen(port, () => {
  console.log(`[terminal] Server running at http://localhost:${port}`);
  console.log(`[terminal] WebSocket ready at ws://localhost:${port}`);
});

export { server };
