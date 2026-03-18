#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# ShowMaster V2 — Installation script
#
# Usage:
#   cd ~/ShowMaster && bash install.sh
#
# What this script does:
#   1. Installs Node.js 20 via nvm (if not already available)
#   2. Installs server + client dependencies
#   3. Builds the client
#   4. Runs database migrations
#   5. Creates the systemd service (with correct Node path)
#   6. Configures sudoers for passwordless restart
#   7. Starts ShowMaster
#
# After installation:
#   - ShowMaster is available at http://<pi-ip>:3000
#   - Updates can be applied from the ShowMaster settings page
#   - The service starts automatically on boot
# ══════════════════════════════════════════════════════════════
set -e

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[ShowMaster]${NC} $1"; }
ok()    { echo -e "${GREEN}[ShowMaster]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ShowMaster]${NC} $1"; }
fail()  { echo -e "${RED}[ShowMaster]${NC} $1"; exit 1; }

# ── Detect environment ──
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT_USER="$(whoami)"
SERVICE_NAME="showmaster"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SUDOERS_FILE="/etc/sudoers.d/${SERVICE_NAME}"

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       ShowMaster V2 — Installation${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo ""

info "Répertoire d'installation : $INSTALL_DIR"
info "Utilisateur : $CURRENT_USER"

# ── Check Git ──
if ! command -v git &>/dev/null; then
  fail "Git n'est pas installé. Installez-le : sudo apt install -y git"
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  fail "Ce répertoire n'est pas un dépôt Git. Clonez d'abord le projet."
fi

# ── Ensure Node.js 18+ is available ──
info "Vérification de Node.js..."

# Try loading existing Node.js via env.sh
chmod +x "$INSTALL_DIR/scripts/env.sh" 2>/dev/null || true
NODE_OK=false
# shellcheck disable=SC1091
if source "$INSTALL_DIR/scripts/env.sh" 2>/dev/null; then
  NODE_OK=true
  ok "Node.js $(node -v) trouvé via $SM_NODE_SOURCE"
fi

# If no suitable Node.js, install via nvm
if [ "$NODE_OK" = false ]; then
  warn "Node.js 18+ introuvable. Installation de Node.js 20 via nvm..."

  # Install nvm if not present
  if [ ! -d "$HOME/.nvm" ]; then
    info "Installation de nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  # Load nvm
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh" || fail "Impossible de charger nvm"

  # Install Node.js 20
  info "Installation de Node.js 20..."
  nvm install 20
  nvm use 20
  nvm alias default 20

  # Verify
  if ! command -v node &>/dev/null; then
    fail "L'installation de Node.js a échoué"
  fi

  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    fail "Node.js 18+ requis après installation (version : $(node -v))"
  fi

  ok "Node.js $(node -v) installé via nvm"
fi

ok "npm $(npm -v)"
ok "Git $(git --version | cut -d' ' -f3)"

# ── Resolve the actual node binary path (for systemd) ──
NODE_BIN=$(command -v node)
NODE_BIN_DIR=$(dirname "$NODE_BIN")
info "Chemin Node.js : $NODE_BIN_DIR"

# ── Ensure NODE_ENV doesn't block devDependencies install ──
unset NODE_ENV

# ── Install dependencies ──
info "Installation des dépendances serveur..."
cd "$INSTALL_DIR"
npm install --omit=dev --no-audit --no-fund

info "Installation des dépendances client (avec devDeps pour le build)..."
cd "$INSTALL_DIR/client"
npm install --no-audit --no-fund

# ── Build client ──
info "Compilation de l'interface..."
cd "$INSTALL_DIR/client"
npx vite build --mode production

# ── Run migrations ──
info "Initialisation de la base de données..."
cd "$INSTALL_DIR"
node server/src/migrations/run.js 2>/dev/null || true

# ── Create data directory ──
mkdir -p "$INSTALL_DIR/data"

# ── Setup systemd service ──
info "Configuration du service systemd..."

# Generate service file from template, injecting the real Node binary path
SERVICE_CONTENT=$(cat "$INSTALL_DIR/system/showmaster.service" \
  | sed "s|__USER__|${CURRENT_USER}|g" \
  | sed "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  | sed "s|__NODE_BIN_DIR__|${NODE_BIN_DIR}|g")

# Write service file (requires sudo)
echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" > /dev/null
sudo chmod 644 "$SERVICE_FILE"
ok "Service systemd créé : $SERVICE_FILE"

# ── Setup sudoers for passwordless restart ──
info "Configuration des permissions de mise à jour..."

SUDOERS_CONTENT="${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ${SERVICE_NAME}, /usr/bin/systemctl stop ${SERVICE_NAME}, /usr/bin/systemctl start ${SERVICE_NAME}"
echo "$SUDOERS_CONTENT" | sudo tee "$SUDOERS_FILE" > /dev/null
sudo chmod 440 "$SUDOERS_FILE"

# Validate sudoers file
if sudo visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
  ok "Permissions sudoers configurées"
else
  sudo rm -f "$SUDOERS_FILE"
  fail "Erreur dans le fichier sudoers. Installation annulée."
fi

# ── Make scripts executable ──
chmod +x "$INSTALL_DIR/scripts/update.sh"
chmod +x "$INSTALL_DIR/scripts/env.sh"

# ── Enable and start service ──
info "Démarrage du service..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# ── Wait and verify ──
sleep 2
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service démarré avec succès"
else
  warn "Le service ne semble pas démarré. Vérifiez avec :"
  warn "  sudo journalctl -u $SERVICE_NAME -f"
fi

# ── Get IP address ──
IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP_ADDR" ]; then
  IP_ADDR="<ip-du-pi>"
fi

# ── Done ──
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}       Installation terminée !${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ShowMaster est accessible à :"
echo -e "  ${BLUE}http://${IP_ADDR}:3000${NC}"
echo ""
echo -e "  Vue prompteur :"
echo -e "  ${BLUE}http://${IP_ADDR}:3000/prompter${NC}"
echo ""
echo -e "  Commandes utiles :"
echo -e "    sudo systemctl status ${SERVICE_NAME}"
echo -e "    sudo systemctl restart ${SERVICE_NAME}"
echo -e "    sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo -e "  Les mises à jour se font depuis ${BLUE}Réglages${NC} dans l'interface."
echo ""
