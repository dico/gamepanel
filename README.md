# GamePanel

**Yet another AI-created app** — this entire project was built by Claude (AI), from architecture to deployment, without a single line of hand-written code.

---

## Why?

Existing game server panels like AMP and Pterodactyl are **powerful tools built by talented developers** — but they're designed for hosting providers and power users. For someone who just wants to run a Minecraft server at home or set up a few game servers for a LAN party, they can feel overwhelming with dozens of settings and deep navigation.

We wanted something simpler. Something you can install in one command and figure out in five minutes.

**GamePanel shows you what you need 90% of the time.** Advanced settings are one click away, but never in the way.

---

## Screenshots

*Coming soon*

---

## Features

- **One-click server management** — Create, start, stop, restart game servers with a clean UI
- **Live console** — Real-time log streaming with ANSI color support and command input
- **Template-driven** — Add new games by dropping a JSON file, zero code changes
- **Player tracking** — See who's online, player history with UUIDs for easy whitelisting
- **File manager** — Browse, edit, upload (drag & drop), and download server files
- **Configuration UI** — Template-driven forms with groups, toggles, conditional fields
- **Backups** — Create, restore, download, and delete server backups
- **Docker-native** — Each game server runs in its own container with volume-mapped data
- **Multi-node ready** — Manage servers across multiple machines (local + remote Docker hosts)
- **Real-time dashboard** — Live CPU, RAM, and player count via WebSocket
- **Notifications** — Bell icon with unread count and notification history
- **API tokens** — Create Bearer tokens for automation, Discord bots, scripts
- **Dark/light theme** — Because obviously
- **Human-readable URLs** — `/servers/minecraft-survival`, not `/servers/HlVxw_dldfe1eysoLC9YB`

---

## Supported Games

Currently shipping with templates for:

| Game | Status |
|------|--------|
| Minecraft Java Edition | ✅ Ready |
| Counter-Strike 2 | ✅ Ready |

Adding a new game is just a JSON file — no code changes needed. Planned templates:

Valheim, Satisfactory, Terraria, Palworld, Enshrouded, ARK, Rust, Project Zomboid, 7 Days to Die, V Rising, Factorio, Don't Starve Together, Sons of the Forest, Core Keeper, Garry's Mod, and [150+ more](docs/supported-games.md).

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend | **Lit** (Web Components) | ~5KB runtime, native custom elements, no framework bloat |
| Backend | **Fastify** + TypeScript | Fast, typed routes, plugin architecture |
| Database | **SQLite** (better-sqlite3) | Zero config, no external DB server |
| Containers | **Docker** (Dockerode) | Industry standard, volume mounts for data persistence |
| Build | **Vite** | Fast builds, ESM-first |
| Monorepo | **npm workspaces** | Zero extra tooling |

**Total frontend dependencies:** Lit. That's it.

---

## Quick Start

### One-liner install (Ubuntu/Debian)

```bash
curl -fsSL https://raw.githubusercontent.com/dico/gamepanel/main/setup.sh | sudo bash
```

Installs Docker (if needed), asks for admin credentials, pulls the Docker image, and starts GamePanel.

### Manual install with Docker

```bash
docker run -d \
  --name gamepanel \
  -p 3000:3000 \
  -v /opt/gamepanel/data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=yourpassword \
  -e HOST_DATA_DIR=/opt/gamepanel/data \
  -e QUERY_HOST=$(hostname -I | awk '{print $1}') \
  fosenutvikling/gamepanel:latest
```

### Development

```bash
# On the Docker host
docker compose -f docker-compose.dev.yml up --build
```

Open `http://localhost:3000` — login with the credentials from `.env`.

---

## Architecture

```
Browser (Lit)  ←→  Panel (Fastify)  ←→  Docker API
                        ↕
                   SQLite DB
```

- **Panel** manages everything: auth, servers, templates, files, backups
- **Game servers** run as Docker containers with volume-mounted data
- **Templates** (JSON) define how each game is configured — ports, env vars, config files
- **WebSocket** streams console output and broadcasts live stats

Server data lives at `/opt/gamepanel/data/servers/{server-name}/data/` — accessible via the UI, SSH, or your favorite file manager.

---

## Adding a Game

Create a JSON file in `templates/`:

```json
{
  "slug": "valheim",
  "name": "Valheim",
  "docker": {
    "image": "lloesche/valheim-server:latest",
    "stopSignal": "SIGTERM",
    "stopTimeout": 30
  },
  "ports": [
    { "name": "Game", "container": 2456, "protocol": "udp", "defaultHost": 2456 },
    { "name": "Query", "container": 2457, "protocol": "udp", "defaultHost": 2457 }
  ],
  "volumes": [
    { "name": "Server Data", "container": "/config" }
  ],
  "environment": {
    "fixed": {},
    "configurable": [
      { "key": "SERVER_NAME", "label": "Server Name", "type": "string", "default": "My Valheim" },
      { "key": "WORLD_NAME", "label": "World Name", "type": "string", "default": "Dedicated" },
      { "key": "SERVER_PASS", "label": "Password", "type": "password", "default": "" }
    ]
  }
}
```

Drop it in, restart — your new game appears in the UI.

---

## Project Structure

```
gamepanel/
├── packages/
│   ├── shared/          # TypeScript types & constants
│   ├── server/          # Fastify backend
│   │   └── src/
│   │       ├── db/          # SQLite + repositories
│   │       ├── docker/      # Container lifecycle
│   │       ├── routes/      # REST API
│   │       ├── services/    # Status monitor, player query, backups
│   │       └── ws/          # WebSocket handlers
│   └── client/          # Lit frontend
│       └── src/
│           ├── pages/       # Login, dashboard, server, profile, nodes
│           ├── components/  # Reusable UI components
│           ├── services/    # API, auth, WebSocket clients
│           └── styles/      # Theme + shared styles
├── templates/           # Game definitions (JSON)
├── setup.sh             # Interactive installer
└── docs/                # Architecture, API, design guidelines
```

---

## Built by AI

This project was created entirely by [Claude](https://claude.ai) (Anthropic) using [Claude Code](https://claude.ai/claude-code). The AI:

- Designed the architecture
- Wrote every line of TypeScript, CSS, SQL, and Bash
- Set up the Docker development environment
- Configured the Ubuntu dev server via SSH
- Debugged issues in real-time with the developer
- Maintained documentation and task tracking throughout

The human provided direction, feedback, and screenshots. The AI did the rest.

---

## Documentation

- [Architecture](docs/architecture.md) — Tech stack, project structure, multi-node
- [API Reference](docs/api.md) — REST endpoints, WebSocket protocol
- [Templates](docs/templates.md) — Game template system, dynamic UI, presets
- [Features](docs/features.md) — Console, file manager, player count, notifications
- [Database](docs/database.md) — Data model, authentication, roles
- [Design Guidelines](docs/design-guidelines.md) — UI/UX, CSS architecture, reuse principles
- [Roadmap](docs/roadmap.md) — Phases and development plan

---

## License

MIT
