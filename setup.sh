#!/usr/bin/env bash
set -euo pipefail

# =============================================
# GamePanel — Install, Update, Uninstall
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dico/gamepanel/main/setup.sh | sudo bash
# =============================================

DOCKER_IMAGE="fosenutvikling/gamepanel:latest"
GAMEPANEL_DIR="/opt/gamepanel"
COMPOSE_FILE="$GAMEPANEL_DIR/docker-compose.yml"
GITHUB_REPO="dico/gamepanel"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[GamePanel]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
err()  { echo -e "${RED}[Error]${NC} $1"; exit 1; }

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
    # Add current sudo user to docker group if not already
    if [[ -n "${SUDO_USER:-}" ]]; then
      usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    fi
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

  # Add current sudo user to docker group
  if [[ -n "${SUDO_USER:-}" ]]; then
    usermod -aG docker "$SUDO_USER"
    log "Added $SUDO_USER to docker group (re-login for effect)"
  fi

  log "Docker installed: $(docker --version)"
}

# =============================================
# Actions
# =============================================

do_install() {
  log "Starting full installation..."
  install_docker

  SERVER_IP=$(hostname -I | awk '{print $1}')

  echo ""
  echo -e "${BLUE}Configure admin account:${NC}"
  prompt ADMIN_USER "  Admin username [admin]: " "admin"

  while true; do
    prompt_secret ADMIN_PASS "  Admin password (min 8 characters): "
    if [[ ${#ADMIN_PASS} -ge 8 ]]; then break; fi
    warn "Password must be at least 8 characters"
  done

  prompt PANEL_PORT "  Panel port [3000]: " "3000"

  log "Setting up directories..."
  mkdir -p "$GAMEPANEL_DIR/data/servers"
  mkdir -p "$GAMEPANEL_DIR/data/backups"
  mkdir -p "$GAMEPANEL_DIR/templates"

  log "Downloading game templates..."
  for file in minecraft-java.json cs2.json; do
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_REPO/main/templates/$file" \
      -o "$GAMEPANEL_DIR/templates/$file" 2>/dev/null || warn "Failed to download $file"
  done

  mkdir -p "$GAMEPANEL_DIR/templates/images" "$GAMEPANEL_DIR/templates/icons"
  for file in minecraft-java.jpg cs2.jpg; do
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_REPO/main/templates/images/$file" \
      -o "$GAMEPANEL_DIR/templates/images/$file" 2>/dev/null || true
  done
  for file in minecraft.svg cs2.png; do
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_REPO/main/templates/icons/$file" \
      -o "$GAMEPANEL_DIR/templates/icons/$file" 2>/dev/null || true
  done

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
    echo -e "  Manage:    ${YELLOW}curl -fsSL https://raw.githubusercontent.com/$GITHUB_REPO/main/setup.sh | sudo bash${NC}"
    echo ""
  else
    err "Container failed to start. Check: docker logs gamepanel"
  fi
}

do_update() {
  log "Updating GamePanel..."
  cd "$GAMEPANEL_DIR"
  docker compose pull
  docker compose up -d
  sleep 3
  if docker ps --format '{{.Names}}' | grep -q gamepanel; then
    log "Update complete! GamePanel is running."
    docker logs gamepanel --tail 3 2>&1 | grep -i "running\|listening" || true
  else
    err "Container failed to start after update. Check: docker logs gamepanel"
  fi
}

do_node_install() {
  log "Node-only setup"
  install_docker
  echo ""
  log "Docker installed. Add this node in your GamePanel UI:"
  echo -e "  Host: ${BLUE}tcp://$(hostname -I | awk '{print $1}'):2376${NC}"
  echo ""
  warn "For remote access, configure Docker TLS. See docs."
}

do_uninstall() {
  echo ""
  warn "This will stop the GamePanel container."
  prompt CONFIRM "Continue? [y/N]: " "n"
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 0

  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q gamepanel; then
    log "Stopping and removing container..."
    cd "$GAMEPANEL_DIR" 2>/dev/null && docker compose down 2>/dev/null || docker rm -f gamepanel 2>/dev/null
    log "Container removed"
  else
    log "No GamePanel container found"
  fi

  echo ""
  prompt REMOVE_DATA "Remove ALL data (worlds, backups, database)? [y/N]: " "n"

  if [[ "$REMOVE_DATA" =~ ^[Yy]$ ]]; then
    warn "Deleting $GAMEPANEL_DIR..."
    rm -rf "$GAMEPANEL_DIR"
    log "All data removed"
  else
    rm -f "$GAMEPANEL_DIR/docker-compose.yml" 2>/dev/null
    log "Config removed, server data kept at $GAMEPANEL_DIR/data/"
  fi

  echo ""
  log "GamePanel uninstalled"
}

do_status() {
  echo ""
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q gamepanel; then
    echo -e "  Status:  ${GREEN}Running${NC}"
    local port
    port=$(docker port gamepanel 3000/tcp 2>/dev/null | head -1 | cut -d: -f2)
    echo -e "  URL:     ${BLUE}http://$(hostname -I | awk '{print $1}'):${port:-3000}${NC}"
    echo -e "  Uptime:  $(docker ps --format '{{.Status}}' --filter name=gamepanel)"
    echo ""
    echo -e "  Logs:    ${YELLOW}docker logs -f gamepanel${NC}"
  else
    echo -e "  Status:  ${RED}Not running${NC}"
    if [[ -f "$COMPOSE_FILE" ]]; then
      echo -e "  Start:   ${YELLOW}cd $GAMEPANEL_DIR && sudo docker compose up -d${NC}"
    fi
  fi
  echo ""
}

# =============================================
# Pre-flight
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
echo -e "${BLUE}║          GamePanel                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# =============================================
# Detect existing installation
# =============================================

INSTALLED=false
RUNNING=false

if [[ -f "$COMPOSE_FILE" ]]; then
  INSTALLED=true
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q gamepanel; then
    RUNNING=true
  fi
fi

if $INSTALLED; then
  if $RUNNING; then
    echo -e "  GamePanel is ${GREEN}installed and running${NC}"
  else
    echo -e "  GamePanel is ${YELLOW}installed but not running${NC}"
  fi
  echo ""
  echo -e "  ${GREEN}1)${NC} Update (pull latest image and restart)"
  echo -e "  ${GREEN}2)${NC} Status"
  echo -e "  ${GREEN}3)${NC} Uninstall"
  echo -e "  ${GREEN}4)${NC} Reinstall (fresh install)"
  echo ""
  prompt CHOICE "Choice [1]: " "1"

  case "$CHOICE" in
    1) do_update ;;
    2) do_status ;;
    3) do_uninstall ;;
    4) do_uninstall; do_install ;;
    *) do_update ;;
  esac
else
  echo -e "  GamePanel is ${YELLOW}not installed${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} Full install (panel + local node)"
  echo -e "  ${GREEN}2)${NC} Node only (add to existing panel)"
  echo ""
  prompt CHOICE "Choice [1]: " "1"

  case "$CHOICE" in
    1) do_install ;;
    2) do_node_install ;;
    *) do_install ;;
  esac
fi
