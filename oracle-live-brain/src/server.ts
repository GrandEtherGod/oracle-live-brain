import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { anticipate, completeTurn, recordVoiceImpression, toSnapshot } from './brain';
import { rngFromString } from './rng';
import { loadOrSeed, resolveDataPath, saveState } from './store';
import { answerQuestion, dominantFaculty } from './talk';
import { BrainState, Snapshot } from './types';
import { parseTalkPayload, parseTurnPayload, safeEqual } from './validate';

interface OracleApp {
  app: express.Express;
  server: http.Server;
  dataFile: string;
  broadcast: (event: Record<string, unknown>) => void;
}

function ingestToken(): string {
  return (process.env.ORACLE_INGEST_TOKEN || '').trim();
}

function presentedToken(req: Request): string {
  const header = req.get('x-oracle-token');
  if (header) return header.trim();
  const authorization = req.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return '';
}

function requireIngest(req: Request, res: Response): boolean {
  const expected = ingestToken();
  if (!expected) {
    res.status(503).json({ error: 'Ingest is disabled. Set ORACLE_INGEST_TOKEN.' });
    return false;
  }
  const presented = presentedToken(req);
  if (!presented || !safeEqual(presented, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function makeLimiter(perMinute: number): (req: Request, res: Response, next: NextFunction) => void {
  const hits: number[] = [];
  return (_req, res, next) => {
    const now = Date.now();
    while (hits.length && hits[0] < now - 60_000) hits.shift();
    if (hits.length >= perMinute) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    hits.push(now);
    next();
  };
}

export function createApp(options?: { dataFile?: string }): OracleApp {
  const dataFile = options?.dataFile || resolveDataPath();
  const state: BrainState = loadOrSeed(dataFile);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Oracle-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { etag: true, maxAge: 0, index: false }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live', perMessageDeflate: false });

  const broadcast = (event: Record<string, unknown>): void => {
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  const persist = (): Snapshot => {
    saveState(dataFile, state);
    return toSnapshot(state);
  };

  app.get('/api/health', (_req, res) => {
    const snapshot = toSnapshot(state);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'oracle-live-brain',
      ...snapshot.counters,
    });
  });

  app.get('/api/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(toSnapshot(state));
  });

  app.post('/api/turns/start', makeLimiter(600), (req, res) => {
    if (!requireIngest(req, res)) return;
    const parsed = parseTurnPayload(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const timestamp = parsed.value.timestamp || new Date().toISOString();
    const rng = rngFromString(`start|${parsed.value.agent}|${parsed.value.faculty}|${timestamp}|${parsed.value.size}|${state.conversations.length}`);
    const turn = anticipate(state, { ...parsed.value, timestamp }, rng);
    const snapshot = persist();
    broadcast({
      type: 'anticipation',
      turnId: turn.turnId,
      agent: turn.agent,
      faculty: turn.faculty,
      size: turn.size,
      pathwayIds: turn.pathwayIds,
      snapshot,
    });
    console.log(`[oracle] turn start ${turn.agent} ${turn.faculty} size ${turn.size}`);
    res.json({
      ok: true,
      turnId: turn.turnId,
      agent: turn.agent,
      faculty: turn.faculty,
      size: turn.size,
      anticipatedPathwayIds: turn.pathwayIds,
    });
  });

  app.post('/api/turns/end', makeLimiter(600), (req, res) => {
    if (!requireIngest(req, res)) return;
    const parsed = parseTurnPayload(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const timestamp = parsed.value.timestamp || new Date().toISOString();
    const rng = rngFromString(
      `end|${parsed.value.agent}|${parsed.value.faculty}|${timestamp}|${parsed.value.size}|${parsed.value.turnId || ''}|${state.conversations.length}`,
    );
    const result = completeTurn(state, {
      agent: parsed.value.agent,
      faculty: parsed.value.faculty,
      size: parsed.value.size,
      timestamp,
      simulated: false,
      turnId: parsed.value.turnId,
    }, rng);
    const snapshot = persist();
    const conversation = result.conversation;
    broadcast({
      type: 'confirmation',
      pathwayIds: result.confirmationPathwayIds,
      agent: conversation.agent,
      faculty: conversation.faculty,
      size: conversation.size,
      index: conversation.index,
      snapshot,
    });
    broadcast({
      type: 'echo',
      pathwayIds: result.echoPathwayIds,
      agent: conversation.agent,
      faculty: conversation.faculty,
      fromIndex: conversation.index,
      toIndexes: conversation.echoReached,
      snapshot,
    });
    console.log(`[oracle] turn end ${conversation.agent} ${conversation.faculty} size ${conversation.size} #${conversation.index}`);
    res.json({
      ok: true,
      conversationIndex: conversation.index,
      agent: conversation.agent,
      faculty: conversation.faculty,
      size: conversation.size,
      timestamp: conversation.timestamp,
      confirmationPathwayIds: result.confirmationPathwayIds,
      echoPathwayIds: result.echoPathwayIds,
      counters: snapshot.counters,
    });
  });

  app.post('/api/talk', makeLimiter(60), async (req, res) => {
    const parsed = parseTalkPayload(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    // `parsed.message` lives only for this call. It is not written onto state.
    try {
      const answer = await answerQuestion(parsed.message, state);
      const faculty = dominantFaculty(answer.sentences);
      const impression = recordVoiceImpression(state, faculty, new Date().toISOString());
      const snapshot = persist();
      broadcast({ type: 'voice', faculty: impression.faculty, at: impression.at, snapshot });
      console.log(`[oracle] talk via ${answer.source}, faculty ${faculty}, ${answer.sentences.length} sentences`);
      res.json({
        sentences: answer.sentences,
        source: answer.source,
        stored: { faculty: impression.faculty, at: impression.at },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      console.error(`[oracle] talk failed: ${name}`);
      res.status(500).json({ error: 'The brain could not answer' });
    }
  });

  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((err: { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed' || err.status === 400) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    console.error('[oracle] request error');
    res.status(500).json({ error: 'Internal error' });
  });

  wss.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'hello', snapshot: toSnapshot(state) }));
    socket.on('message', (raw) => {
      try {
        const text = typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString('utf8')
              : Buffer.from(raw).toString('utf8');
        const msg = JSON.parse(text) as { type?: string };
        if (msg.type === 'pong') return;
      } catch {
        return;
      }
    });
    socket.on('error', () => {
      socket.close();
    });
  });

  const heartbeat = setInterval(() => {
    broadcast({ type: 'ping', t: Date.now() });
  }, 10000);
  heartbeat.unref();

  wss.on('close', () => clearInterval(heartbeat));

  return { app, server, dataFile, broadcast };
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || '4317', 10);
  const { server } = createApp();
  server.listen(port, '0.0.0.0', () => {
    console.log(`[oracle] http://0.0.0.0:${port}`);
  });
  const shutdown = (): void => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
