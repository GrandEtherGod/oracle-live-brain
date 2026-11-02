import { timingSafeEqual } from 'crypto';
import { FACULTY_IDS, FacultyId } from './types';

const FACULTY_SET = new Set<string>(FACULTY_IDS);

/**
 * Keys that would carry the words of a turn. Ingest refuses the whole
 * request when any of these appear, at any depth. The values are never logged.
 */
const FORBIDDEN_KEYS = new Set([
  'message',
  'messages',
  'content',
  'text',
  'prompt',
  'prompts',
  'words',
  'utterance',
  'transcript',
  'query',
  'reply',
  'completion',
  'chat',
  'usermessage',
  'assistant',
  'input',
  'body',
  'question',
]);

const ALLOWED_TURN_KEYS = new Set(['agent', 'faculty', 'size', 'timestamp', 'turnId']);

const AGENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/;
const TURN_ID_PATTERN = /^turn-[0-9]{1,12}$/;

export function isFaculty(value: string): value is FacultyId {
  return FACULTY_SET.has(value);
}

export function containsForbidden(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsForbidden(item, depth + 1));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
    if (containsForbidden(child, depth + 1)) return true;
  }
  return false;
}

export interface TurnPayload {
  agent: string;
  faculty: FacultyId;
  size: number;
  timestamp?: string;
  turnId?: string;
}

export function parseTurnPayload(
  body: unknown,
): { ok: true; value: TurnPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'JSON object required' };
  }
  if (containsForbidden(body)) {
    return {
      ok: false,
      error: 'Message content is not accepted. Send only agent, faculty, size, timestamp, and turnId.',
    };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_TURN_KEYS.has(key)) {
      return { ok: false, error: `Unexpected field: ${key}` };
    }
  }
  if (typeof record.agent !== 'string' || !AGENT_PATTERN.test(record.agent)) {
    return { ok: false, error: 'agent must be 1–48 characters: letters, digits, . _ : -' };
  }
  if (typeof record.faculty !== 'string' || !isFaculty(record.faculty)) {
    return { ok: false, error: `faculty must be one of: ${FACULTY_IDS.join(', ')}` };
  }
  if (typeof record.size !== 'number' || !Number.isInteger(record.size) || record.size < 1 || record.size > 10) {
    return { ok: false, error: 'size must be an integer from 1 to 10' };
  }
  let timestamp: string | undefined;
  if (record.timestamp !== undefined) {
    if (typeof record.timestamp !== 'string') {
      return { ok: false, error: 'timestamp must be an ISO-8601 string' };
    }
    const parsed = Date.parse(record.timestamp);
    if (Number.isNaN(parsed)) return { ok: false, error: 'timestamp is not a valid date' };
    const skew = parsed - Date.now();
    if (skew > 10 * 60 * 1000) return { ok: false, error: 'timestamp is too far in the future' };
    if (parsed < Date.UTC(2020, 0, 1)) return { ok: false, error: 'timestamp is too old' };
    timestamp = new Date(parsed).toISOString();
  }
  let turnId: string | undefined;
  if (record.turnId !== undefined) {
    if (typeof record.turnId !== 'string' || !TURN_ID_PATTERN.test(record.turnId)) {
      return { ok: false, error: 'turnId must look like turn-1' };
    }
    turnId = record.turnId;
  }
  return {
    ok: true,
    value: { agent: record.agent, faculty: record.faculty, size: record.size, timestamp, turnId },
  };
}

export function parseTalkPayload(
  body: unknown,
): { ok: true; message: string } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'JSON object required' };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'message') return { ok: false, error: 'Send only a message field' };
  }
  if (typeof record.message !== 'string') return { ok: false, error: 'message must be a string' };
  const message = record.message.trim();
  if (!message) return { ok: false, error: 'message is empty' };
  if (message.length > 500) return { ok: false, error: 'message is too long' };
  return { ok: true, message };
}

/** Constant-time compare. Length mismatches still fail closed. */
export function safeEqual(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
