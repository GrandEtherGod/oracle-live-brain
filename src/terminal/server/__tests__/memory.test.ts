// os.homedir is non-configurable in Node.js, so mock the whole module.
// The mock must be declared before any imports that transitively use it.
jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn().mockReturnValue('/tmp/aetherlink-test-memory'),
}));

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  appendDream,
  readDreams,
  nextCrystalVersion,
  writeCrystal,
  DreamEntry,
  CrystalEntry,
} from '../memory';

const TEST_HOME = '/tmp/aetherlink-test-memory';

afterAll(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
});
beforeEach(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
});

function makeDream(id = 'test-id'): DreamEntry {
  return {
    id,
    timestamp: '2026-01-01T00:00:00.000Z',
    summary: 'Test summary.',
    key_insights: ['insight 1'],
    topics: ['testing'],
    commands_run: ['echo hi'],
    session_duration_s: 2.5,
  };
}

function makeCrystal(version = 1): CrystalEntry {
  return {
    version,
    timestamp: '2026-01-01T00:00:00.000Z',
    title: 'Test Crystal',
    content: 'Crystal content.',
    key_facts: ['fact 1'],
    source_dream_ids: ['test-id'],
  };
}

// ---------------------------------------------------------------------------
// appendDream / readDreams
// ---------------------------------------------------------------------------

describe('appendDream', () => {
  it('creates the file and parent directory', async () => {
    await appendDream(makeDream());
    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('writes valid JSON to the file', async () => {
    await appendDream(makeDream('id-001'));
    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw.trim());
    expect(parsed.id).toBe('id-001');
    expect(parsed.summary).toBe('Test summary.');
  });

  it('appends multiple entries', async () => {
    await appendDream(makeDream('id-001'));
    await appendDream(makeDream('id-002'));
    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    const lines = (await fs.readFile(filePath, 'utf-8')).split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).id).toBe('id-002');
  });
});

describe('readDreams', () => {
  it('returns empty array when file does not exist', async () => {
    expect(await readDreams()).toEqual([]);
  });

  it('round-trips a DreamEntry', async () => {
    const entry = makeDream('round-trip');
    await appendDream(entry);
    const result = await readDreams();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('round-trip');
    expect(result[0].commands_run).toEqual(['echo hi']);
  });

  it('skips malformed lines', async () => {
    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const good = JSON.stringify(makeDream('good-id'));
    await fs.writeFile(filePath, `{broken json}\n${good}\n`);
    const result = await readDreams();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good-id');
  });

  it('skips empty lines', async () => {
    await appendDream(makeDream('skip-empty'));
    const filePath = path.join(TEST_HOME, '.aetherlink', 'dreams', 'dreams.jsonl');
    await fs.appendFile(filePath, '\n\n');
    const result = await readDreams();
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// nextCrystalVersion / writeCrystal
// ---------------------------------------------------------------------------

describe('nextCrystalVersion', () => {
  it('returns 1 when no crystals exist', async () => {
    expect(await nextCrystalVersion()).toBe(1);
  });

  it('returns max + 1 when crystals exist', async () => {
    const dir = path.join(TEST_HOME, '.aetherlink', 'crystals');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'crystal_1.json'), '{}');
    await fs.writeFile(path.join(dir, 'crystal_3.json'), '{}');
    expect(await nextCrystalVersion()).toBe(4);
  });

  it('ignores non-crystal files', async () => {
    const dir = path.join(TEST_HOME, '.aetherlink', 'crystals');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'other.json'), '{}');
    expect(await nextCrystalVersion()).toBe(1);
  });
});

describe('writeCrystal', () => {
  it('creates the crystal file', async () => {
    const filePath = await writeCrystal(makeCrystal(1));
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('writes valid JSON', async () => {
    const filePath = await writeCrystal(makeCrystal(1));
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(data.title).toBe('Test Crystal');
    expect(data.version).toBe(1);
  });

  it('writes separate files for different versions', async () => {
    await writeCrystal(makeCrystal(1));
    await writeCrystal(makeCrystal(2));
    const dir = path.join(TEST_HOME, '.aetherlink', 'crystals');
    const files = (await fs.readdir(dir)).sort();
    expect(files).toEqual(['crystal_1.json', 'crystal_2.json']);
  });
});
