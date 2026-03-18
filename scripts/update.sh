#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# ShowMaster — update script
# Called by the server (POST /api/update/apply) or manually.
# Steps: load env → git pull → npm install → vite build → systemctl restart
# ──────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[ShowMaster] Starting update..."
echo "[ShowMaster] Project directory: $PROJECT_DIR"

# 0. Load Node.js environment (nvm, fnm, or system)
echo "[ShowMaster] Loading Node.js environment..."
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env.sh" || {
  echo "[ShowMaster] ERREUR : impossible de charger l'environnement Node.js"
  exit 1
}
echo "[ShowMaster] Node $(node -v) via $SM_NODE_SOURCE"
echo "[ShowMaster] npm $(npm -v)"

# CRITICAL: unset NODE_ENV to ensure devDependencies are installed
# (systemd sets NODE_ENV=production, which makes npm skip devDeps like vite)
unset NODE_ENV

# 1. Pull latest code
echo "[ShowMaster] Pulling latest code..."
cd "$PROJECT_DIR"
git pull origin master

# 2. Install / update server dependencies (production only — no devDeps needed)
echo "[ShowMaster] Installing server dependencies..."
cd "$PROJECT_DIR"
npm install --omit=dev --no-audit --no-fund

# 3. Install client dependencies (INCLUDING devDependencies for vite build)
echo "[ShowMaster] Installing client dependencies (with devDeps for build)..."
cd "$PROJECT_DIR/client"
npm install --no-audit --no-fund

# 4. Build client
echo "[ShowMaster] Building client..."
npx vite build --mode production

# 5. Run migrations (if any new ones)
echo "[ShowMaster] Running migrations..."
cd "$PROJECT_DIR"
node server/src/migrations/run.js 2>/dev/null || true

# 6. Restart the service
echo "[ShowMaster] Restarting service..."
sudo systemctl restart showmaster

echo "[ShowMaster] Update complete."
