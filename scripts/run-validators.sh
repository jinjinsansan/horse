#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[validators] Building shared package"
cd "$ROOT_DIR/shared"
npm install
npx tsc -p tsconfig.json

echo "[validators] Installing admin-panel dependencies"
cd "$ROOT_DIR/admin-panel"
npm install

echo "[validators] Installing playwright-service dependencies"
cd "$ROOT_DIR/playwright-service"
npm install

echo "[validators] Installing user-gui dependencies"
cd "$ROOT_DIR/user-gui"
npm install

echo "[validators] Syncing shared package into app node_modules"
cd "$ROOT_DIR"
node scripts/sync-shared.mjs

echo "[validators] Linting & building admin-panel"
cd "$ROOT_DIR/admin-panel"
npm run lint
npm run build

echo "[validators] Building user-gui"
cd "$ROOT_DIR/user-gui"
npm run build

echo "[validators] Building playwright-service"
cd "$ROOT_DIR/playwright-service"
npm run build

echo "[validators] All checks completed"
