#!/bin/bash
set -euo pipefail

echo "==> Running ESLint..."
npx eslint "src/**/*.ts" --max-warnings 0
echo "==> Lint passed."
