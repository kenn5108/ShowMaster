#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# ShowMaster — Node.js environment loader
#
# Sourced by install.sh, update.sh, and the systemd service.
# Detects and loads Node.js from nvm, fnm, or system PATH.
#
# After sourcing this file:
#   - node, npm, npx are available
#   - NODE_PATH and PATH are correctly set
#   - SM_NODE_SOURCE describes where Node was found
#
# Usage:
#   source "$(dirname "$0")/env.sh" || exit 1
# ──────────────────────────────────────────────────────────────

SM_NODE_SOURCE=""
SM_NODE_MIN_VERSION=18

# ── Helper: check if node meets minimum version ──
_sm_check_node() {
  if ! command -v node &>/dev/null; then
    return 1
  fi
  local ver
  ver=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  if [ -z "$ver" ] || [ "$ver" -lt "$SM_NODE_MIN_VERSION" ]; then
    return 1
  fi
  return 0
}

# ── Strategy 1: nvm ──
_sm_try_nvm() {
  # Try common nvm locations
  local nvm_dirs=(
    "$HOME/.nvm"
    "/usr/local/nvm"
    "/opt/nvm"
  )

  # Also check NVM_DIR if already set
  if [ -n "$NVM_DIR" ]; then
    nvm_dirs=("$NVM_DIR" "${nvm_dirs[@]}")
  fi

  for nvm_dir in "${nvm_dirs[@]}"; do
    if [ -s "$nvm_dir/nvm.sh" ]; then
      export NVM_DIR="$nvm_dir"
      # shellcheck disable=SC1091
      source "$nvm_dir/nvm.sh" 2>/dev/null
      if _sm_check_node; then
        SM_NODE_SOURCE="nvm ($nvm_dir)"
        return 0
      fi
      # nvm loaded but no suitable version — try to use 20 or lts
      if command -v nvm &>/dev/null; then
        nvm use 20 &>/dev/null || nvm use --lts &>/dev/null || nvm use default &>/dev/null
        if _sm_check_node; then
          SM_NODE_SOURCE="nvm ($nvm_dir)"
          return 0
        fi
      fi
    fi
  done
  return 1
}

# ── Strategy 2: fnm ──
_sm_try_fnm() {
  local fnm_path="$HOME/.local/share/fnm"
  if [ -d "$fnm_path" ]; then
    export PATH="$fnm_path:$PATH"
    if command -v fnm &>/dev/null; then
      eval "$(fnm env 2>/dev/null)" 2>/dev/null
      if _sm_check_node; then
        SM_NODE_SOURCE="fnm"
        return 0
      fi
    fi
  fi
  return 1
}

# ── Strategy 3: common binary paths ──
_sm_try_paths() {
  local try_paths=(
    "/usr/local/bin"
    "/usr/bin"
    "$HOME/.local/bin"
    "/opt/nodejs/bin"
  )

  for p in "${try_paths[@]}"; do
    if [ -x "$p/node" ]; then
      local ver
      ver=$("$p/node" -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
      if [ -n "$ver" ] && [ "$ver" -ge "$SM_NODE_MIN_VERSION" ]; then
        export PATH="$p:$PATH"
        SM_NODE_SOURCE="system ($p)"
        return 0
      fi
    fi
  done
  return 1
}

# ── Main detection sequence ──
if _sm_check_node; then
  SM_NODE_SOURCE="current PATH"
elif _sm_try_nvm; then
  : # SM_NODE_SOURCE set inside
elif _sm_try_fnm; then
  : # SM_NODE_SOURCE set inside
elif _sm_try_paths; then
  : # SM_NODE_SOURCE set inside
else
  echo "[ShowMaster] ERREUR : Node.js ${SM_NODE_MIN_VERSION}+ introuvable."
  echo ""
  echo "  Vérifiez que Node.js est installé :"
  echo "    node -v"
  echo ""
  echo "  Pour installer Node.js 20 via nvm :"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "    source ~/.bashrc"
  echo "    nvm install 20"
  echo ""
  return 1 2>/dev/null || exit 1
fi

# Export for child processes
export PATH
export NVM_DIR
