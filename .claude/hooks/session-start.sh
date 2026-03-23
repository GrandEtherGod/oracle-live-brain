#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR}"

# Install Node.js dependencies if package.json exists
if [ -f "package.json" ]; then
  npm install
fi

# Persist session environment variables
echo 'export NODE_ENV="development"' >> "${CLAUDE_ENV_FILE}"
