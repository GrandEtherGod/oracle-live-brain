/**
 * AutoCrystalize — solidification of AutoDream entries into versioned knowledge artifacts.
 *
 * Reads all stored DreamEntries, calls Claude to distill them into a
 * CrystalEntry, and persists it to disk.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CrystalEntry, DreamEntry, nextCrystalVersion, readDreams, writeCrystal } from './memory';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CRYSTALIZE_SYSTEM_PROMPT =
  'You are a knowledge crystallization assistant for AetherLinkOS. ' +
  'You will be given a list of session dream entries in JSON format. ' +
  'Respond ONLY with a valid JSON object — no prose, no markdown fences. ' +
  'The JSON object must have exactly these keys:\n' +
  '  "title": string (a short 3-8 word title for this knowledge crystal),\n' +
  '  "content": string (multi-paragraph synthesis of the sessions\' lessons),\n' +
  '  "key_facts": array of strings (5-15 distilled facts worth remembering)';

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

const MAX_DREAMS_PER_CRYSTAL = 20;

export async function runAutoCrystalize(minDreams: number = 1): Promise<CrystalEntry | null> {
  const allDreams = await readDreams();
  if (allDreams.length < minDreams) return null;

  const dreams = allDreams.slice(-MAX_DREAMS_PER_CRYSTAL);

  const prompt =
    'Please distill the following dream entries into a knowledge crystal.\n\n' +
    'Dream entries:\n' +
    JSON.stringify(dreams, null, 2);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: CRYSTALIZE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('');

  const parsed = JSON.parse(extractJson(rawText)) as {
    title: string;
    content: string;
    key_facts: string[];
  };

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every(x => typeof x === 'string');

  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.content !== 'string' ||
    !isStringArray(parsed.key_facts)
  ) {
    throw new Error('[autocrystalize] Claude returned an unexpected JSON shape');
  }

  const version = await nextCrystalVersion();
  const entry: CrystalEntry = {
    version,
    timestamp: new Date().toISOString(),
    title: parsed.title,
    content: parsed.content,
    key_facts: parsed.key_facts,
    source_dream_ids: dreams.map((d: DreamEntry) => d.id),
  };

  const result = await writeCrystal(entry);
  if (!result) {
    console.warn('[autocrystalize] Crystal could not be persisted; skipping.');
    return null;
  }
  return result.entry;
}
