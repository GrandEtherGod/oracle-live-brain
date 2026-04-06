#!/bin/bash
set -euo pipefail

# OpenClaw (Claude Code) installer for AetherLinkOS / Theia Engine
# Usage: curl -fsSL https://raw.githubusercontent.com/Enderfga/openclaw-claude-code/main/install.sh | bash
#    or: ./scripts/install-openclaw.sh

OPENCLAW_REPO="Enderfga/openclaw-claude-code"
INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-$HOME/.openclaw}"
BIN_DIR="${OPENCLAW_BIN_DIR:-$HOME/.local/bin}"

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { echo "==> $*"; }
ok()    { echo "    ✓  $*"; }
warn()  { echo "    ⚠  $*" >&2; }
die()   { echo "ERROR: $*" >&2; exit 1; }

# ── dependency checks ────────────────────────────────────────────────────────

info "OpenClaw — Claude Code CLI installer"
echo ""

if ! command -v node &>/dev/null; then
  die "Node.js is required. Install it via nvm (https://github.com/nvm-sh/nvm) or https://nodejs.org"
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js 18+ is required (found $NODE_VERSION)"
fi
ok "Node.js $NODE_VERSION"

if ! command -v npm &>/dev/null; then
  die "npm is required but not found"
fi
ok "npm $(npm --version)"

if ! command -v git &>/dev/null; then
  die "git is required but not found"
fi
ok "git $(git --version | awk '{print $3}')"

echo ""

# ── install ──────────────────────────────────────────────────────────────────

info "Installing OpenClaw from https://github.com/$OPENCLAW_REPO"

# Remove stale install if present
if [ -d "$INSTALL_DIR" ]; then
  warn "Existing installation found at $INSTALL_DIR — overwriting"
  rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"
git clone --depth 1 "https://github.com/$OPENCLAW_REPO.git" "$INSTALL_DIR"

info "Installing npm dependencies..."
(cd "$INSTALL_DIR" && npm install --prefer-offline 2>/dev/null || npm install)

# Build if a build script exists
if (cd "$INSTALL_DIR" && npm run env 2>/dev/null | grep -q '"build"'); then
  info "Building..."
  (cd "$INSTALL_DIR" && npm run build)
fi

ok "OpenClaw installed to $INSTALL_DIR"

# ── link binary ──────────────────────────────────────────────────────────────

mkdir -p "$BIN_DIR"

# Detect entry point
ENTRY=""
for candidate in \
  "$INSTALL_DIR/bin/openclaw" \
  "$INSTALL_DIR/bin/claude" \
  "$INSTALL_DIR/cli.js" \
  "$INSTALL_DIR/index.js"
do
  if [ -f "$candidate" ]; then
    ENTRY="$candidate"
    break
  fi
done

if [ -n "$ENTRY" ]; then
  chmod +x "$ENTRY"
  ln -sf "$ENTRY" "$BIN_DIR/openclaw"
  ok "Linked binary → $BIN_DIR/openclaw"
else
  warn "Could not locate entry point — run manually from $INSTALL_DIR"
fi

# ── PATH reminder ────────────────────────────────────────────────────────────

echo ""
if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  warn "$BIN_DIR is not in your \$PATH"
  echo ""
  echo "    Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  echo ""
  echo "        export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "    Then reload your shell:  source ~/.bashrc"
  echo ""
fi

# ── API key reminder ─────────────────────────────────────────────────────────

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY is not set"
  echo ""
  echo "    Set it in your shell profile or in the project .env file:"
  echo ""
  echo "        export ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
fi

# ── done ─────────────────────────────────────────────────────────────────────

info "Done! Run 'openclaw --help' to get started."
