#!/usr/bin/env node
/**
 * Boot the brain, drive Chrome, and save screenshots of live data and an echo in flight.
 * Requires google-chrome on PATH. Uses the ws package already installed here.
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = process.env.ORACLE_SHOT_DIR || '/opt/cursor/artifacts/oracle-live-brain';
const port = Number(process.env.PORT || 4317);
const token = 'oracle-capture-token';
const debugPort = 9333;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* retry */ }
    await sleep(80);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function postTurn(phase, agent, faculty, size, turnId) {
  const body = { agent, faculty, size };
  if (turnId) body.turnId = turnId;
  const response = await fetch(`http://127.0.0.1:${port}/api/turns/${phase}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${phase} failed: ${JSON.stringify(payload)}`);
  return payload;
}

function cdp(ws) {
  let seq = 0;
  const pending = new Map();
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  return function send(method, params = {}, sessionId) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  };
}

async function evaluate(send, sessionId, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result && result.result.value;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { execFileSync } = await import('child_process');
  const tsc = [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
  ].find((candidate) => fs.existsSync(candidate));
  if (!tsc) throw new Error('typescript missing');
  execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-shot-'));
  const server = spawn(process.execPath, [path.join(root, 'dist', 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ORACLE_INGEST_TOKEN: token,
      ORACLE_DATA_PATH: path.join(dir, 'state.json'),
      ORACLE_LLM_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      ORACLE_LLM_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', (chunk) => { logs += chunk; });
  server.stderr.on('data', (chunk) => { logs += chunk; });

  const chromeData = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-chrome-'));
  const chromeBin = fs.existsSync('/usr/bin/google-chrome-stable')
    ? '/usr/bin/google-chrome-stable'
    : 'google-chrome';
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    `--user-data-dir=${chromeData}`,
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1440,1200',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ], { stdio: 'ignore' });

  const stop = () => {
    if (!server.killed) server.kill('SIGTERM');
    if (!chrome.killed) chrome.kill('SIGTERM');
  };
  process.on('exit', stop);

  try {
    await waitForHttp(`http://127.0.0.1:${port}/api/health`, 15000);
    const version = await (await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15000)).json();
    const browser = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      browser.once('open', resolve);
      browser.once('error', reject);
    });
    const send = cdp(browser);
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);

    const liveStart = Date.now();
    let status = '';
    while (Date.now() - liveStart < 10000) {
      status = await evaluate(send, sessionId, `document.querySelector('#status').dataset.state`);
      const conversations = await evaluate(send, sessionId, `document.querySelector('#count-conversations').textContent`);
      if (status === 'live' && conversations === '144') break;
      await sleep(100);
    }
    if (status !== 'live') throw new Error(`page did not reach Live (status=${status})`);

    const turns = [
      ['grok-research', 'research', 4],
      ['grok-coder', 'coding', 6],
      ['grok-voice', 'voice', 2],
      ['grok-planner', 'planning', 5],
      ['grok-dreamer', 'imagination', 7],
    ];
    for (const [agent, faculty, size] of turns) {
      const started = await postTurn('start', agent, faculty, size);
      await sleep(120);
      await postTurn('end', agent, faculty, size, started.turnId);
      await sleep(80);
    }

    const shown = Date.now();
    let liveTurns = '0';
    while (Date.now() - shown < 8000) {
      liveTurns = await evaluate(send, sessionId, `document.querySelector('#count-liveTurns').textContent`);
      status = await evaluate(send, sessionId, `document.querySelector('#status').dataset.state`);
      if (liveTurns === '5' && status === 'live') break;
      await sleep(100);
    }
    if (liveTurns !== '5' || status !== 'live') {
      throw new Error(`live updates did not arrive (status=${status}, liveTurns=${liveTurns})\n${logs}`);
    }

    await evaluate(send, sessionId, `
      document.getElementById('speak').checked = false;
      document.getElementById('ask').value = 'How many neurons are linked, and who fired last?';
      document.getElementById('talk-form').requestSubmit();
    `);
    const talkStart = Date.now();
    let reply = '';
    while (Date.now() - talkStart < 8000) {
      reply = await evaluate(send, sessionId, `Array.from(document.querySelectorAll('.dialogue .brain')).map(n => n.textContent).join(' ')`) || '';
      if (reply.includes('neurons')) break;
      await sleep(150);
    }
    if (!reply.includes('neurons')) throw new Error(`talk reply missing counts: ${reply}`);

    const settleStart = Date.now();
    while (Date.now() - settleStart < 8000) {
      const phase = await evaluate(send, sessionId, `document.getElementById('phase').dataset.phase`);
      const lit = await evaluate(send, sessionId, `document.querySelector('.dialogue .brain.lit') ? 'yes' : 'no'`);
      if (phase === 'idle' && lit === 'no') break;
      await sleep(80);
    }

    const full = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    }, sessionId);
    const fullPath = path.join(outDir, 'live-data.png');
    fs.writeFileSync(fullPath, Buffer.from(full.data, 'base64'));

    await evaluate(send, sessionId, `window.scrollTo(0, 0); document.getElementById('replay').click();`);
    const echoStart = Date.now();
    let phase = '';
    while (Date.now() - echoStart < 5000) {
      phase = await evaluate(send, sessionId, `document.getElementById('phase').dataset.phase`);
      if (phase === 'echo') break;
      await sleep(40);
    }
    if (phase !== 'echo') throw new Error(`echo did not start (phase=${phase})`);
    await sleep(900);
    const echo = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const echoPath = path.join(outDir, 'echo-in-flight.png');
    fs.writeFileSync(echoPath, Buffer.from(echo.data, 'base64'));

    const recent = await evaluate(send, sessionId, `document.querySelector('#recent').innerText`);
    console.log(`saved ${fullPath}`);
    console.log(`saved ${echoPath}`);
    console.log(`status=${status} liveTurns=${liveTurns}`);
    console.log(recent);
  } finally {
    stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
