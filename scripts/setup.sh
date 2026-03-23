#!/bin/bash
set -euo pipefail

echo "==> AetherLinkOS / Theia Engine — environment bootstrap"

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed. Install it via nvm or https://nodejs.org" >&2
  exit 1
fi

echo "  Node: $(node --version)"
echo "  npm:  $(npm --version)"

# Install dependencies
echo "==> Installing npm dependencies..."
npm install

# Create .env from template if it doesn't exist
if [ ! -f ".env" ]; then
  cat > .env <<'EOF'
# AetherLinkOS environment variables
# Copy this to .env and fill in your values

ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
EOF
  echo "==> Created .env — add your ANTHROPIC_API_KEY before running the terminal"
fi

echo ""
echo "==> Setup complete!"
echo "    Run 'npm run terminal' to start the voice terminal"
echo "    Run 'npm run start' to start the full platform"
