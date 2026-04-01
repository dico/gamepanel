# GamePanel — API-referanse

## Oversikt

REST API for CRUD-operasjoner, WebSocket for sanntidsdata.
Alle endepunkter krever autentisering (session cookie eller Bearer token)
med mindre annet er spesifisert.

---

## REST — Servere

```
GET    /api/servers                 # liste alle servere (alle noder), med status
POST   /api/servers                 # opprett fra template pa valgt node
GET    /api/servers/:id             # detaljer
PATCH  /api/servers/:id             # oppdater config
DELETE /api/servers/:id             # stopp + slett container + record

POST   /api/servers/:id/start
POST   /api/servers/:id/stop
POST   /api/servers/:id/restart
POST   /api/servers/:id/command     # send konsollkommando (alternativ til WS)
POST   /api/servers/:id/recreate    # stopp + fjern + opprett + start med samme config
POST   /api/servers/:id/update      # pull nytt image + recreate
GET    /api/servers/:id/update-check # sjekk om ny image-versjon finnes
POST   /api/servers/:id/save-preset # lagre kjorende servers config som preset
```

---

## REST — Filer (per server)

```
GET    /api/servers/:id/files?path=/     # list filer i katalog
GET    /api/servers/:id/files/read?path=/server.properties  # les fil
PUT    /api/servers/:id/files/write      # skriv fil { path, content }
DELETE /api/servers/:id/files?path=/...  # slett fil
POST   /api/servers/:id/files/upload     # last opp fil (multipart)
GET    /api/servers/:id/files/download?path=/...  # last ned fil
```

---

## REST — Noder

```
GET    /api/nodes                   # liste alle noder med status
POST   /api/nodes                   # legg til node
GET    /api/nodes/:id               # node-detaljer (Docker info, ressurser)
PATCH  /api/nodes/:id               # oppdater node-config
DELETE /api/nodes/:id               # fjern node (flytter ikke servere automatisk)
GET    /api/nodes/:id/status        # detaljert Docker-status, disk, minne
```

---

## REST — Auth og brukere

```
POST   /api/auth/login              # login -> session cookie
POST   /api/auth/logout             # slett session
GET    /api/auth/me                 # hent innlogget bruker

GET    /api/profile                 # egen profil
PATCH  /api/profile                 # oppdater display name
POST   /api/profile/password        # bytt passord
GET    /api/profile/tokens          # liste API-tokens
POST   /api/profile/tokens          # opprett API-token
DELETE /api/profile/tokens/:id      # slett API-token

# Forberedt for fase 3 (admin-only, ikke eksponert i MVP-UI)
GET    /api/users                   # liste brukere
POST   /api/users                   # opprett bruker
PATCH  /api/users/:id               # oppdater bruker/rolle
DELETE /api/users/:id               # slett bruker
```

---

## REST — Presets

```
GET    /api/presets                  # liste alle presets
GET    /api/presets/:id             # preset-detaljer
POST   /api/presets                  # opprett preset
PATCH  /api/presets/:id             # oppdater preset
DELETE /api/presets/:id             # slett preset
POST   /api/presets/:id/deploy      # opprett server(e) fra preset { count, node_id, name_template }
POST   /api/presets/import          # importer preset fra JSON
GET    /api/presets/:id/export      # eksporter preset som JSON
```

---

## REST — Varsling

```
GET    /api/notifications              # liste (paginert, filtrerbar pa level/read)
PATCH  /api/notifications/:id/read     # marker som lest
POST   /api/notifications/read-all     # marker alle som lest
DELETE /api/notifications/:id          # slett
```

---

## REST — Docker management

```
GET    /api/docker/images              # liste images med storrelse og bruk
POST   /api/docker/images/pull         # pull image { image, tag }
DELETE /api/docker/images/:id          # slett ubrukt image
POST   /api/docker/prune              # rydd opp (ubrukte images, stoppede containere)
GET    /api/docker/disk-usage          # docker system df per node
```

---

## REST — Templates og system

```
GET    /api/templates               # tilgjengelige spilltemplates
GET    /api/templates/:slug
GET    /api/system/status           # samlet status for alle noder
GET    /api/audit-log               # audit log (admin-only, paginert)
```

---

## Offentlige endepunkter (ingen auth)

```
GET    /status/:id                  # offentlig statusside for en server (kan deaktiveres)
```

---

## WebSocket

### Konsoll

```
WS  /ws/servers/:id/console        # bidireksjonell: motta logger, send kommandoer
```

- Ved tilkobling sendes de siste 500 linjene som historikk
- Deretter live-stream av stdout/stderr
- Klient sender kommandoer som tekstmeldinger
- Tilkoblingen lukkes nar brukeren navigerer vekk

### Global event-bus

```
WS  /ws/events                     # global: status-endringer for live dashboard
```

Alle klienter kobler til denne ved innlogging. Broadkaster sanntidsendringer
slik at dashboardet oppdateres uten polling.

### Event-format

```typescript
type WsEvent =
  | { type: 'server:status'; serverId: string; nodeId: string; status: 'running' | 'stopped' | 'error' }
  | { type: 'server:stats'; serverId: string; cpu: number; memory: number }
  | { type: 'server:players'; serverId: string; online: number; max: number; players: string[] }
  | { type: 'server:created'; serverId: string; nodeId: string }
  | { type: 'server:deleted'; serverId: string }
  | { type: 'node:status'; nodeId: string; status: 'online' | 'offline' }
  | { type: 'node:resources'; nodeId: string; cpu: number; memoryUsed: number; memoryTotal: number; diskUsed: number; diskTotal: number }
  | { type: 'notification'; id: string; level: 'critical' | 'warning' | 'info'; title: string; message: string };
```
