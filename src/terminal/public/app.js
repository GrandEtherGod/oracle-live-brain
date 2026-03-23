/* global Terminal, FitAddon */

'use strict';

// ─── Terminal Setup ───────────────────────────────────────────────────────────

const term = new Terminal({
  theme: {
    background: '#000000',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    selectionBackground: 'rgba(88,166,255,0.3)',
    black: '#0d1117',
    red: '#f85149',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#a371f7',
    cyan: '#39c5cf',
    white: '#c9d1d9',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
  fontSize: 14,
  lineHeight: 1.4,
  cursorBlink: true,
  scrollback: 5000,
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

window.addEventListener('resize', () => fitAddon.fit());

// Forward terminal resize to server
term.onResize(({ cols, rows }) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    send({ type: 'resize', cols, rows });
  }
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const WS_URL = `ws://${location.host}`;
let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    hideBanner();
    term.writeln('\x1b[32m✓ Connected to AetherLink terminal server\x1b[0m');
    term.writeln('\x1b[36mPress Space or click 🎤 to start voice input\x1b[0m\r\n');
    send({ type: 'resize', cols: term.cols, rows: term.rows });
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    showBanner();
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => { ws.close(); };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'output':
      term.write(msg.data);
      break;
    case 'ai_response':
      showAiResponse(msg.text);
      speak(msg.text);
      break;
    case 'error':
      term.writeln(`\x1b[31m[Error] ${msg.message}\x1b[0m`);
      break;
    case 'status':
      term.writeln(`\x1b[33m${msg.message}\x1b[0m`);
      break;
    case 'pong':
      // heartbeat acknowledged
      break;
  }
}

// ─── Voice Input (Web Speech API) ────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

const btnMic = document.getElementById('btn-mic');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const transcriptBar = document.getElementById('transcript-bar');
const transcriptLabel = document.getElementById('transcript-label');
const transcriptTextEl = document.getElementById('transcript-text');

if (!SpeechRecognition) {
  btnMic.disabled = true;
  btnMic.title = 'Speech recognition not supported — use Chrome or Edge';
  transcriptTextEl.textContent = 'Voice input requires Chrome or Edge. Use keyboard input.';
} else {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    btnMic.classList.add('active');
    statusDot.classList.add('listening');
    statusText.textContent = 'Listening…';
    transcriptLabel.style.display = '';
    transcriptTextEl.textContent = '';
    transcriptBar.classList.add('has-text');
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    transcriptTextEl.textContent = final || interim;

    if (final) {
      send({ type: 'voice_input', text: final.trim() });
      setStatus('processing');
    }
  };

  recognition.onerror = (event) => {
    console.warn('[voice] recognition error:', event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

function startListening() {
  if (!recognition || isListening) return;
  try {
    recognition.start();
  } catch (e) {
    console.warn('[voice] start failed:', e);
  }
}

function stopListening() {
  isListening = false;
  btnMic.classList.remove('active');
  statusDot.classList.remove('listening', 'processing');
  statusText.textContent = 'Ready';
}

function setStatus(state) {
  statusDot.classList.remove('listening', 'processing');
  statusDot.classList.add(state);
  statusText.textContent = state === 'processing' ? 'Processing…' : 'Listening…';
}

btnMic.addEventListener('click', () => {
  if (isListening) {
    recognition && recognition.stop();
  } else {
    startListening();
  }
});

// Space bar shortcut (when terminal is not focused)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    if (isListening) recognition && recognition.stop();
    else startListening();
  }
});

// ─── Text-to-Speech Output ────────────────────────────────────────────────────

const synth = window.speechSynthesis;
let ttsEnabled = true;

function speak(text) {
  if (!ttsEnabled || !synth || !text) return;
  // Strip ANSI-ish prefix markers before speaking
  const clean = text.replace(/^\[.*?\]\s*/, '');
  if (!clean) return;
  synth.cancel(); // cancel any ongoing speech
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate = 1.05;
  utt.pitch = 1.0;
  synth.speak(utt);
}

// ─── AI Response Bar ──────────────────────────────────────────────────────────

const aiResponseBar = document.getElementById('ai-response-bar');
const aiResponseText = document.getElementById('ai-response-text');
let aiResponseTimer = null;

function showAiResponse(text) {
  if (!text) return;
  aiResponseText.textContent = text.replace(/^\[.*?\]\s*/, '');
  aiResponseBar.classList.add('visible');
  clearTimeout(aiResponseTimer);
  aiResponseTimer = setTimeout(() => {
    aiResponseBar.classList.remove('visible');
    setStatus('ready');
    statusDot.classList.remove('processing');
    statusText.textContent = 'Ready';
  }, 6000);
}

// ─── Connection Banner ────────────────────────────────────────────────────────

const connectionBanner = document.getElementById('connection-banner');

function showBanner() { connectionBanner.classList.add('visible'); }
function hideBanner() { connectionBanner.classList.remove('visible'); }

// ─── Keyboard passthrough to PTY ─────────────────────────────────────────────

term.onData((data) => {
  send({ type: 'command', text: data });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

connect();
