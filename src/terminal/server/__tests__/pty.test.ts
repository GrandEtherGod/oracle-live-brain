jest.mock('node-pty');

import * as nodePty from 'node-pty';
import { WebSocket } from 'ws';
import { createPtySession, runCommand, resizePty } from '../pty';

const mockSpawn = nodePty.spawn as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPtyProcess() {
  return {
    onData: jest.fn(),
    onExit: jest.fn(),
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
  };
}

function makeMockWs(readyState: number = WebSocket.OPEN): WebSocket {
  return { readyState, send: jest.fn() } as unknown as WebSocket;
}

// ---------------------------------------------------------------------------
// createPtySession
// ---------------------------------------------------------------------------

describe('createPtySession', () => {
  let mockPty: ReturnType<typeof makeMockPtyProcess>;
  let mockWs: WebSocket;

  beforeEach(() => {
    mockPty = makeMockPtyProcess();
    mockSpawn.mockReturnValue(mockPty);
    mockWs = makeMockWs();
  });

  it('spawns a PTY process with the correct terminal options', () => {
    createPtySession(mockWs);
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ name: 'xterm-color', cols: 80, rows: 24 }),
    );
  });

  it('uses the SHELL env variable as the shell path', () => {
    const original = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';
    createPtySession(mockWs);
    expect(mockSpawn).toHaveBeenCalledWith('/bin/zsh', [], expect.anything());
    process.env.SHELL = original;
  });

  it('falls back to /bin/bash when SHELL is not set', () => {
    const original = process.env.SHELL;
    delete process.env.SHELL;
    createPtySession(mockWs);
    expect(mockSpawn).toHaveBeenCalledWith('/bin/bash', [], expect.anything());
    process.env.SHELL = original;
  });

  it('registers onData and onExit handlers on the PTY process', () => {
    createPtySession(mockWs);
    expect(mockPty.onData).toHaveBeenCalledWith(expect.any(Function));
    expect(mockPty.onExit).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns the spawned PTY process', () => {
    const result = createPtySession(mockWs);
    expect(result).toBe(mockPty);
  });

  describe('onData callback', () => {
    it('sends terminal output to the WebSocket when the connection is open', () => {
      let dataHandler!: (data: string) => void;
      mockPty.onData.mockImplementation((cb: (data: string) => void) => {
        dataHandler = cb;
      });

      createPtySession(mockWs);
      dataHandler('hello terminal');

      expect((mockWs.send as jest.Mock)).toHaveBeenCalledWith(
        JSON.stringify({ type: 'output', data: 'hello terminal' }),
      );
    });

    it('does not send data when the WebSocket is closed', () => {
      let dataHandler!: (data: string) => void;
      mockPty.onData.mockImplementation((cb: (data: string) => void) => {
        dataHandler = cb;
      });

      const closedWs = makeMockWs(WebSocket.CLOSED);
      createPtySession(closedWs);
      dataHandler('some data');

      expect((closedWs.send as jest.Mock)).not.toHaveBeenCalled();
    });

    it('does not send data when the WebSocket is still connecting', () => {
      let dataHandler!: (data: string) => void;
      mockPty.onData.mockImplementation((cb: (data: string) => void) => {
        dataHandler = cb;
      });

      const connectingWs = makeMockWs(WebSocket.CONNECTING);
      createPtySession(connectingWs);
      dataHandler('some data');

      expect((connectingWs.send as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe('onExit callback', () => {
    it('sends a status message when the process exits and WebSocket is open', () => {
      let exitHandler!: () => void;
      mockPty.onExit.mockImplementation((cb: () => void) => {
        exitHandler = cb;
      });

      createPtySession(mockWs);
      exitHandler();

      expect((mockWs.send as jest.Mock)).toHaveBeenCalledWith(
        JSON.stringify({ type: 'status', message: 'Terminal session ended.' }),
      );
    });

    it('does not send a status message when the WebSocket is closed on exit', () => {
      let exitHandler!: () => void;
      mockPty.onExit.mockImplementation((cb: () => void) => {
        exitHandler = cb;
      });

      const closedWs = makeMockWs(WebSocket.CLOSED);
      createPtySession(closedWs);
      exitHandler();

      expect((closedWs.send as jest.Mock)).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------

describe('runCommand', () => {
  it('writes the command followed by a carriage return', () => {
    const mockPty = makeMockPtyProcess();
    runCommand(mockPty as unknown as nodePty.IPty, 'ls -la');
    expect(mockPty.write).toHaveBeenCalledWith('ls -la\r');
  });

  it('writes just a carriage return for an empty command string', () => {
    const mockPty = makeMockPtyProcess();
    runCommand(mockPty as unknown as nodePty.IPty, '');
    expect(mockPty.write).toHaveBeenCalledWith('\r');
  });

  it('preserves special characters in the command', () => {
    const mockPty = makeMockPtyProcess();
    runCommand(mockPty as unknown as nodePty.IPty, 'echo "hello world" | grep hello');
    expect(mockPty.write).toHaveBeenCalledWith('echo "hello world" | grep hello\r');
  });
});

// ---------------------------------------------------------------------------
// resizePty
// ---------------------------------------------------------------------------

describe('resizePty', () => {
  it('calls resize on the PTY process with the provided dimensions', () => {
    const mockPty = makeMockPtyProcess();
    resizePty(mockPty as unknown as nodePty.IPty, 120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('passes through small terminal dimensions', () => {
    const mockPty = makeMockPtyProcess();
    resizePty(mockPty as unknown as nodePty.IPty, 40, 10);
    expect(mockPty.resize).toHaveBeenCalledWith(40, 10);
  });
});
