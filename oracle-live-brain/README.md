# Oracle Live Brain

A brain that grows with every agent turn and can talk about its own counts. Gold marks the live signal: anticipation before a turn fires, a flash when it confirms, and pulses that travel back into older pathways the new turn strengthens.

The first 144 conversations are simulated history. They seed the regions. Everything after that is a real turn from one of Axius's agents. A turn is an agent name, a faculty, a size, and a time. The words are never accepted and never stored.

## Run locally

From this folder:

```bash
npm install
cp .env.example .env
# put a long random string in ORACLE_INGEST_TOKEN
npm run dev
```

From the repository root, after dependencies are installed:

```bash
npm run brain:dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The status pill should leave **Connecting** and settle on **Live**. Counters are filled from `GET /api/state` as soon as HTTP answers, then the socket takes over. You should see 144 conversations, a full network, and zero live turns until an agent reports one.

`npm start` serves the compiled server (`npm run build` first). The dev script runs TypeScript directly.

## Why the original page stayed on Connecting

The page it was copied from waited on a socket that never opened, and it left every counter at its initial zero. This one does three things differently:

1. `GET /api/state` is uncached and paints the brain before the socket exists.
2. The socket sends a full snapshot in its first frame (`hello`), then heartbeats. The browser reconnects with backoff if the socket drops, and keeps polling HTTP while it is down.
3. The status pill says what is actually happening: **Connecting**, **Live**, **Reconnecting**, or **Polling**.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `ORACLE_INGEST_TOKEN` | yes, for ingest | Shared secret. Without it, `POST /api/turns/*` returns 503. The page still loads. |
| `PORT` | no | HTTP port. Default `4317`. The process binds `0.0.0.0`. |
| `ORACLE_DATA_PATH` | no | JSON file for the brain. Default `oracle-live-brain/data/state.json`. |
| `ORACLE_LLM_API_KEY` | no | Key for talk-to-the-brain. Falls back to `ANTHROPIC_API_KEY`. |
| `ORACLE_LLM_MODEL` | no | Anthropic model. Default `claude-3-5-haiku-20241022`. |
| `ORACLE_LLM_URL` | no | Custom endpoint. See below. |
| `ORACLE_BRAIN_URL` | clients | Base URL, no path. |
| `ORACLE_AGENT_NAME` | clients | Agent name sent with each turn. |

Copy `.env.example` to `.env`. Do not commit `.env`.

With no model key and no `ORACLE_LLM_URL`, talk-to-the-brain uses a fixed template filled with the live counters. The question is used only to choose which numbers to lead with, then discarded.

`ORACLE_LLM_URL`, when set, receives `POST` JSON:

```json
{ "question": "...", "system": "...", "state": { "counters": {}, "regions": [] } }
```

Return `{ "sentences": [{ "text": "...", "faculty": "memory" }] }`. `faculty` must be one of the names below. A bad response falls back to the template.

## Ingest API

Both calls require the token in `Authorization: Bearer <ORACLE_INGEST_TOKEN>` or `X-Oracle-Token`.

```http
POST /api/turns/start
Content-Type: application/json

{"agent":"grok-research","faculty":"research","size":3}
```

```http
POST /api/turns/end
Content-Type: application/json

{"agent":"grok-research","faculty":"research","size":3,"turnId":"turn-1"}
```

`timestamp` is optional ISO-8601. `turnId` belongs on the end call; the start response returns it. If you omit it, the end call closes that agent's latest open turn.

`size` is an integer from 1 to 10. `agent` is 1–48 characters: letters, digits, and `.` `_` `:` `-`.

Faculties: `memory`, `research`, `coding`, `voice`, `planning`, `emotion`, `attention`, `imagination`.

Any other field, and any nested field named like message content (`text`, `prompt`, `content`, `message`, and the rest of that list in `src/validate.ts`), is rejected with 400. The value is not logged.

Start does not move the counters. It broadcasts `anticipation`. End records the turn, grows the network, strengthens older pathways, and broadcasts `confirmation` then `echo`.

Other routes:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | no | Liveness and the five counters |
| GET | `/api/state` | no | Full snapshot for the page |
| GET | `/live` | no | WebSocket. First message is `{ "type": "hello", "snapshot": ... }` |
| POST | `/api/talk` | no | `{ "message": "..." }`. The message is not stored. The response is sentences tagged with a faculty. A voice impression keeps only that faculty and a time. |

## Agent clients

```bash
export ORACLE_BRAIN_URL=http://127.0.0.1:4317
export ORACLE_INGEST_TOKEN=your-token
export ORACLE_AGENT_NAME=grok-research

./client/post-turn.sh start research 3
./client/post-turn.sh end research 3

node client/post-turn.mjs start coding 4
node client/post-turn.mjs end coding 4
```

Both clients are dependency-free. They remember `turnId` between the two calls and they have no argument for text.

`client/AGENT_INSTRUCTIONS.md` is the note to install on each Grok Bot agent. It is self-contained: when to post, the exact requests, and the faculty list.

## Tests

```bash
npm test                  # from this folder: builds, boots, streams, posts a turn
npm run brain:test        # same script, from the repository root
npm test                  # from the repository root: unit tests plus the connection script
```

`node scripts/capture.mjs` opens the page in headless Chrome, when Chrome is installed, and writes screenshots. It is not part of the test suite.

The connection script checks all of the following:

- the server binds and `/api/health` reports 144 seeded conversations
- the WebSocket `hello` frame carries that same brain, not zeros
- a bad token is 401 and a body that includes text is 400
- a start event is pushed as anticipation, and the matching end confirms those pathways
- conversations, live turns, neurons, and pathways all increase
- a second socket, opened after the first closes, sees the updated counters
- a talk question is answered from the live neuron count and is absent from the state file

## Deploy on Render

This folder is its own Node service. Nothing else in the repo has to be deployed with it.

1. In Render, create a **Web Service** from this GitHub repo.
2. Set **Root Directory** to `oracle-live-brain`.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Health check path: `/api/health`
6. Add a persistent disk mounted at `/var/data` (a starter instance or above; the free instance disk is ephemeral and the brain will reseed on every restart).
7. Set `ORACLE_DATA_PATH` to `/var/data/state.json`.
8. Set `ORACLE_INGEST_TOKEN` to a long random string. Set `ORACLE_LLM_API_KEY` only if you want model replies instead of the template.

`render.yaml` in this folder is the same shape, for a Blueprint pointed at this directory. Do not put secrets in the file. Render will ask for the `sync: false` variables.

The public URL Render gives you is `ORACLE_BRAIN_URL` for the agents. The page is that URL with no path.

The process binds `0.0.0.0` and reads `PORT`, which Render sets.

## What is stored

`ORACLE_DATA_PATH` is one JSON file: neurons, pathways, weights, the 144 simulated conversations, live turns, open anticipations, and voice impressions. A live turn's record is agent, faculty, size, and time. A voice impression is faculty and time. Deleting the file reseeds the simulated history and drops the live turns.
