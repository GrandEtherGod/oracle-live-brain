import fs from 'fs';
import path from 'path';
import { createSeededBrain, expireStaleTurns } from './brain';
import { BrainState } from './types';

export function resolveDataPath(): string {
  return process.env.ORACLE_DATA_PATH || path.join(__dirname, '..', 'data', 'state.json');
}

function isBrainState(value: unknown): value is BrainState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BrainState>;
  return record.version === 1
    && Array.isArray(record.neurons)
    && Array.isArray(record.pathways)
    && Array.isArray(record.conversations)
    && Array.isArray(record.inProgress)
    && Array.isArray(record.voiceImpressions);
}

export function loadOrSeed(file: string): BrainState {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isBrainState(parsed)) {
      expireStaleTurns(parsed);
      return parsed;
    }
    const bad = `${file}.bad`;
    fs.renameSync(file, bad);
    console.warn(`[oracle] state at ${file} did not match version 1; moved aside and reseeded`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') {
      console.warn(`[oracle] could not read state (${code}); seeding a new brain`);
    }
  }
  const seeded = createSeededBrain();
  saveState(file, seeded);
  return seeded;
}

export function saveState(file: string, state: BrainState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}
