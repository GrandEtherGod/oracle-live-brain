(() => {
  const REGION_COLOR = {
    planning: '#d9c7a6',
    voice: '#e4b15a',
    coding: '#c5d2c4',
    attention: '#e6d3a4',
    emotion: '#e2a598',
    memory: '#b7c5d8',
    research: '#d1be90',
    imagination: '#d7b7c9',
  };
  const STAGE_FILL = {
    germination: 'rgba(120, 104, 78, 0.28)',
    differentiation: 'rgba(150, 120, 70, 0.22)',
    integration: 'rgba(180, 140, 60, 0.18)',
    echo: 'rgba(228, 177, 90, 0.16)',
    live: 'rgba(228, 177, 90, 0.32)',
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const state = {
    snapshot: null,
    knownLive: null,
    socket: null,
    socketOpen: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
    phase: 'idle',
    phaseUntil: 0,
    anticipationIds: new Set(),
    confirmationIds: new Set(),
    echoPulses: [],
    queuedEcho: null,
    litFaculty: null,
    banner: '',
  };

  const $ = (id) => document.getElementById(id);

  function agentColor(name) {
    let hash = 0;
    const label = name || 'seed';
    for (const ch of label) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 42% 64%)`;
  }

  function ago(iso) {
    const delta = Date.now() - Date.parse(iso);
    if (!Number.isFinite(delta)) return '';
    if (delta < 15000) return 'just now';
    if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function setStatus(kind, detail) {
    const node = $('status');
    node.dataset.state = kind;
    const labels = {
      connecting: 'Connecting',
      live: 'Live',
      reconnecting: 'Reconnecting',
      polling: 'Polling',
    };
    node.querySelector('.label').textContent = labels[kind] || kind;
    $('status-detail').textContent = detail;
  }

  function setBadge(phase, label) {
    const node = $('phase');
    node.dataset.phase = phase;
    node.textContent = label;
  }

  function setBanner(text) {
    state.banner = text || '';
    $('banner').textContent = state.banner;
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function renderDom(snap) {
    const counters = snap.counters;
    for (const key of ['conversations', 'liveTurns', 'neurons', 'pathways', 'pathwaysStrengthenedByEcho']) {
      const el = $(`count-${key}`);
      const next = String(counters[key]);
      if (el.textContent !== '—' && el.textContent !== next) {
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 700);
      }
      el.textContent = next;
    }
    renderPending(snap.inProgress || []);
    renderTimeline(snap.timeline || [], snap.latestEcho);
    drawGrowth($('growth'), snap.growth || []);
    drawFired($('fired'), snap.fired || []);
    renderStages(snap.stages || []);
    renderRegions(snap.regions || []);
    renderRecent(snap.recentLiveTurns || []);
    renderImpressions(snap.voiceImpressions || []);
    $('replay').disabled = !snap.latestEcho;
  }

  function renderPending(list) {
    const el = $('pending');
    el.replaceChildren();
    if (!list.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    for (const turn of list) {
      const chip = document.createElement('span');
      chip.textContent = `${turn.agent} · ${turn.faculty} · anticipating`;
      el.appendChild(chip);
    }
  }

  function renderStages(stages) {
    const row = $('stages');
    row.replaceChildren();
    for (const stage of stages) {
      const card = document.createElement('div');
      card.className = 'stage';
      const name = document.createElement('strong');
      name.textContent = stage.stage;
      const detail = document.createElement('span');
      detail.textContent = `${stage.conversations} · ${stage.neurons} neurons · ${stage.pathways} pathways`;
      card.append(name, detail);
      row.appendChild(card);
    }
  }

  function renderRegions(regions) {
    const body = $('region-rows');
    body.replaceChildren();
    for (const region of regions) {
      const tr = document.createElement('tr');
      const values = [region.name, region.where, region.neurons, region.internal, region.bridges, region.activations];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 0) {
          const swatch = document.createElement('span');
          swatch.className = 'swatch';
          swatch.style.background = REGION_COLOR[region.id] || '#e4b15a';
          td.appendChild(swatch);
        }
        td.append(document.createTextNode(String(value)));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  }

  function renderRecent(turns) {
    const list = $('recent');
    list.replaceChildren();
    if (!turns.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No live turn yet. The seed is in place; agents have not reported.';
      list.appendChild(li);
      return;
    }
    for (const turn of turns) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.background = agentColor(turn.agent);
      const main = document.createElement('span');
      main.textContent = `${turn.agent} · ${turn.faculty} · size ${turn.size}`;
      const time = document.createElement('time');
      time.dateTime = turn.timestamp;
      time.textContent = ago(turn.timestamp);
      li.append(dot, main, time);
      list.appendChild(li);
    }
  }

  function renderImpressions(list) {
    const last = list[list.length - 1];
    $('impressions').textContent = last
      ? `Last voice touched ${last.faculty} · ${ago(last.at)}. The words were not kept.`
      : 'Words you type are not kept. Only a faculty and a time.';
  }

  function renderTimeline(timeline, echo) {
    const svg = $('timeline-svg');
    svg.replaceChildren();
    const gap = 7;
    const width = Math.max(timeline.length * gap + 24, 320);
    const height = 100;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    const yBase = 86;
    timeline.forEach((tick, i) => {
      const bar = tick.simulated ? 16 : 48;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(8 + i * gap));
      rect.setAttribute('y', String(yBase - bar));
      rect.setAttribute('width', tick.simulated ? '3' : '4.5');
      rect.setAttribute('height', String(bar));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', tick.simulated ? '#5c564c' : '#e4b15a');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = tick.simulated
        ? `Simulated ${tick.index} · ${tick.faculty}`
        : `Live ${tick.index} · ${tick.agent} · ${tick.faculty}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });
    if (echo && echo.toIndexes) {
      const x1 = 8 + (echo.fromIndex - 1) * gap + 2;
      for (const to of echo.toIndexes) {
        const x0 = 8 + (to - 1) * gap + 2;
        const mid = (x0 + x1) / 2;
        const lift = Math.min(68, 16 + Math.abs(x1 - x0) * 0.12);
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${x1} ${yBase - 50} Q ${mid} ${yBase - 50 - lift} ${x0} ${yBase - 18}`);
        path.setAttribute('class', 'arc');
        svg.appendChild(path);
      }
    }
    const scroller = $('timeline-scroll');
    scroller.scrollLeft = scroller.scrollWidth;
  }

  function fit(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawGrowth(canvas, growth) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!growth.length) return;
    const padL = 46;
    const padR = 10;
    const padT = 16;
    const padB = 22;
    const maxY = Math.max(...growth.map((row) => Math.max(row.neurons, row.pathways)), 1) * 1.08;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const xAt = (index) => padL + ((index - 1) / Math.max(1, growth[growth.length - 1].index - 1)) * innerW;
    const yAt = (value) => padT + innerH - (value / maxY) * innerH;
    let start = 0;
    for (let i = 1; i <= growth.length; i += 1) {
      if (i === growth.length || growth[i].stage !== growth[start].stage) {
        const a = xAt(growth[start].index);
        const b = i === growth.length ? padL + innerW : xAt(growth[i].index);
        ctx.fillStyle = STAGE_FILL[growth[start].stage] || 'transparent';
        ctx.fillRect(a, padT, Math.max(1, b - a), innerH);
        if (b - a > 54) {
          ctx.fillStyle = '#9a8f7d';
          ctx.font = '12px Palatino, Georgia, serif';
          ctx.fillText(growth[start].stage, a + 6, padT + 14);
        }
        start = i;
      }
    }
    const stroke = (key, color) => {
      ctx.beginPath();
      growth.forEach((row, index) => {
        const x = xAt(row.index);
        const y = yAt(row[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    };
    stroke('pathways', '#e4b15a');
    stroke('neurons', '#efe6d6');
    ctx.fillStyle = '#9a8f7d';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(Math.round(maxY)), 4, padT + 10);
    ctx.fillText('0', 4, padT + innerH);
  }

  function drawFired(canvas, fired) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!fired.length) return;
    const padL = 36;
    const padR = 8;
    const padT = 12;
    const padB = 18;
    const maxY = Math.max(...fired.map((row) => row.internal + row.bridge), 1);
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const barW = innerW / fired.length;
    fired.forEach((row, index) => {
      const x = padL + index * barW;
      const internalH = (row.internal / maxY) * innerH;
      const bridgeH = (row.bridge / maxY) * innerH;
      const base = padT + innerH;
      ctx.globalAlpha = row.simulated ? 0.55 : 1;
      ctx.fillStyle = '#6d6458';
      ctx.fillRect(x, base - internalH, Math.max(1, barW - 0.6), internalH);
      ctx.fillStyle = '#e4b15a';
      ctx.fillRect(x, base - internalH - bridgeH, Math.max(1, barW - 0.6), bridgeH);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = '#9a8f7d';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(maxY), 4, padT + 10);
  }

  function traceBrain(ctx, w, h) {
    const x = (n) => n * w;
    const y = (n) => n * h;
    ctx.beginPath();
    ctx.moveTo(x(0.20), y(0.58));
    ctx.bezierCurveTo(x(0.15), y(0.44), x(0.16), y(0.28), x(0.28), y(0.16));
    ctx.bezierCurveTo(x(0.40), y(0.07), x(0.55), y(0.06), x(0.68), y(0.12));
    ctx.bezierCurveTo(x(0.82), y(0.18), x(0.92), y(0.32), x(0.915), y(0.46));
    ctx.bezierCurveTo(x(0.93), y(0.58), x(0.86), y(0.66), x(0.78), y(0.68));
    ctx.bezierCurveTo(x(0.86), y(0.80), x(0.74), y(0.90), x(0.62), y(0.80));
    ctx.bezierCurveTo(x(0.50), y(0.92), x(0.34), y(0.86), x(0.27), y(0.74));
    ctx.bezierCurveTo(x(0.18), y(0.68), x(0.15), y(0.64), x(0.20), y(0.58));
    ctx.closePath();
  }

  function neuronById(snap) {
    const map = new Map();
    for (const neuron of snap.neurons) map.set(neuron.id, neuron);
    return map;
  }

  function pointOf(neuron, w, h) {
    return { x: neuron.x * w, y: neuron.y * h };
  }

  function curve(ctx, a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(36, len * 0.22);
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx + (-dy / len) * bow, my + (dx / len) * bow, b.x, b.y);
  }

  function regionCenter(faculty, w, h) {
    const region = (state.snapshot.regions || []).find((item) => item.id === faculty);
    if (!region) return { x: w * 0.5, y: h * 0.5 };
    return { x: region.x * w, y: region.y * h };
  }

  function pathwayMid(pathway, neurons, w, h) {
    const from = neurons.get(pathway.from);
    const to = neurons.get(pathway.to);
    if (!from || !to) return null;
    const a = pointOf(from, w, h);
    const b = pointOf(to, w, h);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function drawBrain(now) {
    const canvas = $('brain');
    const snap = state.snapshot;
    if (!snap) return;
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    const neurons = neuronById(snap);
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);

    traceBrain(ctx, w, h);
    ctx.fillStyle = '#1a1612';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(90, 74, 52, 0.45)';
    ctx.lineWidth = 1;
    [[0.30, 0.34, 0.42, 0.28, 0.50, 0.36], [0.40, 0.50, 0.55, 0.58, 0.66, 0.48], [0.48, 0.30, 0.62, 0.26, 0.70, 0.40]].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s[0] * w, s[1] * h);
      ctx.quadraticCurveTo(s[2] * w, s[3] * h, s[4] * w, s[5] * h);
      ctx.stroke();
    });

    for (const pathway of snap.pathways) {
      const from = neurons.get(pathway.from);
      const to = neurons.get(pathway.to);
      if (!from || !to) continue;
      const hotAnticipation = state.phase === 'anticipation' && state.anticipationIds.has(pathway.id);
      const hotConfirm = state.phase === 'confirmation' && state.confirmationIds.has(pathway.id);
      const dim = state.phase === 'confirmation' && !hotConfirm;
      ctx.beginPath();
      curve(ctx, pointOf(from, w, h), pointOf(to, w, h));
      ctx.shadowBlur = 0;
      if (hotAnticipation) {
        ctx.strokeStyle = `rgba(228, 177, 90, ${0.45 + pulse * 0.5})`;
        ctx.lineWidth = 1.3 + pulse * 1.1;
        ctx.shadowColor = '#e4b15a';
        ctx.shadowBlur = 14 * pulse;
      } else if (hotConfirm) {
        ctx.strokeStyle = '#fff6dc';
        ctx.lineWidth = 2.3;
        ctx.shadowColor = '#ffe1a3';
        ctx.shadowBlur = 16;
      } else {
        const alpha = dim ? 0.05 : 0.12 + Math.min(pathway.weight, 6) / 18 + (pathway.echoCount ? 0.08 : 0);
        ctx.strokeStyle = pathway.echoCount ? `rgba(228, 177, 90, ${alpha})` : `rgba(180, 164, 140, ${alpha})`;
        ctx.lineWidth = pathway.kind === 'bridge' ? 1.05 : 0.7;
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (const neuron of snap.neurons) {
      const p = pointOf(neuron, w, h);
      const lit = state.litFaculty === neuron.region;
      const radius = lit ? 3.4 : 2.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = lit ? '#ffe1a3' : (REGION_COLOR[neuron.region] || '#efe6d6');
      ctx.globalAlpha = state.phase === 'confirmation' ? 0.55 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (neuron.agent) {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = agentColor(neuron.agent);
        ctx.stroke();
      }
    }

    if (state.litFaculty) {
      const center = regionCenter(state.litFaculty, w, h);
      ctx.beginPath();
      ctx.setLineDash([4, 5]);
      ctx.arc(center.x, center.y, 34 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 225, 163, ${0.45 + pulse * 0.4})`;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    traceBrain(ctx, w, h);
    ctx.strokeStyle = 'rgba(228, 177, 90, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.font = '13px Palatino, Georgia, serif';
    ctx.textAlign = 'center';
    for (const region of snap.regions) {
      ctx.fillStyle = state.litFaculty === region.id ? '#ffe1a3' : 'rgba(239, 230, 214, 0.72)';
      ctx.fillText(region.name, region.x * w, region.y * h - 18);
    }

    for (const item of state.echoPulses) {
      if (now < item.start || now > item.end) continue;
      const t = (now - item.start) / (item.end - item.start);
      const x = item.from.x + (item.to.x - item.from.x) * t;
      const y = item.from.y + (item.to.y - item.from.y) * t;
      const trail = Math.max(0, t - 0.38);
      const tx = item.from.x + (item.to.x - item.from.x) * trail;
      const ty = item.from.y + (item.to.y - item.from.y) * trail;
      ctx.strokeStyle = 'rgba(228, 177, 90, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 28);
      glow.addColorStop(0, 'rgba(255, 248, 230, 1)');
      glow.addColorStop(0.35, 'rgba(228, 177, 90, 0.9)');
      glow.addColorStop(1, 'rgba(228, 177, 90, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6dc';
      ctx.fill();
    }
  }

  function finishPhase() {
    state.phase = 'idle';
    state.confirmationIds = new Set();
    state.echoPulses = [];
    state.queuedEcho = null;
    setBadge('idle', 'At rest');
    if (state.snapshot && state.snapshot.inProgress && state.snapshot.inProgress.length) {
      const latest = state.snapshot.inProgress[state.snapshot.inProgress.length - 1];
      state.phase = 'anticipation';
      state.anticipationIds = new Set(latest.pathwayIds);
      setBanner(`${latest.agent} · ${latest.faculty}`);
      setBadge('anticipation', 'Anticipation');
    }
  }

  function startEcho(msg) {
    const snap = state.snapshot;
    if (!snap) return;
    state.queuedEcho = null;
    state.phase = 'echo';
    setBadge('echo', 'Echo');
    setBanner(msg.agent ? `${msg.agent} · ${msg.faculty}` : (msg.faculty || ''));
    const canvas = $('brain');
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const neurons = neuronById(snap);
    const from = regionCenter(msg.faculty, w, h);
    const now = performance.now();
    const byId = new Map(snap.pathways.map((pathway) => [pathway.id, pathway]));
    state.echoPulses = (msg.pathwayIds || []).map((id, index) => {
      const pathway = byId.get(id);
      const mid = pathway ? pathwayMid(pathway, neurons, w, h) : null;
      return {
        pathwayId: id,
        from,
        to: mid || { x: from.x - 80 - index * 12, y: from.y + 30 },
        start: now + index * 260,
        end: now + index * 260 + 2400,
      };
    });
    const last = state.echoPulses[state.echoPulses.length - 1];
    state.phaseUntil = last ? last.end : now + 800;
  }

  function onAnticipation(msg) {
    state.phase = 'anticipation';
    state.anticipationIds = new Set(msg.pathwayIds || []);
    state.confirmationIds = new Set();
    setBanner(`${msg.agent} · ${msg.faculty}`);
    setBadge('anticipation', 'Anticipation');
    apply(msg.snapshot, { fromEvent: true });
  }

  function onConfirmation(msg) {
    state.phase = 'confirmation';
    state.confirmationIds = new Set(msg.pathwayIds || []);
    state.anticipationIds = new Set();
    state.phaseUntil = performance.now() + 680;
    setBanner(msg.agent ? `${msg.agent} · ${msg.faculty}` : '');
    setBadge('confirmation', 'Confirmation');
    apply(msg.snapshot, { fromEvent: true });
  }

  function onEcho(msg) {
    state.queuedEcho = msg;
    if (state.phase !== 'confirmation') startEcho(msg);
  }

  function replay() {
    const snap = state.snapshot;
    if (!snap || !snap.latestEcho) return;
    onConfirmation({
      pathwayIds: (snap.latestActivation && snap.latestActivation.pathwayIds) || [],
      agent: snap.latestEcho.agent,
      faculty: snap.latestEcho.faculty,
      snapshot: snap,
    });
    onEcho({
      pathwayIds: snap.latestEcho.pathwayIds,
      faculty: snap.latestEcho.faculty,
      agent: snap.latestEcho.agent,
      snapshot: snap,
    });
  }

  function apply(snap, options = {}) {
    const prevLive = state.knownLive;
    state.snapshot = snap;
    renderDom(snap);
    state.knownLive = snap.counters.liveTurns;
    const grew = prevLive !== null && snap.counters.liveTurns > prevLive;
    if (!options.fromEvent && state.phase === 'idle') {
      const pending = snap.inProgress || [];
      if (pending.length) {
        const latest = pending[pending.length - 1];
        state.phase = 'anticipation';
        state.anticipationIds = new Set(latest.pathwayIds);
        setBanner(`${latest.agent} · ${latest.faculty}`);
        setBadge('anticipation', 'Anticipation');
      }
    }
    if (!options.fromEvent && grew && state.phase === 'idle' && !state.socketOpen) replay();
  }

  function describeLink() {
    const when = state.snapshot ? `Updated ${ago(state.snapshot.generatedAt)}` : 'No state yet';
    if (state.socketOpen) setStatus('live', `Socket open · ${when}`);
    else if (!state.snapshot) setStatus('connecting', 'Waiting for the server');
    else if (state.reconnectAttempt >= 2) setStatus('polling', `Socket down. Refreshing over HTTP · ${when}`);
    else if (state.reconnectAttempt > 0) setStatus('reconnecting', `Opening the socket again · ${when}`);
    else setStatus('connecting', `State loaded. Opening the live socket · ${when}`);
  }

  function connectSocket() {
    if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    try {
      socket = new WebSocket(`${proto}//${location.host}/live`);
    } catch {
      scheduleReconnect();
      return;
    }
    state.socket = socket;
    socket.addEventListener('open', () => {
      state.socketOpen = true;
      state.reconnectAttempt = 0;
      describeLink();
    });
    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ping') {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (msg.type === 'hello' || msg.type === 'voice') {
        apply(msg.snapshot);
        describeLink();
        return;
      }
      if (msg.type === 'anticipation') onAnticipation(msg);
      else if (msg.type === 'confirmation') onConfirmation(msg);
      else if (msg.type === 'echo') onEcho(msg);
      describeLink();
    });
    socket.addEventListener('close', () => {
      state.socketOpen = false;
      scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  function scheduleReconnect() {
    state.socketOpen = false;
    state.reconnectAttempt += 1;
    describeLink();
    const delay = Math.min(8000, 400 * (2 ** Math.min(state.reconnectAttempt, 5)));
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connectSocket, delay);
    refresh().catch(() => {});
  }

  async function refresh() {
    try {
      const snap = await getJson('/api/state');
      if (state.phase === 'idle' || state.phase === 'anticipation') apply(snap);
      describeLink();
    } catch {
      if (!state.snapshot) setStatus('connecting', 'Server not reachable, retrying');
    }
  }

  async function boot() {
    setStatus('connecting', 'Fetching the brain');
    try {
      apply(await getJson('/api/state'));
    } catch {
      setStatus('connecting', 'Server not reachable, retrying');
    }
    describeLink();
    connectSocket();
  }

  function appendParagraph(className, text, small) {
    const p = document.createElement('p');
    p.className = className;
    if (small) {
      const note = document.createElement('small');
      note.textContent = small;
      p.appendChild(note);
    }
    p.append(document.createTextNode(text));
    $('dialogue').appendChild(p);
    p.scrollIntoView({ block: 'nearest' });
    return p;
  }

  function speakSentences(sentences) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      let index = 0;
      const step = () => {
        if (index >= sentences.length) {
          state.litFaculty = null;
          resolve();
          return;
        }
        const sentence = sentences[index];
        index += 1;
        const node = appendParagraph('brain', sentence.text);
        state.litFaculty = sentence.faculty;
        const speakOn = $('speak').checked && window.speechSynthesis;
        if (!speakOn) {
          node.classList.add('lit');
          setTimeout(() => {
            node.classList.remove('lit');
            step();
          }, 1300);
          return;
        }
        let moved = false;
        const done = () => {
          if (moved) return;
          moved = true;
          clearTimeout(guard);
          node.classList.remove('lit');
          step();
        };
        const utter = new SpeechSynthesisUtterance(sentence.text);
        utter.rate = 0.96;
        utter.onstart = () => node.classList.add('lit');
        utter.onend = done;
        utter.onerror = done;
        const guard = setTimeout(done, Math.min(12000, 1600 + sentence.text.length * 40));
        window.speechSynthesis.speak(utter);
      };
      step();
    });
  }

  $('talk-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('ask');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    appendParagraph('human', message, 'Not recorded');
    const button = $('ask-btn');
    button.disabled = true;
    try {
      const response = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The brain did not answer');
      await speakSentences(data.sentences || []);
    } catch (err) {
      appendParagraph('human', err instanceof Error ? err.message : 'The brain did not answer');
    } finally {
      button.disabled = false;
    }
  });

  $('ask').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('talk-form').requestSubmit();
    }
  });

  $('speak').addEventListener('change', () => {
    if (!$('speak').checked && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  $('replay').addEventListener('click', () => replay());

  function frame(now) {
    if (state.phase === 'confirmation' && now > state.phaseUntil) {
      if (state.queuedEcho) startEcho(state.queuedEcho);
      else finishPhase();
    } else if (state.phase === 'echo' && now > state.phaseUntil + 240) {
      finishPhase();
    }
    drawBrain(now);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    if (!state.snapshot) return;
    drawGrowth($('growth'), state.snapshot.growth || []);
    drawFired($('fired'), state.snapshot.fired || []);
  });

  setInterval(() => {
    if (!state.socketOpen || state.phase === 'idle') refresh().catch(() => {});
  }, 4000);

  requestAnimationFrame(frame);
  boot();
})();
