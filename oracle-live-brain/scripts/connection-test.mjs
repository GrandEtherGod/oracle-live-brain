#!/usr/bin/env node
/**
 * Starts the brain, opens the live socket, posts one turn, and checks the counters.
 * Run from anywhere: node oracle-live-brain/scripts/connection-test.mjs
 */
import { spawn, execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const token = 'oracle-test-token';
const secret = 'zxq-secret-phrase-9f3a';

function fail(message) {
  const error = new Error(message);
  throw error;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try {
        value = predicate();
      } catch (err) {
        reject(err);
        return;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function openSocket(port) {
  const messages = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/live`);
  ws.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

async function main() {
  const tscCandidates = [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  const tsc = tscCandidates.find((candidate) => fs.existsSync(candidate));
  if (!tsc) fail('typescript is not installed. Run npm install inside oracle-live-brain.');
  execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json')], {
    cwd: root,
    stdio: 'inherit',
  });

  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-brain-'));
  const dataFile = path.join(dir, 'state.json');
  let logs = '';
  const child = spawn(process.execPath, [path.join(root, 'dist', 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ORACLE_INGEST_TOKEN: token,
      ORACLE_DATA_PATH: dataFile,
      ORACLE_LLM_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      ORACLE_LLM_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  const stop = () => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.on('exit', stop);

  try {
    const base = `http://127.0.0.1:${port}`;
    let health;
    const healthStart = Date.now();
    while (!health) {
      if (child.exitCode !== null) fail('server exited early', logs);
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) health = await response.json();
      } catch {
        health = null;
      }
      if (!health) {
        if (Date.now() - healthStart > 15000) fail('server did not become healthy', logs);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
    if (health.conversations !== 144 || health.liveTurns !== 0) {
      fail(`unexpected seed counters ${JSON.stringify(health)}`);
    }

    const first = await openSocket(port);
    const hello = await waitFor(() => first.messages.find((message) => message.type === 'hello'), 4000, 'hello');
    if (hello.snapshot.counters.conversations !== 144) fail('hello snapshot was not seeded');
    if (!hello.snapshot.neurons.length || !hello.snapshot.pathways.length) fail('hello snapshot had an empty brain');

    const denied = await fetch(`${base}/api/turns/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ agent: 'grok-test', faculty: 'coding', size: 2 }),
    });
    if (denied.status !== 401) fail(`expected 401 for a bad token, got ${denied.status}`);

    const leaked = await fetch(`${base}/api/turns/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ agent: 'grok-test', faculty: 'coding', size: 2, text: secret }),
    });
    if (leaked.status !== 400) fail(`expected 400 when content is sent, got ${leaked.status}`);

    const started = await fetch(`${base}/api/turns/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ agent: 'grok-test', faculty: 'coding', size: 4 }),
    });
    const startBody = await started.json();
    if (!started.ok) fail(`start failed ${started.status} ${JSON.stringify(startBody)}`);
    const anticipation = await waitFor(
      () => first.messages.find((message) => message.type === 'anticipation' && message.turnId === startBody.turnId),
      4000,
      'anticipation',
    );
    if (!anticipation.pathwayIds.length) fail('anticipation carried no pathways');

    const ended = await fetch(`${base}/api/turns/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ agent: 'grok-test', faculty: 'coding', size: 4, turnId: startBody.turnId }),
    });
    const endBody = await ended.json();
    if (!ended.ok) fail(`end failed ${ended.status} ${JSON.stringify(endBody)}`);
    if (JSON.stringify(endBody.confirmationPathwayIds) !== JSON.stringify(startBody.anticipatedPathwayIds)) {
      fail('confirmation did not flash the anticipated pathways');
    }
    await waitFor(() => first.messages.find((message) => message.type === 'echo'), 4000, 'echo');

    const after = await (await fetch(`${base}/api/state`)).json();
    if (after.counters.liveTurns !== 1) fail(`live turns did not advance: ${after.counters.liveTurns}`);
    if (after.counters.conversations !== hello.snapshot.counters.conversations + 1) {
      fail('conversation counter did not advance');
    }
    if (after.counters.neurons !== hello.snapshot.counters.neurons + 1) {
      fail(`neurons did not grow (${hello.snapshot.counters.neurons} -> ${after.counters.neurons})`);
    }
    if (after.counters.pathways <= hello.snapshot.counters.pathways) fail('pathways did not grow');
    if (!after.recentLiveTurns[0] || after.recentLiveTurns[0].agent !== 'grok-test') {
      fail('recent live turns did not name the agent');
    }
    if (JSON.stringify(after).includes(secret)) fail('state snapshot stored rejected content');

    first.ws.close();
    const second = await openSocket(port);
    const again = await waitFor(() => second.messages.find((message) => message.type === 'hello'), 4000, 'reconnect hello');
    if (again.snapshot.counters.liveTurns !== 1) fail('a new socket did not receive the updated brain');
    second.ws.close();

    const talk = await fetch(`${base}/api/talk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: secret }),
    });
    const talkBody = await talk.json();
    if (!talk.ok) fail(`talk failed ${talk.status} ${JSON.stringify(talkBody)}`);
    const spoken = (talkBody.sentences || []).map((sentence) => sentence.text).join(' ');
    if (!spoken.includes(`${after.counters.neurons} neurons`)) {
      fail('template reply did not cite the live neuron count');
    }
    if (spoken.includes(secret)) fail('the reply echoed the question');
    const finalState = await (await fetch(`${base}/api/state`)).json();
    const onDisk = fs.readFileSync(dataFile, 'utf8');
    if (JSON.stringify(finalState).includes(secret) || onDisk.includes(secret)) {
      fail('the question was stored');
    }
    if (!finalState.voiceImpressions.length) fail('voice impression was not recorded');
    const impression = finalState.voiceImpressions[finalState.voiceImpressions.length - 1];
    if (!impression.faculty || !impression.at) fail('voice impression is missing faculty or time');

    console.log(
      `counters advanced conversations ${hello.snapshot.counters.conversations} -> ${after.counters.conversations}, `
      + `live ${hello.snapshot.counters.liveTurns} -> ${after.counters.liveTurns}, `
      + `neurons ${hello.snapshot.counters.neurons} -> ${after.counters.neurons}`,
    );
  } catch (err) {
    if (err && typeof err === 'object') err.logs = logs;
    throw err;
  } finally {
    stop();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once('exit', () => resolve());
      setTimeout(resolve, 2000);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  if (err && err.logs) console.error(err.logs);
  process.exit(1);
});
