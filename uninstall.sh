#!/usr/bin/env bash
set -euo pipefail

# =============================================
# GamePanel Uninstall Script
# Removes GamePanel container and optionally data
# =============================================

GAMEPANEL_DIR="/opt/gamepanel"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[GamePanel]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }

prompt() {
  local var="$1" msg="$2" default="${3:-}"
  read -p "$msg" "$var" </dev/tty
  if [[ -z "${!var}" && -n "$default" ]]; then
    eval "$var='$default'"
  fi
}

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}[Error]${NC} This script must be run as root (use sudo)"
  exit 1
fi

echo ""
echo -e "${BLUE}GamePanel Uninstall${NC}"
echo ""

# Stop and remove container
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q gamepanel; then
  log "Stopping and removing GamePanel container..."
  cd "$GAMEPANEL_DIR" 2>/dev/null && docker compose down 2>/dev/null || docker rm -f gamepanel 2>/dev/null
  log "Container removed"
else
  log "No GamePanel container found"
fi

# Ask about data
echo ""
prompt REMOVE_DATA "Remove all server data (worlds, backups, database)? [y/N]: " "n"

if [[ "$REMOVE_DATA" =~ ^[Yy]$ ]]; then
  warn "Deleting $GAMEPANEL_DIR (all data will be lost)..."
  rm -rf "$GAMEPANEL_DIR"
  log "All data removed"
else
  # Just remove compose file and templates, keep data
  rm -f "$GAMEPANEL_DIR/docker-compose.yml" 2>/dev/null
  rm -rf "$GAMEPANEL_DIR/templates" 2>/dev/null
  log "Config removed, server data kept at $GAMEPANEL_DIR/data/"
fi

echo ""
log "GamePanel uninstalled"
echo -e "  To reinstall: ${BLUE}curl -fsSL https://raw.githubusercontent.com/dico/gamepanel/main/setup.sh | sudo bash${NC}"
echo ""
