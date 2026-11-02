import { anticipate, completeTurn, createSeededBrain, toSnapshot } from './brain';
import { rngFromString } from './rng';
import { templateReply } from './talk';
import { parseTurnPayload } from './validate';

describe('oracle live brain', () => {
  it('seeds 144 simulated conversations and a living network', () => {
    const brain = createSeededBrain();
    const snapshot = toSnapshot(brain);
    expect(snapshot.counters.conversations).toBe(144);
    expect(snapshot.counters.liveTurns).toBe(0);
    expect(brain.conversations.every((conversation) => conversation.simulated)).toBe(true);
    expect(snapshot.counters.neurons).toBeGreaterThan(80);
    expect(snapshot.counters.pathways).toBeGreaterThan(80);
    expect(snapshot.counters.pathwaysStrengthenedByEcho).toBeGreaterThan(0);
    expect(snapshot.regions).toHaveLength(8);
    expect(snapshot.latestEcho).not.toBeNull();
  });

  it('seeds the same brain every time', () => {
    const left = createSeededBrain();
    const right = createSeededBrain();
    expect(left.neurons.map((neuron) => `${neuron.id}:${neuron.x}:${neuron.y}`)).toEqual(
      right.neurons.map((neuron) => `${neuron.id}:${neuron.x}:${neuron.y}`),
    );
    expect(left.pathways.map((pathway) => pathway.id)).toEqual(right.pathways.map((pathway) => pathway.id));
  });

  it('records a live turn without storing words and grows the counters', () => {
    const brain = createSeededBrain();
    const before = toSnapshot(brain);
    const started = anticipate(brain, {
      agent: 'grok-test',
      faculty: 'coding',
      size: 4,
      timestamp: '2026-11-02T04:00:00.000Z',
    }, rngFromString('anticipate-test'));
    expect(toSnapshot(brain).counters.liveTurns).toBe(0);
    expect(started.pathwayIds.length).toBeGreaterThan(0);

    const result = completeTurn(brain, {
      agent: 'grok-test',
      faculty: 'coding',
      size: 4,
      timestamp: '2026-11-02T04:00:01.000Z',
      simulated: false,
      turnId: started.turnId,
    }, rngFromString('complete-test'));

    const after = toSnapshot(brain);
    expect(after.counters.liveTurns).toBe(1);
    expect(after.counters.conversations).toBe(before.counters.conversations + 1);
    expect(after.counters.neurons).toBe(before.counters.neurons + 1);
    expect(after.counters.pathways).toBeGreaterThan(before.counters.pathways);
    expect(result.confirmationPathwayIds).toEqual(started.pathwayIds);
    expect(result.echoPathwayIds.length).toBeGreaterThan(0);
    expect(after.recentLiveTurns[0]).toMatchObject({
      agent: 'grok-test',
      faculty: 'coding',
      size: 4,
    });
    expect(JSON.stringify(brain)).not.toContain('secret phrase');
    expect(brain.inProgress.some((turn) => turn.turnId === started.turnId)).toBe(false);
  });

  it('refuses message content on ingest payloads', () => {
    const rejected = parseTurnPayload({
      agent: 'grok-test',
      faculty: 'memory',
      size: 2,
      text: 'do not store this sentence',
    });
    expect(rejected.ok).toBe(false);
    const accepted = parseTurnPayload({ agent: 'grok-test', faculty: 'memory', size: 2 });
    expect(accepted.ok).toBe(true);
  });

  it('answers from the real counters when no model key is used', () => {
    const snapshot = toSnapshot(createSeededBrain());
    const sentences = templateReply('how many neurons are awake?', snapshot);
    const joined = sentences.map((sentence) => sentence.text).join(' ');
    expect(joined).toContain(`${snapshot.counters.neurons} neurons`);
    expect(joined).toContain(`${snapshot.counters.pathways} pathways`);
    expect(joined).not.toContain('how many neurons are awake');
    expect(sentences.every((sentence) => sentence.faculty.length > 0)).toBe(true);
  });
});
