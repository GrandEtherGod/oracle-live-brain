#!/usr/bin/env node
/**
 * Dependency-free client for the Oracle Live Brain.
 * Sends agent, faculty, size, and (on end) the turn id from the matching start.
 * Never sends message content.
 *
 *   ORACLE_BRAIN_URL=http://127.0.0.1:4317 \
 *   ORACLE_INGEST_TOKEN=... \
 *   ORACLE_AGENT_NAME=grok-bot \
 *   node post-turn.mjs start research 3
 *   node post-turn.mjs end research 3
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const FACULTIES = new Set([
  'memory', 'research', 'coding', 'voice', 'planning', 'emotion', 'attention', 'imagination',
]);

export async function postBrainTurn(phase, fields = {}) {
  if (phase !== 'start' && phase !== 'end') {
    throw new Error('phase must be start or end');
  }
  const base = (fields.url || process.env.ORACLE_BRAIN_URL || '').replace(/\/$/, '');
  const token = fields.token || process.env.ORACLE_INGEST_TOKEN || '';
  const agent = fields.agent || process.env.ORACLE_AGENT_NAME || 'grok-bot';
  const faculty = fields.faculty;
  const size = Number(fields.size ?? 2);
  if (!base) throw new Error('ORACLE_BRAIN_URL is not set');
  if (!token) throw new Error('ORACLE_INGEST_TOKEN is not set');
  if (!FACULTIES.has(faculty)) throw new Error(`unknown faculty: ${faculty}`);
  if (!Number.isInteger(size) || size < 1 || size > 10) throw new Error('size must be an integer from 1 to 10');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/.test(agent)) {
    throw new Error('agent name has unsupported characters');
  }

  const turnFile = path.join(os.tmpdir(), `oracle-brain-${agent}.turn`);
  const body = { agent, faculty, size };
  if (fields.timestamp) body.timestamp = fields.timestamp;
  if (phase === 'end') {
    const turnId = fields.turnId || readTurn(turnFile);
    if (turnId) body.turnId = turnId;
  }

  const response = await fetch(`${base}/api/turns/${phase}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (phase === 'start' && payload.turnId) {
    fs.writeFileSync(turnFile, String(payload.turnId));
  }
  if (phase === 'end') {
    fs.rmSync(turnFile, { force: true });
  }
  return payload;
}

function readTurn(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return /^turn-[0-9]{1,12}$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

async function cli() {
  const [phase, faculty, sizeArg] = process.argv.slice(2);
  if (!phase || !faculty) {
    console.error('usage: post-turn.mjs start|end FACULTY [SIZE]');
    process.exit(2);
  }
  try {
    const result = await postBrainTurn(phase, { faculty, size: sizeArg === undefined ? 2 : Number(sizeArg) });
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'request failed');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
