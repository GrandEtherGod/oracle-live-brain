import { Rng, mulberry32 } from './rng';
import {
  BrainState,
  Conversation,
  FACULTIES,
  FacultyId,
  FacultyMeta,
  InProgress,
  Neuron,
  Pathway,
  SIMULATED_CONVERSATIONS,
  Snapshot,
  StageName,
  TurnInput,
  VoiceImpression,
} from './types';

/** Developmental order. Early conversations only draw from the front of this list. */
const DEVELOPMENT_ORDER: FacultyId[] = [
  'emotion',
  'memory',
  'planning',
  'voice',
  'coding',
  'research',
  'attention',
  'imagination',
];

const SEED_START = Date.UTC(2026, 7, 1);
const SEED_STEP_MS = 3 * 60 * 60 * 1000;
const SEED = 0x4f52434c;

const facultyById = new Map<FacultyId, FacultyMeta>(FACULTIES.map((faculty) => [faculty.id, faculty]));

export function stageFor(index: number, simulated: boolean): StageName {
  if (!simulated) return 'live';
  if (index <= 36) return 'germination';
  if (index <= 72) return 'differentiation';
  if (index <= 108) return 'integration';
  return 'echo';
}

export function emptyBrain(): BrainState {
  return {
    version: 1,
    nextNeuron: 1,
    nextPathway: 1,
    nextTurn: 1,
    neurons: [],
    pathways: [],
    conversations: [],
    inProgress: [],
    voiceImpressions: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

function neuronsIn(state: BrainState, region: FacultyId): Neuron[] {
  return state.neurons.filter((neuron) => neuron.region === region);
}

function addNeuron(
  state: BrainState,
  region: FacultyId,
  bornAt: number,
  agent: string | null,
  rng: Rng,
): Neuron {
  const center = facultyById.get(region)!;
  const angle = rng.next() * Math.PI * 2;
  const radius = 0.006 + rng.next() * 0.026;
  const neuron: Neuron = {
    id: `n${state.nextNeuron++}`,
    region,
    x: clamp(center.x + Math.cos(angle) * radius, 0.18, 0.84),
    y: clamp(center.y + Math.sin(angle) * radius * 0.85, 0.20, 0.74),
    bornAt,
    agent,
  };
  state.neurons.push(neuron);
  return neuron;
}

function connect(
  state: BrainState,
  edges: Set<string>,
  a: Neuron,
  b: Neuron,
  bornAt: number,
  agent: string | null,
): Pathway | null {
  if (a.id === b.id) return null;
  const key = pairKey(a.id, b.id);
  if (edges.has(key)) return null;
  const pathway: Pathway = {
    id: `p${state.nextPathway++}`,
    from: a.id,
    to: b.id,
    weight: 1,
    kind: a.region === b.region ? 'internal' : 'bridge',
    bornAt,
    echoCount: 0,
    activations: 0,
    agent,
  };
  edges.add(key);
  state.pathways.push(pathway);
  return pathway;
}

function edgeSet(state: BrainState): Set<string> {
  const edges = new Set<string>();
  for (const pathway of state.pathways) edges.add(pairKey(pathway.from, pathway.to));
  return edges;
}

function neuronMap(state: BrainState): Map<string, Neuron> {
  return new Map(state.neurons.map((neuron) => [neuron.id, neuron]));
}

function touches(pathway: Pathway, neurons: Map<string, Neuron>, faculty: FacultyId): boolean {
  const from = neurons.get(pathway.from);
  const to = neurons.get(pathway.to);
  return from?.region === faculty || to?.region === faculty;
}

function selectPathways(state: BrainState, faculty: FacultyId, count: number, rng: Rng): Pathway[] {
  if (!state.pathways.length || count <= 0) return [];
  const neurons = neuronMap(state);
  const ranked = state.pathways.map((pathway) => {
    let score = pathway.weight + rng.next();
    if (touches(pathway, neurons, faculty)) score += 3;
    return { pathway, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.min(count, ranked.length)).map((row) => row.pathway);
}

function grow(state: BrainState, input: TurnInput, index: number, rng: Rng): void {
  const edges = edgeSet(state);
  const localsBefore = neuronsIn(state, input.faculty);
  const crowded = localsBefore.length >= 22;
  const shouldAdd = !input.simulated || !crowded || input.size >= 3 || localsBefore.length < 2;
  const born = shouldAdd ? addNeuron(state, input.faculty, index, input.agent, rng) : null;
  const locals = neuronsIn(state, input.faculty);

  if (born && locals.length >= 2) {
    const others = locals.filter((neuron) => neuron.id !== born.id);
    connect(state, edges, born, others[rng.int(others.length)], index, input.agent);
  } else if (!born && locals.length >= 2) {
    const a = locals[rng.int(locals.length)];
    let b = locals[rng.int(locals.length)];
    if (b.id === a.id) b = locals[(locals.indexOf(a) + 1) % locals.length];
    connect(state, edges, a, b, index, input.agent);
  }

  const wantBridge = !input.simulated || index > 72 || (index > 36 && input.size >= 3);
  if (wantBridge) {
    const mine = born ?? locals[rng.int(locals.length)] ?? null;
    const others = state.neurons.filter((neuron) => neuron.region !== input.faculty);
    if (mine && others.length) {
      connect(state, edges, mine, others[rng.int(others.length)], index, input.agent);
    }
  }
}

/**
 * Strengthen older pathways. Germination (the first 36 simulated
 * conversations) only grows the graph. Every later conversation, including
 * every live turn, sends echo backward into routes that already exist.
 * The records stay in order — only the weights change.
 */
function echoOlder(state: BrainState, faculty: FacultyId, index: number, size: number, rng: Rng): Pathway[] {
  if (index <= 36) return [];
  const older = state.pathways.filter((pathway) => pathway.bornAt < index);
  if (!older.length) return [];
  const neurons = neuronMap(state);
  const ranked = older.map((pathway) => {
    let score = rng.next();
    if (touches(pathway, neurons, faculty)) score += 2;
    score += Math.max(0, 1.5 - pathway.echoCount * 0.25);
    score += (index - pathway.bornAt) / index;
    return { pathway, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  const count = Math.min(ranked.length, Math.max(2, Math.min(5, size + 1)));
  const oldest = [...older].sort((a, b) => a.bornAt - b.bornAt || (a.id < b.id ? -1 : 1));
  const chosen: Pathway[] = [];
  const seen = new Set<string>();
  const take = (pathway: Pathway): void => {
    if (chosen.length >= count || seen.has(pathway.id)) return;
    seen.add(pathway.id);
    chosen.push(pathway);
  };
  // At least two pulses reach the earliest routes, and prefer a different
  // region so the gold visibly travels backward across the brain.
  for (const pathway of oldest) {
    if (chosen.length >= Math.min(2, count)) break;
    if (touches(pathway, neurons, faculty)) continue;
    take(pathway);
  }
  for (const pathway of oldest) {
    if (chosen.length >= Math.min(2, count)) break;
    take(pathway);
  }
  for (const row of ranked) take(row.pathway);
  for (const pathway of chosen) {
    pathway.weight = Math.min(8, +(pathway.weight + 0.35).toFixed(4));
    pathway.echoCount += 1;
  }
  return chosen;
}

export interface TurnResult {
  conversation: Conversation;
  confirmationPathwayIds: string[];
  echoPathwayIds: string[];
}

/**
 * Fold one conversation into the brain.
 * Simulated history and live turns share this path. Nothing here accepts text.
 */
export function completeTurn(state: BrainState, input: TurnInput, rng: Rng): TurnResult {
  const index = state.conversations.length + 1;
  grow(state, input, index, rng);

  const pending = input.turnId
    ? state.inProgress.find((turn) => turn.turnId === input.turnId)
    : [...state.inProgress].reverse().find((turn) => turn.agent === input.agent && !input.simulated);

  const byId = new Map(state.pathways.map((pathway) => [pathway.id, pathway]));
  let confirmed: Pathway[] = [];
  if (pending) {
    confirmed = pending.pathwayIds
      .map((id) => byId.get(id))
      .filter((pathway): pathway is Pathway => Boolean(pathway));
  }
  if (!confirmed.length) {
    confirmed = selectPathways(state, input.faculty, Math.min(8, 2 + input.size), rng);
  }
  for (const pathway of confirmed) pathway.activations += 1;

  const echoed = echoOlder(state, input.faculty, index, input.size, rng);
  const echoReached = [...new Set(echoed.map((pathway) => pathway.bornAt))].sort((a, b) => a - b);

  const conversation: Conversation = {
    index,
    simulated: input.simulated,
    agent: input.agent,
    faculty: input.faculty,
    size: input.size,
    timestamp: input.timestamp,
    activatedInternal: confirmed.filter((pathway) => pathway.kind === 'internal').length,
    activatedBridge: confirmed.filter((pathway) => pathway.kind === 'bridge').length,
    activatedPathwayIds: confirmed.map((pathway) => pathway.id),
    echoPathwayIds: echoed.map((pathway) => pathway.id),
    echoReached,
    neuronCount: state.neurons.length,
    pathwayCount: state.pathways.length,
  };
  state.conversations.push(conversation);
  if (pending) state.inProgress = state.inProgress.filter((turn) => turn !== pending);
  return {
    conversation,
    confirmationPathwayIds: conversation.activatedPathwayIds,
    echoPathwayIds: conversation.echoPathwayIds,
  };
}

/**
 * A turn has started. Likely pathways glow; counters do not move.
 * The words of the turn are not part of this call.
 */
export function anticipate(
  state: BrainState,
  input: { agent: string; faculty: FacultyId; size: number; timestamp: string },
  rng: Rng,
): InProgress {
  const chosen = selectPathways(state, input.faculty, Math.min(8, 2 + input.size), rng);
  const turn: InProgress = {
    turnId: `turn-${state.nextTurn++}`,
    agent: input.agent,
    faculty: input.faculty,
    size: input.size,
    startedAt: input.timestamp,
    pathwayIds: chosen.map((pathway) => pathway.id),
  };
  state.inProgress.push(turn);
  if (state.inProgress.length > 50) {
    state.inProgress.splice(0, state.inProgress.length - 50);
  }
  return turn;
}

export function recordVoiceImpression(state: BrainState, faculty: FacultyId, at: string): VoiceImpression {
  const impression: VoiceImpression = { faculty, at };
  state.voiceImpressions.push(impression);
  if (state.voiceImpressions.length > 30) {
    state.voiceImpressions.splice(0, state.voiceImpressions.length - 30);
  }
  return impression;
}

export function createSeededBrain(): BrainState {
  const state = emptyBrain();
  const rng = mulberry32(SEED);
  for (let i = 1; i <= SIMULATED_CONVERSATIONS; i += 1) {
    const pool = i <= 36 ? 3 : i <= 72 ? 6 : 8;
    const faculty = DEVELOPMENT_ORDER[rng.int(pool)];
    const size = 1 + rng.int(3);
    completeTurn(
      state,
      {
        agent: null,
        faculty,
        size,
        timestamp: new Date(SEED_START + (i - 1) * SEED_STEP_MS).toISOString(),
        simulated: true,
      },
      rng,
    );
  }
  return state;
}

export function expireStaleTurns(state: BrainState, now = Date.now()): void {
  const cutoff = now - 10 * 60 * 1000;
  state.inProgress = state.inProgress.filter((turn) => {
    const started = Date.parse(turn.startedAt);
    return !Number.isNaN(started) && started >= cutoff;
  });
}

export function toSnapshot(state: BrainState, now = new Date()): Snapshot {
  const neurons = neuronMap(state);
  const regions = FACULTIES.map((faculty) => {
    let internal = 0;
    let bridges = 0;
    let activations = 0;
    for (const pathway of state.pathways) {
      const from = neurons.get(pathway.from);
      const to = neurons.get(pathway.to);
      const fromHere = from?.region === faculty.id;
      const toHere = to?.region === faculty.id;
      if (fromHere && toHere) internal += 1;
      else if (fromHere || toHere) bridges += 1;
      if (fromHere || toHere) activations += pathway.activations;
    }
    return {
      id: faculty.id,
      name: faculty.name,
      where: faculty.where,
      x: faculty.x,
      y: faculty.y,
      neurons: state.neurons.filter((neuron) => neuron.region === faculty.id).length,
      internal,
      bridges,
      activations,
    };
  });

  const live = state.conversations.filter((conversation) => !conversation.simulated);
  const lastWithEcho = [...state.conversations].reverse().find((conversation) => conversation.echoPathwayIds.length > 0);
  const lastActivation = [...state.conversations].reverse().find((conversation) => conversation.activatedPathwayIds.length > 0);

  const stageNames: StageName[] = ['germination', 'differentiation', 'integration', 'echo', 'live'];
  const stages = stageNames.map((stage) => {
    const rows = state.conversations.filter((conversation) => stageFor(conversation.index, conversation.simulated) === stage);
    const last = rows[rows.length - 1];
    return {
      stage,
      conversations: rows.length,
      neurons: last ? last.neuronCount : 0,
      pathways: last ? last.pathwayCount : 0,
    };
  });

  return {
    generatedAt: now.toISOString(),
    counters: {
      conversations: state.conversations.length,
      liveTurns: live.length,
      neurons: state.neurons.length,
      pathways: state.pathways.length,
      pathwaysStrengthenedByEcho: state.pathways.filter((pathway) => pathway.echoCount > 0).length,
    },
    regions,
    neurons: state.neurons.map((neuron) => ({
      id: neuron.id,
      region: neuron.region,
      x: neuron.x,
      y: neuron.y,
      agent: neuron.agent,
      bornAt: neuron.bornAt,
    })),
    pathways: state.pathways.map((pathway) => ({
      id: pathway.id,
      from: pathway.from,
      to: pathway.to,
      weight: pathway.weight,
      kind: pathway.kind,
      bornAt: pathway.bornAt,
      echoCount: pathway.echoCount,
    })),
    timeline: state.conversations.map((conversation) => ({
      index: conversation.index,
      simulated: conversation.simulated,
      faculty: conversation.faculty,
      agent: conversation.agent,
    })),
    growth: state.conversations.map((conversation) => ({
      index: conversation.index,
      neurons: conversation.neuronCount,
      pathways: conversation.pathwayCount,
      stage: stageFor(conversation.index, conversation.simulated),
      simulated: conversation.simulated,
    })),
    fired: state.conversations.map((conversation) => ({
      index: conversation.index,
      internal: conversation.activatedInternal,
      bridge: conversation.activatedBridge,
      simulated: conversation.simulated,
    })),
    stages,
    recentLiveTurns: [...live].reverse().slice(0, 12).map((conversation) => ({
      index: conversation.index,
      agent: conversation.agent || 'unknown',
      faculty: conversation.faculty,
      size: conversation.size,
      timestamp: conversation.timestamp,
    })),
    latestEcho: lastWithEcho
      ? {
          fromIndex: lastWithEcho.index,
          toIndexes: lastWithEcho.echoReached,
          pathwayIds: lastWithEcho.echoPathwayIds,
          faculty: lastWithEcho.faculty,
          agent: lastWithEcho.agent,
        }
      : null,
    latestActivation: lastActivation
      ? {
          fromIndex: lastActivation.index,
          pathwayIds: lastActivation.activatedPathwayIds,
          faculty: lastActivation.faculty,
          agent: lastActivation.agent,
        }
      : null,
    inProgress: state.inProgress.map((turn) => ({ ...turn, pathwayIds: [...turn.pathwayIds] })),
    voiceImpressions: state.voiceImpressions.map((impression) => ({ ...impression })),
  };
}
