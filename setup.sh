#!/usr/bin/env bash
set -euo pipefail

# =============================================
# GamePanel Setup Script
# Installs GamePanel on a fresh Ubuntu/Debian server
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dico/gamepanel/main/setup.sh | sudo bash
# =============================================

DOCKER_IMAGE="fosenutvikling/gamepanel:latest"
GAMEPANEL_DIR="/opt/gamepanel"
COMPOSE_FILE="$GAMEPANEL_DIR/docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[GamePanel]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
err()  { echo -e "${RED}[Error]${NC} $1"; exit 1; }

# Read from terminal even when piped via curl | bash
prompt() {
  local var="$1" msg="$2" default="${3:-}"
  read -p "$msg" "$var" </dev/tty
  if [[ -z "${!var}" && -n "$default" ]]; then
    eval "$var='$default'"
  fi
}

prompt_secret() {
  local var="$1" msg="$2"
  read -sp "$msg" "$var" </dev/tty
  echo "" >/dev/tty
}

# =============================================
# Install Docker if missing
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

  local distro codename
  distro=$(. /etc/os-release && echo "$ID")
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")

  curl -fsSL "https://download.docker.com/linux/$distro/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$distro $codename stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  log "Docker installed: $(docker --version)"
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
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          GamePanel Setup               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# =============================================
# Choose mode
# =============================================

echo -e "Select installation mode:"
echo -e "  ${GREEN}1)${NC} Full install (panel + local node)"
echo -e "  ${GREEN}2)${NC} Node only (add to existing panel)"
echo ""
prompt MODE "Choice [1]: " "1"

if [[ "$MODE" == "2" ]]; then
  log "Node-only setup"
  install_docker
  echo ""
  log "Docker installed. Add this node in your GamePanel UI:"
  echo -e "  Host: ${BLUE}tcp://$(hostname -I | awk '{print $1}'):2376${NC}"
  echo ""
  warn "For remote access, configure Docker TLS. See docs."
  exit 0
fi

# =============================================
# Full installation
# =============================================

log "Starting full installation..."
install_docker

# --- Get server IP ---
SERVER_IP=$(hostname -I | awk '{print $1}')

# --- Admin credentials ---
echo ""
echo -e "${BLUE}Configure admin account:${NC}"
prompt ADMIN_USER "  Admin username [admin]: " "admin"

while true; do
  prompt_secret ADMIN_PASS "  Admin password (min 8 characters): "
  if [[ ${#ADMIN_PASS} -ge 8 ]]; then
    break
  fi
  warn "Password must be at least 8 characters"
done

prompt PANEL_PORT "  Panel port [3000]: " "3000"

# --- Create directories ---
log "Setting up directories..."
mkdir -p "$GAMEPANEL_DIR/data/servers"
mkdir -p "$GAMEPANEL_DIR/data/backups"
mkdir -p "$GAMEPANEL_DIR/templates"

# --- Download templates from GitHub ---
log "Downloading game templates..."
for file in minecraft-java.json cs2.json; do
  curl -fsSL "https://raw.githubusercontent.com/dico/gamepanel/main/templates/$file" \
    -o "$GAMEPANEL_DIR/templates/$file" 2>/dev/null || warn "Failed to download $file"
done

mkdir -p "$GAMEPANEL_DIR/templates/images" "$GAMEPANEL_DIR/templates/icons"
for file in minecraft-java.jpg cs2.jpg; do
  curl -fsSL "https://raw.githubusercontent.com/dico/gamepanel/main/templates/images/$file" \
    -o "$GAMEPANEL_DIR/templates/images/$file" 2>/dev/null || true
done
for file in minecraft.svg cs2.png; do
  curl -fsSL "https://raw.githubusercontent.com/dico/gamepanel/main/templates/icons/$file" \
    -o "$GAMEPANEL_DIR/templates/icons/$file" 2>/dev/null || true
done

# --- Create docker-compose.yml ---
log "Creating Docker Compose configuration..."
cat > "$COMPOSE_FILE" <<YAML
services:
  gamepanel:
    image: ${DOCKER_IMAGE}
    container_name: gamepanel
    restart: unless-stopped
    ports:
      - "${PANEL_PORT}:3000"
    volumes:
      - ./data:/app/data
      - ./templates:/app/templates
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      NODE_ENV: production
      GAMEPANEL_PORT: "3000"
      ADMIN_USERNAME: "${ADMIN_USER}"
      ADMIN_PASSWORD: "${ADMIN_PASS}"
      DATA_DIR: /app/data
      HOST_DATA_DIR: ${GAMEPANEL_DIR}/data
      TEMPLATES_DIR: /app/templates
      QUERY_HOST: "${SERVER_IP}"
YAML

# --- Pull and start ---
log "Pulling GamePanel image..."
docker pull "$DOCKER_IMAGE"

log "Starting GamePanel..."
cd "$GAMEPANEL_DIR"
docker compose up -d

log "Waiting for service to start..."
sleep 5

if docker ps --format '{{.Names}}' | grep -q gamepanel; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}  GamePanel installed successfully!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo ""
  echo -e "  URL:       ${BLUE}http://${SERVER_IP}:${PANEL_PORT}${NC}"
  echo -e "  Username:  ${BLUE}${ADMIN_USER}${NC}"
  echo ""
  echo -e "  Directory: ${YELLOW}${GAMEPANEL_DIR}${NC}"
  echo -e "  Logs:      ${YELLOW}docker logs -f gamepanel${NC}"
  echo -e "  Stop:      ${YELLOW}cd ${GAMEPANEL_DIR} && docker compose down${NC}"
  echo -e "  Update:    ${YELLOW}cd ${GAMEPANEL_DIR} && docker compose pull && docker compose up -d${NC}"
  echo ""
else
  echo ""
  err "Container failed to start. Check: docker logs gamepanel"
fi
