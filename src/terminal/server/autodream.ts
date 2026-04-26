/**
 * AutoDream — async post-session reflection for the voice terminal.
 *
 * Called at the end of each WebSocket session.  Sends the conversation
 * history to Claude for reflection and persists a DreamEntry to disk.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'crypto';
import { appendDream, DreamEntry } from './memory';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DREAM_SYSTEM_PROMPT =
  'You are a session reflection assistant for AetherLinkOS. ' +
  'You will be given a conversation transcript between a user and an AI agent. ' +
  'Respond ONLY with a valid JSON object — no prose, no markdown fences. ' +
  'The JSON object must have exactly these keys:\n' +
  '  "summary": string (2-5 sentences describing what happened),\n' +
  '  "key_insights": array of strings (3-7 observations),\n' +
  '  "topics": array of strings (1-5 subject tags),\n' +
  '  "commands_run": array of strings (shell commands that were executed, may be empty)';

const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 40_000;

function serializeHistory(history: Anthropic.MessageParam[]): string {
  const messages = history.slice(-MAX_HISTORY_MESSAGES);
  const truncated = history.length - messages.length;
  const lines: string[] = [];

  if (truncated > 0) {
    lines.push(`[… ${truncated} earlier messages truncated …]\n`);
  }

  for (const msg of messages) {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    const content = msg.content;
    if (typeof content === 'string') {
      lines.push(`${role}: ${content}`);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          lines.push(`${role}: ${block.text}`);
        } else if (block.type === 'tool_use') {
          lines.push(`${role} [tool:${block.name}]: ${JSON.stringify(block.input)}`);
        } else if (block.type === 'tool_result') {
          const c = block.content;
          const resultText = typeof c === 'string' ? c : JSON.stringify(c);
          lines.push(`ToolResult: ${resultText}`);
        }
      }
    }
  }

  let transcript = lines.join('\n');
  if (transcript.length > MAX_HISTORY_CHARS) {
    transcript = '[… transcript truncated …]\n' + transcript.slice(-MAX_HISTORY_CHARS);
  }
  return transcript;
}

function extractJson(text: string): string {
  text = text.trim();
  if (text.startsWith('```')) {
    const lines = text.split('\n');
    const inner = lines.slice(1);
    if (inner[inner.length - 1].trim() === '```') inner.pop();
    text = inner.join('\n').trim();
  }
  return text;
}

export async function runAutoDream(
  history: Anthropic.MessageParam[],
  sessionStartMs: number
): Promise<DreamEntry> {
  const transcript = serializeHistory(history);
  const prompt =
    'Please reflect on the following agent session transcript and return ' +
    'a JSON summary as described.\n\nTranscript:\n' +
    transcript;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: DREAM_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('');

  const parsed = JSON.parse(extractJson(rawText)) as {
    summary: string;
    key_insights: string[];
    topics: string[];
    commands_run: string[];
  };

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every(x => typeof x === 'string');

  if (
    typeof parsed.summary !== 'string' ||
    !isStringArray(parsed.key_insights) ||
    !isStringArray(parsed.topics) ||
    !isStringArray(parsed.commands_run)
  ) {
    throw new Error('[autodream] Claude returned an unexpected JSON shape');
  }

  const entry: DreamEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    summary: parsed.summary,
    key_insights: parsed.key_insights,
    topics: parsed.topics,
    commands_run: parsed.commands_run,
    session_duration_s: (Date.now() - sessionStartMs) / 1000,
  };

  await appendDream(entry);
  return entry;
}
