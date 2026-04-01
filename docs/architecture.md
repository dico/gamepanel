# GamePanel — Arkitektur

## Kontekst

AMP (Application Management Panel) er bloated med 3 nivaer navigasjon, darlig lesbarhet,
og for mange funksjoner. Vi bygger et enkelt, rent game server panel som gjor en ting godt:
kjore spillservere i Docker-containere med et oversiktlig UI.

**Bruksomrader:** Hjemmehosting, LAN-party, ikke-kommersiell drift.
**Plattform:** Linux (Ubuntu Server). Installasjon via guidet shell-script.

---

## Arkitekturoversikt

```
                         +-------------------+
                         |    Browser (Lit)   |
                         |  /servers          |
                         |  /servers/:id      |
                         |  /profile          |
                         +--------+----------+
                                  |
                         HTTP REST + WebSocket
                                  |
                    +-------------+-------------+
                    |    Panel (Fastify)         |
                    |    Sentral admin-server    |
                    |    SQLite for persistering |
                    +------+----------+---------+
                           |          |
                      Docker API  Docker API
                           |          |
                    +------+--+  +---+-------+
                    | Node 1  |  | Node 2    |
                    | (lokal) |  | (remote)  |
                    | Docker  |  | Docker    |
                    +---------+  +-----------+
```

**Multi-node:** Panelet styrer en eller flere noder (fysiske/virtuelle servere). Som standard
kjorer panelet og en lokal node pa samme maskin. Ved f.eks. dataparty kan flere noder kobles til
via Docker API over nettverk.

**Filosofi:** Flat navigasjon. Dashboard viser alle servere pa tvers av noder. Klikk = server-side
med konsoll og config. Ingen undermenyhelvedet fra AMP.

---

## Tech Stack

| Komponent | Valg | Begrunnelse |
|-----------|------|-------------|
| Frontend | **Lit** (Web Components) | ~5KB runtime, native custom elements, naert vanilla JS, reaktive properties for live updates |
| Backend | **Fastify** + TypeScript | Rask, typed routes, plugin-arkitektur, innebygd WebSocket |
| Database | **better-sqlite3** | Synkron API, ingen ekstern DB |
| Docker | **Dockerode** | Moden, streaming-stotte, promise API, stotter remote Docker hosts |
| Templates | **JSON** | Enklere a forholde seg til enn YAML, native i TypeScript |
| Build | **Vite** | Rask, forstar Lit ut av boksen |
| Monorepo | **npm workspaces** | Null ekstra tooling |
| Routing | **History API** | Rene URLer: /servers, /profile — ingen hash-routing |

### Hvorfor Lit over Svelte/React?

- Lit-komponenter ER web components — native custom elements, ikke et framework-abstraksjon
- Ingen kompilator nodvendig i utvikling (kan kjore direkte i browser med import map)
- ~5KB minified+gzip runtime
- `@property()` trigger effektive re-renders nar WebSocket-data ankommer
- Shadow DOM gir CSS-isolasjon uten konvensjoner eller tooling

---

## Routing (Frontend)

Bruker History API med rene URLer. Fastify har en catch-all som returnerer `index.html` for
alle ikke-API/WS-ruter, slik at klienten handterer navigasjon.

```
/                           -> Dashboard (redirect til /servers)
/servers                    -> Serveroversikt (alle noder)
/servers/:id                -> Server-detaljer (konsoll, config, filer)
/servers/:id/console        -> Konsoll-tab (direkte lenke)
/servers/:id/config         -> Konfigurasjon-tab
/servers/:id/files          -> Filbehandler-tab
/nodes                      -> Node-oversikt
/nodes/:id                  -> Node-detaljer og status
/profile                    -> Brukerprofil / innstillinger
/login                      -> Innlogging
/status/:id                 -> Offentlig statusside (valgfri, uten innlogging)
```

---

## Multi-Node Arkitektur

Hver node er en Docker-host som panelet kobler seg til via Docker API.

### Node-konfigurasjon

```json
{
  "id": "node-1",
  "name": "Hjemmeserver",
  "host": "local",
  "description": "Lokal Docker-instans"
}
```

```json
{
  "id": "node-2",
  "name": "LAN-server",
  "host": "tcp://192.168.1.50:2376",
  "tls": {
    "ca": "/path/to/ca.pem",
    "cert": "/path/to/cert.pem",
    "key": "/path/to/key.pem"
  },
  "description": "Ekstra maskin pa LAN-party"
}
```

- `"local"` betyr lokal Docker socket (`/var/run/docker.sock`)
- Remote noder bruker Docker API over TCP med TLS
- Dockerode stotter begge deler nativt — vi oppretter en Dockerode-instans per node
- Panelet poller alle noder for status og aggregerer til dashboardet

### Node-oppsett for remote noder

Et eget script `setup-node.sh` kan kjores pa en remote maskin for a:
1. Installere Docker
2. Konfigurere Docker TCP med TLS-sertifikater
3. Returnere tilkoblingsinfo til panelet

---

## Prosjektstruktur

