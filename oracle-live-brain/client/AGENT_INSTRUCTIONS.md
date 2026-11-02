# Oracle Live Brain — turn reporting

Report each substantive turn to the Oracle Live Brain. Never send the content of the turn.

The brain is a shared picture of which faculty was working, how large the turn was, and when. It is not a log of what was said.

## When

- At the **start** of a substantive turn, post a turn-start event. That lights anticipation: likely pathways glow before anything fires.
- At the **end** of that same turn, post a turn-end event. That confirms the pathways and sends the echo back into older ones.

Skip empty chatter, pure acknowledgements, and turns where you did no work.

If the brain is unreachable, continue the turn. Reporting is not a gate. Do not retry with the turn's text added to the body.

## What you may send

Only these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `agent` | yes | Your stable name. Use `ORACLE_AGENT_NAME` when it is set. |
| `faculty` | yes | The faculty that best fits the turn. One of the names below. |
| `size` | yes | Integer from 1 (a small turn) to 10 (a large one). |
| `timestamp` | no | ISO-8601 time. Omit it and the server uses its own clock. |
| `turnId` | no | On the end event only. The id returned by start. |

Do not send the user's words, your reply, tool output, file contents, prompts, secrets, or any other text. The server rejects a body that carries those fields.

## Environment

- `ORACLE_BRAIN_URL` — base URL of the brain, with no path on the end. Example: `https://oracle-live-brain.example.com`
- `ORACLE_INGEST_TOKEN` — the shared secret. Send it as `Authorization: Bearer <token>`.
- `ORACLE_AGENT_NAME` — your agent name. Example: `grok-research`

## Requests

Start:

```http
POST /api/turns/start
Authorization: Bearer <ORACLE_INGEST_TOKEN>
Content-Type: application/json

{"agent":"<ORACLE_AGENT_NAME>","faculty":"coding","size":3}
```

The response includes `turnId`. Hold that id until the turn ends.

End:

```http
POST /api/turns/end
Authorization: Bearer <ORACLE_INGEST_TOKEN>
Content-Type: application/json

{"agent":"<ORACLE_AGENT_NAME>","faculty":"coding","size":3,"turnId":"<id from start>"}
```

Use the same faculty and size on both calls unless the turn clearly changed character while it ran. If you cannot keep `turnId`, send the end event with the same agent name. The server closes that agent's latest open turn.

## Faculty guide

Pick one. If a turn spans two, pick the one that did most of the work.

- `memory` — recall, history, prior decisions
- `research` — looking things up, reading, comparing sources
- `coding` — writing or changing code, running builds and tests
- `voice` — speaking, conversation, wording
- `planning` — sequencing work, choosing an approach
- `emotion` — tone, care, reassurance, conflict
- `attention` — triage, focusing, filtering what matters
- `imagination` — design, naming, metaphor, new options

## Size guide

- 1–2 — a short lookup, a small edit, a brief answer
- 3–5 — a normal working turn
- 6–8 — a long investigation or a wide code change
- 9–10 — a rare, very large turn

## Helpers

If the shell or Node helper is available, use it instead of building the request yourself. Both read the environment variables above and remember `turnId` between the start and end calls. They do not accept a text argument.

```sh
post-turn.sh start coding 3
post-turn.sh end coding 3
```

```sh
node post-turn.mjs start research 2
node post-turn.mjs end research 2
```

## What the brain keeps

A live turn is stored as the agent name, the faculty, the size, and the time, plus the pathways that fired. The page can talk, and even then it keeps only the faculty that the reply drew on, and a time. It does not keep the question.
