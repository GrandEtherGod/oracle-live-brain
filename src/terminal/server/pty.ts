import * as pty from 'node-pty';
import { WebSocket } from 'ws';
import { ServerMessage } from './types';

export interface PtySession {
  process: pty.IPty;
  ws: WebSocket;
}

export function createPtySession(ws: WebSocket): pty.IPty {
  const shell = process.env.SHELL || '/bin/bash';

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.cwd(),
    env: { ...process.env },
  });

  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      const msg: ServerMessage = { type: 'output', data };
      ws.send(JSON.stringify(msg));
    }
  });

  ptyProcess.onExit(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const msg: ServerMessage = { type: 'status', message: 'Terminal session ended.' };
      ws.send(JSON.stringify(msg));
    }
  });

  return ptyProcess;
}

export function runCommand(ptyProcess: pty.IPty, command: string): void {
  try {
    ptyProcess.write(`${command}\r`);
  } catch (err) {
    console.warn('[pty] write error:', err instanceof Error ? err.message : err);
  }
}

export function resizePty(ptyProcess: pty.IPty, cols: number, rows: number): void {
  const safeCols = Math.max(10, Math.min(500, cols));
  const safeRows = Math.max(5, Math.min(100, rows));
  ptyProcess.resize(safeCols, safeRows);
}
