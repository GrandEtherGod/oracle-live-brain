#!/bin/sh
# Post a turn-start or turn-end to the Oracle Live Brain.
# Nothing but agent, faculty, size, and an optional turn id is sent.
#
#   ORACLE_BRAIN_URL=http://127.0.0.1:4317
#   ORACLE_INGEST_TOKEN=...
#   ORACLE_AGENT_NAME=grok-bot
#   ./post-turn.sh start coding 3
#   ./post-turn.sh end coding 3
set -eu

PHASE="${1:?usage: post-turn.sh start|end FACULTY [SIZE]}"
FACULTY="${2:?faculty required (memory research coding voice planning emotion attention imagination)}"
SIZE="${3:-2}"

if [ -z "${ORACLE_BRAIN_URL:-}" ]; then
  echo "ORACLE_BRAIN_URL is not set" >&2
  exit 2
fi
if [ -z "${ORACLE_INGEST_TOKEN:-}" ]; then
  echo "ORACLE_INGEST_TOKEN is not set" >&2
  exit 2
fi

AGENT="${ORACLE_AGENT_NAME:-grok-bot}"
case "$PHASE" in
  start|end) ;;
  *) echo "phase must be start or end" >&2; exit 2 ;;
esac
case "$FACULTY" in
  memory|research|coding|voice|planning|emotion|attention|imagination) ;;
  *) echo "unknown faculty: $FACULTY" >&2; exit 2 ;;
esac
case "$SIZE" in
  ''|*[!0-9]*) echo "size must be an integer from 1 to 10" >&2; exit 2 ;;
esac
if [ "$SIZE" -lt 1 ] || [ "$SIZE" -gt 10 ]; then
  echo "size must be an integer from 1 to 10" >&2
  exit 2
fi
printf '%s' "$AGENT" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$' || {
  echo "ORACLE_AGENT_NAME has unsupported characters" >&2
  exit 2
}

BASE="${ORACLE_BRAIN_URL%/}"
TURN_FILE="${TMPDIR:-/tmp}/oracle-brain-${AGENT}.turn"
BODY="{\"agent\":\"${AGENT}\",\"faculty\":\"${FACULTY}\",\"size\":${SIZE}"
if [ "$PHASE" = "end" ] && [ -f "$TURN_FILE" ]; then
  TURN_ID=$(tr -cd 'A-Za-z0-9-' < "$TURN_FILE" | head -c 20)
  case "$TURN_ID" in
    turn-[0-9]*) BODY="${BODY},\"turnId\":\"${TURN_ID}\"" ;;
  esac
fi
BODY="${BODY}}"

TMP=$(mktemp)
CODE=$(curl -sS -o "$TMP" -w '%{http_code}' \
  -X POST "${BASE}/api/turns/${PHASE}" \
  -H "Authorization: Bearer ${ORACLE_INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY") || {
  rm -f "$TMP"
  exit 1
}
cat "$TMP"
echo
if [ "$CODE" -ge 400 ]; then
  rm -f "$TMP"
  exit 1
fi
if [ "$PHASE" = "start" ]; then
  ID=$(sed -n 's/.*"turnId":"\(turn-[0-9][0-9]*\)".*/\1/p' "$TMP" | head -n 1)
  if [ -n "$ID" ]; then
    printf '%s' "$ID" > "$TURN_FILE"
  fi
fi
if [ "$PHASE" = "end" ]; then
  rm -f "$TURN_FILE"
fi
rm -f "$TMP"
