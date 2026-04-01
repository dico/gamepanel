# GamePanel — Deployment og utviklingsmiljo

## Oversikt

GamePanel har to deployment-modeller:
1. **Panel** — Fullstendig installasjon med frontend, backend og lokal Docker-node
2. **Node** — Kun Docker-agent som kobles til et eksisterende panel

Begge settes opp med one-liner fra GitHub. Utviklingsmiljoet bruker Samba-share
for live-utvikling fra Windows mot Linux-serveren.

---

## Utviklingsmiljo (dev)

### Oppsett

```
Windows PC (VS Code)
    |
    |--- Samba share (\\server\gamepanel) -> /opt/gamepanel
    |
Ubuntu Server
    |--- Node.js (backend med hot reload via tsx watch)
    |--- Vite (frontend med HMR)
    |--- Docker (spillcontainere)
```

- Koden ligger pa Ubuntu-serveren under `/opt/gamepanel`
- Samba deler mappen som en Windows-share
- VS Code pa Windows redigerer filer direkte via nettverksshare
- Backend: `tsx watch` restarter ved filendringer
- Frontend: Vite HMR oppdaterer browser live
- Docker kjorer spillcontainere pa samme server

### Fordeler

- Koden kjorer pa Linux (produksjonsmiljo) fra dag 1
- Ingen "det fungerer pa min maskin"-problemer
- Hot reload for bade frontend og backend
- Docker er allerede tilgjengelig — ingen ekstra oppsett

---

## Produksjon — Panel (fullstendig installasjon)

### One-liner

```bash
curl -sSL https://raw.githubusercontent.com/<repo>/main/setup.sh | bash
```

### Hva setup.sh gjor

```
1. Sjekk at vi kjorer pa Linux (Ubuntu/Debian)
2. Installer avhengigheter (curl, git)
3. Installer Docker (om ikke installert)
4. Installer Node.js LTS (via nodesource)
5. Klon GamePanel repo til /opt/gamepanel
6. npm install + npm run build
7. Opprett data/ katalog
8. Guidet oppsett:
   a. Admin brukernavn + passord
   b. Panel-port (default 3000)
   c. Generer panel API-nokkel (for node-tilkobling)
9. Opprett systemd service
10. Start tjenesten
11. Vis:
    - Panel URL: http://<ip>:3000
    - Admin brukernavn
    - Panel API-nokkel (for a koble til noder)
    - One-liner for node-oppsett
```

### Systemd service

```ini
[Unit]
Description=GamePanel
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=gamepanel
WorkingDirectory=/opt/gamepanel
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/gamepanel/.env

[Install]
WantedBy=multi-user.target
```

---

## Produksjon — Node (kun Docker-agent)

### One-liner

```bash
curl -sSL https://raw.githubusercontent.com/<repo>/main/setup-node.sh | bash -s -- \
  --panel-url https://panel.example.com \
  --api-key gp_xxxxxxxxxxxxxxxxxxxx
```

### Node-onboarding flyt

```
1. Admin installerer Panel (setup.sh)
2. Panel genererer en API-nokkel ved installasjon
3. API-nokkelen vises ogsa i Panel UI: Nodes -> "Legg til node" -> kopierer one-liner
4. Admin kjorer one-liner pa ny maskin (setup-node.sh)
5. setup-node.sh:
   a. Installer Docker
   b. Konfigurer Docker TCP med TLS (port 2376)
   c. Generer TLS-sertifikater (CA signert av panel, eller self-signed + manuell trust)
   d. Registrer seg mot Panel API med API-nokkelen
   e. Panel lagrer node-info (host, TLS-config) i databasen
6. Node dukker opp i Panel UI som "online"
```

### Alternativ: Enkel onboarding (MVP)

For MVP kan vi forenkle TLS-oppsettet:

```
1. Panel UI: "Legg til node" -> genererer en node-token (engangsbruk)
2. Viser one-liner: curl ... | bash -s -- --token <engangstoken>
3. setup-node.sh:
   a. Installer Docker
   b. Konfigurer Docker TCP pa port 2376
   c. Generer self-signed TLS-sertifikat
   d. POST til panel med token + sertifikatinfo
   e. Panel lagrer node-tilkobling
4. Token utgaar etter bruk (kan ikke gjenbrukes)
```

### API for node-registrering

```
POST /api/nodes/register
Headers: Authorization: Bearer <node-token>
Body: {
  "hostname": "lan-server-2",
  "docker_host": "tcp://192.168.1.50:2376",
  "tls_cert": "<base64 cert>",
  "tls_key": "<base64 key>",
  "tls_ca": "<base64 ca>"
}
```

### Hva setup-node.sh gjor

```
1. Sjekk Linux
2. Installer Docker
3. Opprett TLS-sertifikater for Docker daemon
4. Konfigurer Docker daemon (/etc/docker/daemon.json):
   {
     "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
     "tls": true,
     "tlscacert": "/etc/docker/tls/ca.pem",
     "tlscert": "/etc/docker/tls/server-cert.pem",
     "tlskey": "/etc/docker/tls/server-key.pem",
     "tlsverify": true
   }
5. Restart Docker daemon
6. Registrer mot panel API
7. Vis bekreftelse
```

---

## Database-stotte for node-onboarding

```sql
-- Engangs-tokens for node-registrering
CREATE TABLE node_tokens (
  id         TEXT PRIMARY KEY,         -- nanoid
  token_hash TEXT NOT NULL,            -- bcrypt
  name       TEXT,                     -- valgfritt: "LAN-server 2"
  used       INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,            -- utloper etter f.eks. 1 time
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### API for token-generering (Panel UI)

```
POST   /api/nodes/tokens              # generer node-token
GET    /api/nodes/tokens              # liste aktive tokens
DELETE /api/nodes/tokens/:id          # slett/tilbakekall token
```

---

## Oppdatering av Panel

```bash
cd /opt/gamepanel
git pull
npm install
npm run build
sudo systemctl restart gamepanel
```

Kan automatiseres med et `update.sh` script.

---

## Mappestruktur pa server

```
/opt/gamepanel/                    # kode (git repo)
  packages/
  templates/
  docs/
  setup.sh
  setup-node.sh
  .env                             # produksjons-config (gitignored)

/opt/gamepanel/data/               # runtime data (gitignored)
  gamepanel.db                     # database
  servers/                         # server-volumer
    {id}/data/                     # mountet inn i containere
  backups/                         # backup-filer
```

---

## Relatert dokumentasjon

- [Arkitektur](architecture.md) — Tech stack og prosjektstruktur
- [Database](database.md) — Datamodell inkl. node_tokens
- [Roadmap](roadmap.md) — Faser og utviklingsplan
