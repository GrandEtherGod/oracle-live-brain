// Prevent dotenv from touching the filesystem in tests.
jest.mock('dotenv/config', () => {});

// ---------------------------------------------------------------------------
// Mock PTY layer — must be defined with "mock" prefix so Jest hoists the
// variable alongside the jest.mock() call (before any imports are resolved).
// ---------------------------------------------------------------------------
const mockPtyKill = jest.fn();
const mockPtyProcess = {
  kill: mockPtyKill,
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
};

jest.mock('../pty', () => ({
  createPtySession: jest.fn().mockReturnValue(mockPtyProcess),
  runCommand: jest.fn(),
  resizePty: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Claude layer
// ---------------------------------------------------------------------------
const mockProcessVoiceInput = jest.fn();

jest.mock('../claude', () => ({
  processVoiceInput: mockProcessVoiceInput,
}));

// ---------------------------------------------------------------------------
// Imports (resolved after all mocks are registered)
// ---------------------------------------------------------------------------
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import { server } from '../index';
import { createPtySession, runCommand, resizePty } from '../pty';

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockResizePty = resizePty as jest.MockedFunction<typeof resizePty>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve once the server is actively listening and return the bound port. */
function getPort(): Promise<number> {
  return new Promise<number>((resolve) => {
    if (server.listening) {
      resolve((server.address() as AddressInfo).port);
    } else {
      server.once('listening', () => {
        resolve((server.address() as AddressInfo).port);
      });
    }
  });
}

/** Open a WebSocket connection to the test server. */
function connectWs(port: number): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

/**
 * Queue-based message collector.
 *
 * Attaches a persistent 'message' listener so that messages arriving before
 * the test code awaits them are buffered rather than lost.  This eliminates
 * the race condition where two messages from the server arrive in the same TCP
 * segment: both 'message' events fire during the same I/O callback, but a
 * `.once` listener for the second message hasn't been registered yet.
 */
class MessageCollector {
  private readonly buf: Record<string, unknown>[] = [];
  private readonly waiters: Array<(m: Record<string, unknown>) => void> = [];

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      if (this.waiters.length > 0) {
        this.waiters.shift()!(msg);
      } else {
        this.buf.push(msg);
      }
    });
  }

  next(): Promise<Record<string, unknown>> {
    if (this.buf.length > 0) return Promise.resolve(this.buf.shift()!);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

let collector: MessageCollector;

/** Collect the next N messages, sending payload before waiting. */
async function sendAndCollect(
  ws: WebSocket,
  payload: object,
  count: number,
): Promise<Record<string, unknown>[]> {
  ws.send(JSON.stringify(payload));
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    results.push(await collector.next());
  }
  return results;
}

/** Await the next single message from the collector. */
function waitForMessage(): Promise<Record<string, unknown>> {
  return collector.next();
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let port: number;

beforeAll(async () => {
  port = await getPort();
});

afterAll((done) => {
  server.close(done);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket server message routing', () => {
  let ws: WebSocket;

  beforeEach(async () => {
    // Re-apply the PTY mock return value in case clearMocks affected it.
    (createPtySession as jest.Mock).mockReturnValue(mockPtyProcess);
    ws = await connectWs(port);
    collector = new MessageCollector(ws);
  });

  afterEach(async () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        ws.once('close', resolve);
        ws.close();
      });
    }
  });

  // -------------------------------------------------------------------------
  // ping / pong
  // -------------------------------------------------------------------------

  it('responds to ping with pong', async () => {
    const [msg] = await sendAndCollect(ws, { type: 'ping' }, 1);
    expect(msg).toEqual({ type: 'pong' });
  });

  // -------------------------------------------------------------------------
  // Resilience
  // -------------------------------------------------------------------------

  it('ignores malformed JSON and keeps the connection alive', async () => {
    ws.send('not-json-at-all {{');
    // Allow server to process the bad frame
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    // Server should still respond to subsequent valid messages
    const [msg] = await sendAndCollect(ws, { type: 'ping' }, 1);
    expect(msg).toEqual({ type: 'pong' });
  });

  // -------------------------------------------------------------------------
  // command
  // -------------------------------------------------------------------------

  it('routes command messages to runCommand with the provided text', async () => {
    ws.send(JSON.stringify({ type: 'command', text: 'ls -la' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(mockRunCommand).toHaveBeenCalledWith(mockPtyProcess, 'ls -la');
  });

  it('does not call runCommand when command message has no text', async () => {
    ws.send(JSON.stringify({ type: 'command' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // voice_input — command action
  // -------------------------------------------------------------------------

  it('echoes the transcription then sends the AetherLink command banner, and runs the command', async () => {
    mockProcessVoiceInput.mockResolvedValue({ type: 'command', value: 'git status' });

    const [echo, cmdBanner] = await sendAndCollect(
      ws,
      { type: 'voice_input', text: 'show git status' },
      2,
    );

    expect(echo).toEqual({ type: 'ai_response', text: '[Voice] show git status' });
    expect(cmdBanner).toEqual({ type: 'ai_response', text: '[AetherLink] Running: git status' });
    expect(mockRunCommand).toHaveBeenCalledWith(mockPtyProcess, 'git status');
  });

  // -------------------------------------------------------------------------
  // voice_input — speak action
  // -------------------------------------------------------------------------

  it('echoes the transcription then forwards the spoken reply', async () => {
    mockProcessVoiceInput.mockResolvedValue({
      type: 'speak',
      value: 'The current directory has 5 files.',
    });

    const [echo, speakMsg] = await sendAndCollect(
      ws,
      { type: 'voice_input', text: 'how many files are here' },
      2,
    );

    expect(echo).toEqual({ type: 'ai_response', text: '[Voice] how many files are here' });
    expect(speakMsg).toEqual({
      type: 'ai_response',
      text: 'The current directory has 5 files.',
    });
  });

  // -------------------------------------------------------------------------
  // voice_input — error path
  // -------------------------------------------------------------------------

  it('sends an error message when voice processing throws', async () => {
    mockProcessVoiceInput.mockRejectedValue(new Error('API timeout'));

    ws.send(JSON.stringify({ type: 'voice_input', text: 'do something' }));
    // First message is the echo, second is the error
    const echo = await waitForMessage();
    expect(echo).toEqual({ type: 'ai_response', text: '[Voice] do something' });

    const errorMsg = await waitForMessage();
    expect(errorMsg).toEqual({ type: 'error', message: 'AI error: API timeout' });
  });

  it('sends a generic error message for non-Error throws', async () => {
    mockProcessVoiceInput.mockRejectedValue('plain string error');

    ws.send(JSON.stringify({ type: 'voice_input', text: 'test' }));
    await waitForMessage(); // consume echo
    const errorMsg = await waitForMessage();
    expect(errorMsg).toEqual({ type: 'error', message: 'AI error: unknown error' });
  });

  // -------------------------------------------------------------------------
  // voice_input — missing text
  // -------------------------------------------------------------------------

  it('ignores voice_input messages with no text field', async () => {
    ws.send(JSON.stringify({ type: 'voice_input' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(mockProcessVoiceInput).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // resize
  // -------------------------------------------------------------------------

  it('routes resize messages to resizePty with cols and rows', async () => {
    ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(mockResizePty).toHaveBeenCalledWith(mockPtyProcess, 120, 40);
  });

  it('ignores resize messages with missing dimensions', async () => {
    ws.send(JSON.stringify({ type: 'resize' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(mockResizePty).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  it('kills the PTY process when the client disconnects', async () => {
    // Close the WS and wait for the server-side close handler to fire.
    await new Promise<void>((resolve) => {
      ws.once('close', resolve);
      ws.close();
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(mockPtyKill).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// HTTP health endpoint (sanity check that Express is running)
// ---------------------------------------------------------------------------

describe('HTTP health endpoint', () => {
  it('returns { status: "ok" } with a timestamp', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
