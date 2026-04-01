#!/usr/bin/env bash
set -euo pipefail

# =============================================
# GamePanel Setup Script
# Installs GamePanel on a fresh Ubuntu/Debian server
# =============================================

GAMEPANEL_DIR="/opt/gamepanel"
GAMEPANEL_USER="gamepanel"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[GamePanel]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
err()  { echo -e "${RED}[Error]${NC} $1"; exit 1; }

# =============================================
# Functions (defined before use)
# =============================================

install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed: $(docker --version)"
    return
  fi

  log "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  log "Docker installed: $(docker --version)"
}

install_node() {
  if command -v node &>/dev/null; then
    local current_version
    current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$current_version" -ge 20 ]]; then
      log "Node.js already installed: $(node --version)"
      return
    fi
  fi

  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  log "Node.js installed: $(node --version)"
}

# =============================================
# Pre-flight checks
# =============================================

if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (use sudo)"
fi

if [[ ! -f /etc/os-release ]]; then
  err "Cannot detect OS. This script supports Ubuntu/Debian."
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  warn "Detected $ID — this script is designed for Ubuntu/Debian. Continuing anyway..."
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         GamePanel Setup               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# =============================================
# Choose mode
# =============================================

echo -e "Select installation mode:"
echo -e "  ${GREEN}1)${NC} Standalone (panel + local node)"
echo -e "  ${GREEN}2)${NC} Node only (register with existing panel)"
echo ""
read -p "Choice [1]: " MODE
MODE=${MODE:-1}

if [[ "$MODE" == "2" ]]; then
  log "Node-only setup"
  install_docker
  log "Docker installed. Add this node in your GamePanel UI."
  echo ""
  echo -e "  Node host: ${BLUE}tcp://$(hostname -I | awk '{print $1}'):2376${NC}"
  echo ""
  log "Note: For remote access, configure Docker TLS. See docs."
  exit 0
fi

# =============================================
# Standalone installation
# =============================================

log "Starting standalone installation..."

install_docker
install_node

# --- System user ---
if ! id "$GAMEPANEL_USER" &>/dev/null; then
  log "Creating system user: $GAMEPANEL_USER"
  useradd -r -m -s /bin/bash -G docker "$GAMEPANEL_USER"
else
  log "User $GAMEPANEL_USER already exists"
  usermod -aG docker "$GAMEPANEL_USER" 2>/dev/null || true
fi

# --- Create directory structure ---
log "Setting up directories..."
mkdir -p "$GAMEPANEL_DIR"
mkdir -p "$GAMEPANEL_DIR/data/backups"
mkdir -p "$GAMEPANEL_DIR/data/servers"

# --- Check if already installed ---
if [[ -f "$GAMEPANEL_DIR/package.json" ]]; then
  log "Existing installation found, updating..."
  cd "$GAMEPANEL_DIR"
  if [[ -d ".git" ]]; then
    git pull
  fi
else
  log "Downloading GamePanel..."
  # TODO: Replace with actual repo URL when published
  # git clone https://github.com/YOUR_ORG/gamepanel.git "$GAMEPANEL_DIR"
  echo ""
  warn "Git clone not configured yet. Copy project files to $GAMEPANEL_DIR manually."
  warn "Or set up the repository URL in this script."
  echo ""
fi

cd "$GAMEPANEL_DIR"

# --- Install & Build ---
if [[ -f "package.json" ]]; then
  log "Installing dependencies..."
  npm install 2>&1 | tail -1

  log "Building shared package..."
  npm run build -w packages/shared 2>&1 | tail -1

  log "Building client..."
  npm run build -w packages/client 2>&1 | tail -1

  log "Building server..."
  npm run build -w packages/server 2>&1 | tail -1

  log "Build complete"
fi

# --- Admin credentials ---
echo ""
echo -e "${BLUE}Configure admin account:${NC}"
read -p "  Admin username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

while true; do
  read -sp "  Admin password (min 8 characters): " ADMIN_PASS
  echo ""
  if [[ ${#ADMIN_PASS} -ge 8 ]]; then
    break
  fi
  warn "Password must be at least 8 characters"
done

read -p "  Panel port [3000]: " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-3000}

# --- Environment file ---
cat > "$GAMEPANEL_DIR/.env" <<EOF
NODE_ENV=production
GAMEPANEL_PORT=$PANEL_PORT
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASS
DATA_DIR=$GAMEPANEL_DIR/data
HOST_DATA_DIR=$GAMEPANEL_DIR/data
TEMPLATES_DIR=$GAMEPANEL_DIR/templates
QUERY_HOST=127.0.0.1
EOF

chmod 600 "$GAMEPANEL_DIR/.env"
log ".env created"

# --- Fix permissions ---
chown -R "$GAMEPANEL_USER:$GAMEPANEL_USER" "$GAMEPANEL_DIR"

# --- Systemd service ---
cat > /etc/systemd/system/gamepanel.service <<EOF
[Unit]
Description=GamePanel - Game Server Management
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$GAMEPANEL_USER
Group=$GAMEPANEL_USER
WorkingDirectory=$GAMEPANEL_DIR
EnvironmentFile=$GAMEPANEL_DIR/.env
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gamepanel
systemctl start gamepanel

log "Waiting for service to start..."
sleep 3

if systemctl is-active --quiet gamepanel; then
  echo ""
  echo -e "${GREEN}══════════════════════════════════════${NC}"
  echo -e "${GREEN} GamePanel installed successfully!${NC}"
  echo -e "${GREEN}══════════════════════════════════════${NC}"
  echo ""
  echo -e "  URL:      ${BLUE}http://$(hostname -I | awk '{print $1}'):${PANEL_PORT}${NC}"
  echo -e "  Username: ${BLUE}${ADMIN_USER}${NC}"
  echo ""
  echo -e "  Service:  ${YELLOW}systemctl status gamepanel${NC}"
  echo -e "  Logs:     ${YELLOW}journalctl -u gamepanel -f${NC}"
  echo -e "  Config:   ${YELLOW}$GAMEPANEL_DIR/.env${NC}"
  echo ""
else
  err "Service failed to start. Check: journalctl -u gamepanel -f"
fi
