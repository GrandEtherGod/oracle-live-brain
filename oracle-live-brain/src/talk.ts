import { toSnapshot } from './brain';
import { BrainState, FacultyId, Sentence, Snapshot } from './types';
import { isFaculty } from './validate';

const FACULTY_LIST = 'memory, research, coding, voice, planning, emotion, attention, imagination';

function briefState(snapshot: Snapshot): Record<string, unknown> {
  return {
    counters: snapshot.counters,
    regions: snapshot.regions.map((region) => ({
      id: region.id,
      name: region.name,
      where: region.where,
      neurons: region.neurons,
      internal: region.internal,
      bridges: region.bridges,
      activations: region.activations,
    })),
    stages: snapshot.stages,
    recentLiveTurns: snapshot.recentLiveTurns.slice(0, 8),
    voiceImpressions: snapshot.voiceImpressions.slice(-5),
    inProgress: snapshot.inProgress.map((turn) => ({
      agent: turn.agent,
      faculty: turn.faculty,
      size: turn.size,
    })),
  };
}

/** Deterministic reply. Uses the question only to choose which real numbers to lead with. */
export function templateReply(question: string, snapshot: Snapshot): Sentence[] {
  const q = question.toLowerCase();
  const counters = snapshot.counters;
  const sentences: Sentence[] = [];
  const region = snapshot.regions.find((item) => q.includes(item.id) || q.includes(item.name.toLowerCase()));

  if (region) {
    sentences.push({
      faculty: region.id,
      text: `${region.name} sits in the ${region.where}. It holds ${region.neurons} neurons, ${region.internal} pathways inside itself, and ${region.bridges} bridges, with ${region.activations} activations.`,
    });
  }

  sentences.push({
    faculty: 'memory',
    text: `I am holding ${counters.conversations} conversations, ${counters.liveTurns} of them live. ${counters.neurons} neurons are linked by ${counters.pathways} pathways.`,
  });

  sentences.push({
    faculty: 'imagination',
    text: `Echo has strengthened ${counters.pathwaysStrengthenedByEcho} pathways. The gold pulse travels back into older routes. The record itself only moves forward.`,
  });

  const latest = snapshot.recentLiveTurns[0];
  if (latest) {
    sentences.push({
      faculty: latest.faculty,
      text: `The newest live turn is ${latest.faculty}, size ${latest.size}, from ${latest.agent}.`,
    });
  } else {
    sentences.push({
      faculty: 'planning',
      text: 'The first 144 conversations are simulated history that seeded the network. No live turn has been recorded yet.',
    });
  }

  if (q.includes('voice') || q.includes('speak') || q.includes('say')) {
    sentences.push({
      faculty: 'voice',
      text: 'I speak with the browser voice. The words you type are not written down — only the faculty they touch, and a time.',
    });
  }

  return sentences.slice(0, 4);
}

export function dominantFaculty(sentences: Sentence[]): FacultyId {
  const counts = new Map<FacultyId, number>();
  for (const sentence of sentences) {
    counts.set(sentence.faculty, (counts.get(sentence.faculty) || 0) + 1);
  }
  let best: FacultyId = sentences[0]?.faculty ?? 'voice';
  let bestCount = -1;
  for (const [faculty, count] of counts) {
    if (count > bestCount) {
      best = faculty;
      bestCount = count;
    }
  }
  return best;
}

function systemPrompt(snapshot: Snapshot): string {
  return [
    'You are the Oracle Live Brain, speaking as the network itself.',
    'Answer only from the JSON state below. Do not invent counts.',
    'Do not quote the person at length. Their words are not kept.',
    'Reply with JSON only, no markdown:',
    '{"sentences":[{"text":"short speakable sentence","faculty":"memory"}]}',
    'Use 2 to 4 sentences. Each faculty is the region that sentence draws on.',
    `faculty must be one of: ${FACULTY_LIST}.`,
    'State:',
    JSON.stringify(briefState(snapshot)),
  ].join('\n');
}

function coerceSentences(value: unknown): Sentence[] | null {
  if (!value || typeof value !== 'object') return null;
  const rows = (value as { sentences?: unknown }).sentences;
  if (!Array.isArray(rows)) return null;
  const sentences: Sentence[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const text = (row as { text?: unknown }).text;
    const faculty = (row as { faculty?: unknown }).faculty;
    if (typeof text !== 'string' || typeof faculty !== 'string' || !isFaculty(faculty)) continue;
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    sentences.push({ text: trimmed.slice(0, 400), faculty });
    if (sentences.length === 4) break;
  }
  return sentences.length ? sentences : null;
}

function parseModelText(raw: string): Sentence[] | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return coerceSentences(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return coerceSentences(JSON.parse(trimmed.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
}

function llmKey(): string {
  return (process.env.ORACLE_LLM_API_KEY || '').trim() || (process.env.ANTHROPIC_API_KEY || '').trim();
}

async function callCustom(url: string, question: string, snapshot: Snapshot): Promise<Sentence[] | null> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = llmKey();
  if (key) headers.authorization = `Bearer ${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question, system: systemPrompt(snapshot), state: briefState(snapshot) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.warn(`[oracle] custom llm http ${response.status}, using template`);
    return null;
  }
  const payload: unknown = await response.json();
  return coerceSentences(payload) || parseModelText(JSON.stringify(payload));
}

async function callAnthropic(question: string, snapshot: Snapshot): Promise<Sentence[] | null> {
  const key = llmKey();
  if (!key) return null;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: (process.env.ORACLE_LLM_MODEL || 'claude-3-5-haiku-20241022').trim(),
      max_tokens: 500,
      system: systemPrompt(snapshot),
      messages: [{ role: 'user', content: question }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.warn(`[oracle] anthropic http ${response.status}, using template`);
    return null;
  }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = (payload.content || []).filter((block) => block.type === 'text').map((block) => block.text || '').join('\n');
  return parseModelText(text);
}

/**
 * Answer from the live snapshot. The question is not stored by this function.
 * With no key and no custom URL, the template speaks the real counts.
 */
export async function answerQuestion(question: string, state: BrainState): Promise<{ sentences: Sentence[]; source: 'llm' | 'template' }> {
  const snapshot = toSnapshot(state);
  const url = (process.env.ORACLE_LLM_URL || '').trim();
  try {
    if (url) {
      const custom = await callCustom(url, question, snapshot);
      if (custom) return { sentences: custom, source: 'llm' };
    } else if (llmKey()) {
      const remote = await callAnthropic(question, snapshot);
      if (remote) return { sentences: remote, source: 'llm' };
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    console.warn(`[oracle] llm ${name}, using template`);
  }
  return { sentences: templateReply(question, snapshot), source: 'template' };
}
