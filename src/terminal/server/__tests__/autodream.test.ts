jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn().mockReturnValue('/tmp/aetherlink-test-autodream'),
}));

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { runAutoDream } from '../autodream';

const TEST_HOME = '/tmp/aetherlink-test-autodream';

afterAll(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
});
beforeEach(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
  jest.clearAllMocks();
});

function makeHistory(texts: string[]): Anthropic.MessageParam[] {
  return texts.map((t, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: t,
  }));
}

function mockDreamResponse(payload: object): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  });
}

describe('runAutoDream', () => {
  it('calls Claude and returns a DreamEntry', async () => {
    mockDreamResponse({
      summary: 'User ran some commands.',
      key_insights: ['commands were helpful'],
      topics: ['shell'],
      commands_run: ['ls'],
    });

    const entry = await runAutoDream(makeHistory(['run ls']), Date.now() - 3000);

    expect(entry.summary).toBe('User ran some commands.');
    expect(entry.topics).toEqual(['shell']);
    expect(entry.commands_run).toEqual(['ls']);
    expect(entry.session_duration_s).toBeGreaterThan(0);
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('writes a JSONL entry to disk', async () => {
    mockDreamResponse({ summary: 'S', key_insights: [], topics: [], commands_run: [] });

    await runAutoDream(makeHistory(['hello']), Date.now());

    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const lines = (await fs.readFile(filePath, 'utf-8')).split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(1);
  });

  it('sets correct timestamp format', async () => {
    mockDreamResponse({ summary: 'S', key_insights: [], topics: [], commands_run: [] });
    const entry = await runAutoDream(makeHistory(['test']), Date.now());
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('handles markdown-fenced JSON response', async () => {
    const payload = { summary: 'Fenced.', key_insights: [], topics: [], commands_run: [] };
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(payload) + '\n```' }],
    });

    const entry = await runAutoDream(makeHistory(['test']), Date.now());
    expect(entry.summary).toBe('Fenced.');
  });

  it('throws on Claude API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API unavailable'));
    await expect(runAutoDream(makeHistory(['test']), Date.now())).rejects.toThrow();
  });
});
