// claude.ts creates its Anthropic client at module load time, so the mock
// factory must be in place before the module is required.  Jest hoists
// jest.mock() calls above imports, and also hoists variable declarations
// whose names begin with "mock", making this pattern safe.
const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  // Required so TypeScript's esModuleInterop wrapper uses .default correctly.
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

import type Anthropic from '@anthropic-ai/sdk';
import { processVoiceInput } from '../claude';

// ---------------------------------------------------------------------------
// Helpers to build fake Anthropic API responses
// ---------------------------------------------------------------------------

function makeToolUseResponse(
  name: string,
  input: Record<string, string>,
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'tu_1', name, input }],
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function makeTextResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function makeEmptyResponse(): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 0 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processVoiceInput', () => {
  describe('action routing', () => {
    it('returns a command action when Claude calls run_command', async () => {
      mockMessagesCreate.mockResolvedValue(
        makeToolUseResponse('run_command', { command: 'ls -la' }),
      );
      const result = await processVoiceInput('list files', []);
      expect(result).toEqual({ type: 'command', value: 'ls -la' });
    });

    it('returns a speak action when Claude calls speak', async () => {
      mockMessagesCreate.mockResolvedValue(
        makeToolUseResponse('speak', { text: 'Hello there!' }),
      );
      const result = await processVoiceInput('say hello', []);
      expect(result).toEqual({ type: 'speak', value: 'Hello there!' });
    });

    it('falls back to text block when no tool_use block is present', async () => {
      mockMessagesCreate.mockResolvedValue(makeTextResponse('Fallback response'));
      const result = await processVoiceInput('hello', []);
      expect(result).toEqual({ type: 'speak', value: 'Fallback response' });
    });

    it('returns default message when response content is empty', async () => {
      mockMessagesCreate.mockResolvedValue(makeEmptyResponse());
      const result = await processVoiceInput('...', []);
      expect(result).toEqual({
        type: 'speak',
        value: 'I did not understand that request.',
      });
    });

    it('skips a run_command block missing the command property and tries the next block', async () => {
      const response: Anthropic.Message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'run_command', input: {} },
          { type: 'tool_use', id: 'tu_2', name: 'speak', input: { text: 'fallback speak' } },
        ],
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      };
      mockMessagesCreate.mockResolvedValue(response);
      const result = await processVoiceInput('test', []);
      expect(result).toEqual({ type: 'speak', value: 'fallback speak' });
    });

    it('skips a speak block missing the text property and falls through', async () => {
      const response: Anthropic.Message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'speak', input: {} },
        ],
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      };
      mockMessagesCreate.mockResolvedValue(response);
      const result = await processVoiceInput('test', []);
      expect(result).toEqual({
        type: 'speak',
        value: 'I did not understand that request.',
      });
    });
  });

  describe('conversation history management', () => {
    it('appends the user message to history before the API call', async () => {
      mockMessagesCreate.mockResolvedValue(makeToolUseResponse('speak', { text: 'ok' }));
      const history: Anthropic.MessageParam[] = [];
      await processVoiceInput('test input', history);
      expect(history[0]).toEqual({ role: 'user', content: 'test input' });
    });

    it('appends the assistant response to history after the API call', async () => {
      const response = makeToolUseResponse('speak', { text: 'ok' });
      mockMessagesCreate.mockResolvedValue(response);
      const history: Anthropic.MessageParam[] = [];
      await processVoiceInput('test input', history);
      expect(history[1]).toEqual({ role: 'assistant', content: response.content });
    });

    it('accumulates multiple turns correctly', async () => {
      mockMessagesCreate.mockResolvedValue(makeToolUseResponse('speak', { text: 'ok' }));
      const history: Anthropic.MessageParam[] = [];
      await processVoiceInput('first', history);
      await processVoiceInput('second', history);
      // user, assistant, user, assistant
      expect(history).toHaveLength(4);
      expect(history[2]).toEqual({ role: 'user', content: 'second' });
    });

    it('passes existing history as part of the messages array to the API', async () => {
      mockMessagesCreate.mockResolvedValue(makeToolUseResponse('speak', { text: 'ok' }));
      const history: Anthropic.MessageParam[] = [
        { role: 'user', content: 'prior message' },
      ];
      await processVoiceInput('new message', history);
      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'prior message' });
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'new message' });
    });
  });

  describe('API call parameters', () => {
    it('sends the correct model and max_tokens', async () => {
      mockMessagesCreate.mockResolvedValue(makeToolUseResponse('speak', { text: 'ok' }));
      await processVoiceInput('test', []);
      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-6');
      expect(callArgs.max_tokens).toBe(1024);
    });

    it('includes both run_command and speak tools in the request', async () => {
      mockMessagesCreate.mockResolvedValue(makeToolUseResponse('speak', { text: 'ok' }));
      await processVoiceInput('test', []);
      const callArgs = mockMessagesCreate.mock.calls[0][0];
      const toolNames = callArgs.tools.map((t: Anthropic.Tool) => t.name);
      expect(toolNames).toContain('run_command');
      expect(toolNames).toContain('speak');
    });
  });

  describe('error handling', () => {
    it('propagates API errors to the caller', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('API rate limit exceeded'));
      await expect(processVoiceInput('test', [])).rejects.toThrow(
        'API rate limit exceeded',
      );
    });
  });
});
