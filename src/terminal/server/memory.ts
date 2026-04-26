/**
 * Persistent memory layer for the AetherLink voice terminal.
 *
 * Storage layout:
 *   ~/.aetherlink/dreams/dreams.jsonl          — append-only dream log
 *   ~/.aetherlink/crystals/crystal_<n>.json    — versioned crystal artifacts
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DreamEntry {
  id: string;                 // crypto.randomUUID()
  timestamp: string;          // new Date().toISOString()
  summary: string;            // 2-5 sentence prose from Claude
  key_insights: string[];     // 3-7 bullet observations
  topics: string[];           // 1-5 subject tags
  commands_run: string[];     // extracted shell commands (may be [])
  session_duration_s: number; // (Date.now() - sessionStartMs) / 1000
}

export interface CrystalEntry {
  version: number;             // monotonically increasing (1, 2, 3…)
  timestamp: string;           // new Date().toISOString()
  title: string;               // short phrase from Claude
  content: string;             // multi-paragraph synthesis
  key_facts: string[];         // 5-15 distilled facts
  source_dream_ids: string[];  // dream ids that fed this crystal
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function dreamsFilePath(): string {
  return path.join(os.homedir(), '.aetherlink', 'dreams', 'dreams.jsonl');
}

function crystalsDirPath(): string {
  return path.join(os.homedir(), '.aetherlink', 'crystals');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Dream I/O
// ---------------------------------------------------------------------------

export async function appendDream(entry: DreamEntry): Promise<void> {
  const filePath = dreamsFilePath();
  await ensureDir(path.dirname(filePath));
  try {
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[autodream] Failed to write dream entry:', err);
    throw err;
  }
}

export async function readDreams(): Promise<DreamEntry[]> {
  const filePath = dreamsFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const entries: DreamEntry[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as DreamEntry);
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.warn('[autodream] Failed to read dreams:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Crystal I/O
// ---------------------------------------------------------------------------

export async function nextCrystalVersion(): Promise<number> {
  const dir = crystalsDirPath();
  try {
    await ensureDir(dir);
    const files = await fs.readdir(dir);
    const versions: number[] = [];
    for (const f of files) {
      const m = f.match(/^crystal_(\d+)\.json$/);
      if (m) versions.push(parseInt(m[1], 10));
    }
    return versions.length > 0 ? Math.max(...versions) + 1 : 1;
  } catch {
    return 1;
  }
}

/**
 * Write a crystal to disk using an exclusive create (O_EXCL) to prevent
 * silent overwrites from concurrent callers.  Retries up to 5 times if the
 * target version file already exists.
 *
 * Returns the persisted file path and the final CrystalEntry (which may have
 * a higher version number than requested when retries occurred), or null on
 * failure.
 */
export async function writeCrystal(
  entry: CrystalEntry,
): Promise<{ filePath: string; entry: CrystalEntry } | null> {
  const dir = crystalsDirPath();
  await ensureDir(dir);

  let version = entry.version;
  for (let attempt = 0; attempt < 5; attempt++) {
    const filePath = path.join(dir, `crystal_${version}.json`);
    const entryWithVersion: CrystalEntry = attempt === 0 ? entry : { ...entry, version };
    try {
      // 'wx' flag = O_EXCL: fails with EEXIST if the file already exists,
      // preventing silent overwrites from concurrent crystallization calls.
      await fs.writeFile(filePath, JSON.stringify(entryWithVersion, null, 2), {
        encoding: 'utf-8',
        flag: 'wx',
      });
      return { filePath, entry: entryWithVersion };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        version += 1; // slot taken — try the next version
        continue;
      }
      console.warn('[autocrystalize] Failed to write crystal:', err);
      return null;
    }
  }
  console.warn('[autocrystalize] Could not allocate crystal version after 5 attempts');
  return null;
}
