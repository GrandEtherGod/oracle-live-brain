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
  ptyProcess.write(`${command}\r`);
}

export function resizePty(ptyProcess: pty.IPty, cols: number, rows: number): void {
  ptyProcess.resize(cols, rows);
}
