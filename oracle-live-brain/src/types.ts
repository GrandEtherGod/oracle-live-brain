/** Faculties the brain will accept. Order is developmental, not anatomical. */
export const FACULTY_IDS = [
  'emotion',
  'memory',
  'planning',
  'voice',
  'coding',
  'research',
  'attention',
  'imagination',
] as const;

export type FacultyId = (typeof FACULTY_IDS)[number];

export interface FacultyMeta {
  id: FacultyId;
  name: string;
  /** Familiar anatomical landmark. A metaphor, not a medical claim. */
  where: string;
  /** Normalized position inside the brain drawing, 0–1. */
  x: number;
  y: number;
}

/** Anatomical front-to-back, which is also the drawing order. */
export const FACULTIES: readonly FacultyMeta[] = [
  { id: 'planning', name: 'Planning', where: 'Prefrontal cortex', x: 0.27, y: 0.40 },
  { id: 'voice', name: 'Voice', where: "Broca's area", x: 0.32, y: 0.54 },
  { id: 'coding', name: 'Coding', where: 'Premotor cortex', x: 0.42, y: 0.32 },
  { id: 'attention', name: 'Attention', where: 'Anterior cingulate', x: 0.52, y: 0.27 },
  { id: 'emotion', name: 'Emotion', where: 'Amygdala', x: 0.44, y: 0.55 },
  { id: 'memory', name: 'Memory', where: 'Hippocampus', x: 0.57, y: 0.62 },
  { id: 'research', name: 'Research', where: 'Parietal association cortex', x: 0.66, y: 0.36 },
  { id: 'imagination', name: 'Imagination', where: 'Precuneus', x: 0.70, y: 0.44 },
];

export const SIMULATED_CONVERSATIONS = 144;

export type StageName = 'germination' | 'differentiation' | 'integration' | 'echo' | 'live';

export interface Neuron {
  id: string;
  region: FacultyId;
  x: number;
  y: number;
  bornAt: number;
  agent: string | null;
}

export interface Pathway {
  id: string;
  from: string;
  to: string;
  weight: number;
  kind: 'internal' | 'bridge';
  bornAt: number;
  echoCount: number;
  activations: number;
  agent: string | null;
}

export interface Conversation {
  index: number;
  simulated: boolean;
  agent: string | null;
  faculty: FacultyId;
  size: number;
  timestamp: string;
  activatedInternal: number;
  activatedBridge: number;
  activatedPathwayIds: string[];
  echoPathwayIds: string[];
  echoReached: number[];
  neuronCount: number;
  pathwayCount: number;
}

export interface InProgress {
  turnId: string;
  agent: string;
  faculty: FacultyId;
  size: number;
  startedAt: string;
  pathwayIds: string[];
}

/** A talk-to-the-brain touch. Faculty and time only — never the words. */
export interface VoiceImpression {
  faculty: FacultyId;
  at: string;
}

export interface BrainState {
  version: 1;
  nextNeuron: number;
  nextPathway: number;
  nextTurn: number;
  neurons: Neuron[];
  pathways: Pathway[];
  conversations: Conversation[];
  inProgress: InProgress[];
  voiceImpressions: VoiceImpression[];
}

export interface TurnInput {
  agent: string | null;
  faculty: FacultyId;
  size: number;
  timestamp: string;
  simulated: boolean;
  turnId?: string;
}

export interface RegionView {
  id: FacultyId;
  name: string;
  where: string;
  x: number;
  y: number;
  neurons: number;
  internal: number;
  bridges: number;
  activations: number;
}

export interface LiveTurnView {
  index: number;
  agent: string;
  faculty: FacultyId;
  size: number;
  timestamp: string;
}

export interface Snapshot {
  generatedAt: string;
  counters: {
    conversations: number;
    liveTurns: number;
    neurons: number;
    pathways: number;
    pathwaysStrengthenedByEcho: number;
  };
  regions: RegionView[];
  neurons: Array<Pick<Neuron, 'id' | 'region' | 'x' | 'y' | 'agent' | 'bornAt'>>;
  pathways: Array<Pick<Pathway, 'id' | 'from' | 'to' | 'weight' | 'kind' | 'bornAt' | 'echoCount'>>;
  timeline: Array<{ index: number; simulated: boolean; faculty: FacultyId; agent: string | null }>;
  growth: Array<{ index: number; neurons: number; pathways: number; stage: StageName; simulated: boolean }>;
  fired: Array<{ index: number; internal: number; bridge: number; simulated: boolean }>;
  stages: Array<{ stage: StageName; conversations: number; neurons: number; pathways: number }>;
  recentLiveTurns: LiveTurnView[];
  latestEcho: {
    fromIndex: number;
    toIndexes: number[];
    pathwayIds: string[];
    faculty: FacultyId;
    agent: string | null;
  } | null;
  latestActivation: {
    fromIndex: number;
    pathwayIds: string[];
    faculty: FacultyId;
    agent: string | null;
  } | null;
  inProgress: InProgress[];
  voiceImpressions: VoiceImpression[];
}

export interface Sentence {
  text: string;
  faculty: FacultyId;
}