```
gamepanel/
  package.json                     # npm workspaces root
  tsconfig.base.json
  .env.example                     # GAMEPANEL_PORT=3000, ADMIN_PASSWORD=...
  setup.sh                         # guidet installasjon (panel + lokal node)
  setup-node.sh                    # guidet installasjon (remote node)

  templates/                       # spilldefinisjoner (JSON)
    minecraft-java.json
    minecraft-bedrock.json
    cs2.json
    images/                        # spillbilder — legges inn manuelt i repoet
      minecraft-java.jpg           # profilbilde/banner for Minecraft Java
      minecraft-bedrock.jpg
      cs2.jpg
    icons/                         # sma ikoner for navbar, cards osv.
      minecraft.svg
      cs2.svg

  data/                            # gitignored, runtime
    gamepanel.db                   # SQLite
    servers/{id}/data/             # volummonteringer per server

  packages/
    shared/                        # @gamepanel/shared
      src/
        types.ts                   # Server, Template, Node, WsEvent, ApiResponse
        constants.ts               # status enums, defaults
        validation.ts              # template schema validering

    server/                        # @gamepanel/server
      src/
        index.ts                   # bootstrap Fastify
        config.ts                  # env/CLI config
        db/
          index.ts                 # SQLite setup + migrasjoner
          migrations/001-initial.sql
          repositories/
            user-repo.ts
            session-repo.ts
            api-token-repo.ts
            server-repo.ts
            node-repo.ts
            backup-repo.ts
            audit-repo.ts
            settings-repo.ts
            events-repo.ts
        docker/
          docker-manager.ts        # container lifecycle per node
          node-pool.ts             # handterer flere Dockerode-instanser
          container-builder.ts     # template + config -> Docker create options
          log-streamer.ts          # attach container, buffer + emit loglinjer
        templates/
          template-loader.ts       # les JSON, valider, hot-reload
          template-schema.ts       # TypeScript schema + validator
        middleware/
          auth.ts                  # session/token-sjekk, setter req.user
          role.ts                  # rolle-sjekk (admin, operator, viewer)
          audit.ts                 # logger handlinger til audit_log
        routes/
          auth.ts                  # login/logout/refresh
          users.ts                 # bruker-CRUD (admin-only, forberedt for fase 3)
          profile.ts               # bytt passord, API-tokens
          servers.ts               # CRUD + start/stop/restart/update/recreate
          templates.ts             # list/get templates
          nodes.ts                 # CRUD for noder
          files.ts                 # filbehandler API
          docker.ts                # image management, prune, disk-usage
          notifications.ts         # varslings-API
          system.ts                # system status
        ws/
          console-handler.ts       # bidireksjonell konsoll via WebSocket
          events-handler.ts        # global event broadcast
        services/
          event-bus.ts             # in-process EventEmitter
          status-monitor.ts        # poller alle noder, emitter events
          player-query.ts          # spillerantall via query protocols
          update-checker.ts        # sjekker for nye Docker-images
          port-allocator.ts        # finner ledige porter per node

    client/                        # @gamepanel/client
      src/
        app-shell.ts               # nav + route outlet
        router.ts                  # History API router
        pages/
          dashboard-page.ts        # grid av server-cards (alle noder)
          server-page.ts           # konsoll + config + filer + kontroller
          nodes-page.ts            # nodeoversikt
          node-page.ts             # node-detaljer
          login-page.ts
          profile-page.ts
          status-page.ts           # offentlig statusside (uten innlogging)
        components/
          server-card.ts           # kort med status, spillere, node, porter
          server-console.ts        # terminal med WebSocket
          server-controls.ts       # start/stop/restart/update knapper
          server-config.ts         # dynamisk config form builder
          file-manager.ts          # bla, last opp/ned, rediger filer
          create-server-dialog.ts  # template-velger + node-velger + config-form
          notification-panel.ts    # varslingsliste i navbar
          resource-bar.ts          # CPU/RAM/disk per node
          status-badge.ts
          port-display.ts
          node-badge.ts
          toast-notification.ts
        services/
          api.ts                   # typed fetch wrapper
          ws.ts                    # WebSocket med auto-reconnect
          auth.ts                  # login state
        styles/
          theme.css                # CSS custom properties (dark theme default)
          reset.css

  docs/                            # dokumentasjon
    architecture.md                # denne filen
    api.md                         # API-referanse
    templates.md                   # template-system og dynamisk GUI
    features.md                    # funksjoner i detalj
    database.md                    # datamodell og auth
    design-guidelines.md           # UI/UX retningslinjer
    roadmap.md                     # faser og utviklingsplan
```

---

## Installasjon — setup.sh

Guidet shell-script for Ubuntu Server:

```
1. Sjekk at vi kjorer pa Linux
2. Installer Docker (om ikke allerede installert)
3. Installer Node.js (LTS via nodesource)
4. Klon/last ned GamePanel
5. npm install + npm run build
6. Opprett data/ katalog
7. Sett admin-brukernavn/passord (interaktiv prompt)
8. Opprett systemd service for GamePanel
9. Start tjenesten
10. Vis URL og porter
```

For remote noder: `setup-node.sh` installerer Docker og konfigurerer TCP+TLS.

---

## Relatert dokumentasjon

- [API-referanse](api.md) — REST-endepunkter, WebSocket-protokoll, event-format
- [Templates](templates.md) — Game template system, dynamisk GUI, presets
- [Funksjoner](features.md) — Konsoll, filbehandler, spillerantall, ressurser, varsling, oppdatering
- [Database](database.md) — Datamodell, autentisering, roller
- [Design-retningslinjer](design-guidelines.md) — UI/UX, Bootstrap, light/dark mode
- [Roadmap](roadmap.md) — Faser, kjente utfordringer, verifikasjon
