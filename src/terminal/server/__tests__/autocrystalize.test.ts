jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn().mockReturnValue('/tmp/aetherlink-test-autocrystalize'),
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
import { runAutoCrystalize } from '../autocrystalize';
import { appendDream, DreamEntry } from '../memory';

const TEST_HOME = '/tmp/aetherlink-test-autocrystalize';

afterAll(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
});
beforeEach(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
  jest.clearAllMocks();
});

function makeDream(id = 'dream-1'): DreamEntry {
  return {
    id,
    timestamp: '2026-01-01T00:00:00.000Z',
    summary: 'Summary.',
    key_insights: ['insight'],
    topics: ['topic'],
    commands_run: [],
    session_duration_s: 1.0,
  };
}

function mockCrystalResponse(payload: object): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  });
}

describe('runAutoCrystalize', () => {
  it('returns null when no dreams exist', async () => {
    const result = await runAutoCrystalize(1);
    expect(result).toBeNull();
  });

  it('returns null when fewer than minDreams exist', async () => {
    await appendDream(makeDream('d1'));
    const result = await runAutoCrystalize(3);
    expect(result).toBeNull();
  });

  it('calls Claude and returns a CrystalEntry', async () => {
    await appendDream(makeDream('d1'));
    await appendDream(makeDream('d2'));

    mockCrystalResponse({
      title: 'My First Crystal',
      content: 'A synthesis.',
      key_facts: ['fact 1', 'fact 2'],
    });

    const crystal = await runAutoCrystalize(1);
    expect(crystal).not.toBeNull();
    expect(crystal!.title).toBe('My First Crystal');
    expect(crystal!.version).toBe(1);
    expect(crystal!.source_dream_ids).toEqual(['d1', 'd2']);
  });

  it('writes the crystal to disk', async () => {
    await appendDream(makeDream('d1'));
    mockCrystalResponse({ title: 'T', content: 'C', key_facts: [] });

    await runAutoCrystalize(1);

    const dir = path.join(TEST_HOME, '.aetherlink', 'crystals');
    const files = await fs.readdir(dir);
    expect(files).toContain('crystal_1.json');
    const data = JSON.parse(
      await fs.readFile(path.join(dir, 'crystal_1.json'), 'utf-8')
    );
    expect(data.title).toBe('T');
  });

  it('increments version on subsequent calls', async () => {
    await appendDream(makeDream('d1'));

    mockCrystalResponse({ title: 'C1', content: 'Content 1', key_facts: [] });
    const c1 = await runAutoCrystalize(1);

    mockCrystalResponse({ title: 'C2', content: 'Content 2', key_facts: [] });
    const c2 = await runAutoCrystalize(1);

    expect(c1!.version).toBe(1);
    expect(c2!.version).toBe(2);
  });

  it('handles markdown-fenced JSON response', async () => {
    await appendDream(makeDream('d1'));
    const payload = { title: 'Fenced Crystal', content: 'C', key_facts: [] };
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(payload) + '\n```' }],
    });

    const crystal = await runAutoCrystalize(1);
    expect(crystal!.title).toBe('Fenced Crystal');
  });

  it('throws on Claude API error', async () => {
    await appendDream(makeDream('d1'));
    mockCreate.mockRejectedValueOnce(new Error('API error'));
    await expect(runAutoCrystalize(1)).rejects.toThrow();
  });
});
