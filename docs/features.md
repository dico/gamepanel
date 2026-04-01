# GamePanel — Funksjoner

## Sanntidskonsoll

Konsollen er den viktigste enkeltfunksjonen — streamer serverlogger live og
lar admin sende kommandoer direkte til spillserveren.

### Teknisk

- WebSocket-tilkobling til `/ws/servers/:id/console`
- Ved tilkobling sendes de siste 500 linjene som historikk
- Deretter live-stream av container stdout/stderr via Dockerode `container.attach()`
- Kommandoer skrives til container stdin
- Tilkoblingen lukkes nar brukeren navigerer vekk — containeren fortsetter a kjore
- Mest universell metode: de fleste spill leser stdin for konsollkommandoer

### UI

- Monospace font (JetBrains Mono / Fira Code)
- Alltid mork bakgrunn uavhengig av tema
- Auto-scroll til bunn, stopper om bruker har scrollet opp
- Input-felt i bunnen med prompt-symbol (>)
- Kommandohistorikk med piltaster (opp/ned)
- Tydelig visuelt skille mellom brukerkommandoer og server-output

### Template-stotte

`console.type` i template definerer kommandometode:
- `stdin` — skriv direkte til container stdin (standard, mest universell)
- `rcon` — RCON-protokoll for spill som stotter det
- `exec` — `docker exec` for spesielle tilfeller

---

## Filbehandler

Gir tilgang til spillserverens filer — viktig for plugins, whitelist og manuell config.

### Funksjonalitet

- **Bla i kataloger:** Vis filer og mapper i serverens volum
- **Rediger tekstfiler:** Innebygd editor for .properties, .json, .yml, .txt, .cfg
- **Last opp filer:** Dra-og-slipp for plugins (.jar), maps, resource packs
- **Last ned filer:** Eksporter filer og mapper
- **Slett filer:** Med bekreftelsesdialog

### Implementasjon

- Lokal node: opererer direkte pa `data/servers/{id}/data/`
- Remote noder: `docker cp` eller `docker exec` for a lese/skrive filer
- **Sikkerhet:** Path traversal-beskyttelse — alle stier valideres mot serverens rotmappe

---

## Tilkoblingsinfo

Nar en server kjorer ma det vaere enkelt a dele tilkoblingsdetaljene med spillere.

### Per server i UI

```
+-----------------------------------------------+
|  Tilkobling                          [Kopier]  |
|  192.168.1.5:25565                             |
|                                                |
|  Spill: Minecraft Java Edition                 |
|  Status: Running (3 av 10 spillere)            |
+-----------------------------------------------+
```

- Kopier-knapp kopierer IP:port til utklippstavlen
- Viser ekstern IP om konfigurert, ellers lokal/LAN-IP
- Porter vises per protokoll (TCP/UDP)

### Offentlig statusside (valgfri)

```
GET /status/:id     # offentlig, uten innlogging
```

Viser servernavn, spill, status, spillerantall og tilkoblingsadresse.
Ingen admin-funksjonalitet, ingen sensitiv info.
Kan slas av/pa per server. Av som standard.

Nyttig for a dele pa Discord: "Sjekk om serveren er oppe: https://panel.example.com/status/xk7f2q"

---

## Spillerantall (Query Protocol)

Viser antall tilkoblede spillere i sanntid pa dashboard og server-side.

### Stottede protokoller

| Type | Protokoll | Spill |
|------|-----------|-------|
| `minecraft` | Minecraft Server List Ping (TCP) | Minecraft Java |
| `minecraft-bedrock` | Bedrock ping (UDP) | Minecraft Bedrock |
| `source` | Source Query Protocol (A2S_INFO, UDP) | CS2, Garry's Mod, TF2 |
| `none` | Ingen query — kun Docker status | Spill uten query-stotte |

Defineres per template i `query`-seksjonen.

### Implementasjon

- Node-bibliotek: `gamedig` (universelt, stotter 100+ spill)
- Polles hvert 15. sekund fra backend
- Resultater caches og broadcastes via `/ws/events`
- Om query feiler vises "—"

### Visning

**Dashboard-kort:**
```
[Minecraft ikon]  LAN Survival
Running  |  3/10 spillere  |  192.168.1.5:25565
```

**Server-side (spillerliste om tilgjengelig):**
```
Spillere: 3 / 10
  - Steve
  - Alex
  - Notch
```

---

## Ressursoversikt

Viktig for hjemmehosting der ressursene er begrensede.

### Node-status

Hver node rapporterer:
- **CPU:** Bruk i prosent (totalt og per container)
- **Minne:** Brukt / tilgjengelig (totalt og per container)
- **Disk:** Brukt / tilgjengelig for data-katalogen
- **Docker:** Antall containere, images, disk brukt av Docker

### Visning

**Dashboard:** Kompakt ressurslinje per node.
```
[Hjemmeserver]  CPU: 34%  |  RAM: 6.2 / 16 GB  |  Disk: 120 / 500 GB
```

**Node-side:** Detaljert oversikt med per-server breakdown.

**Server-opprettelse:** Advarsel om noden har lite ressurser igjen.

### Implementasjon

- Docker API: `container.stats()` for per-container CPU/memory
- Systeminfo: `os` modul (lokal) eller `docker info` (remote)
- Polles hvert 10. sekund, broadcastes via `/ws/events`

---

## Varslingssystem

Panelet gir beskjed nar noe gar galt.

### Nivaer

| Niva | Eksempler |
|------|-----------|
| **Kritisk** | Server krasjet, node offline, disk >95% full |
| **Advarsel** | Disk >80%, server stoppet uventet, image utdatert |
| **Info** | Server startet, backup fullfort, ny image tilgjengelig |

### MVP — Varsling i UI

- Varslings-badge pa klokkeikon i navbar (antall uleste)
- Varslingspanel — dropdown med hendelser, nyeste forst
- Toast for kritiske hendelser mens brukeren er i panelet
- Lagres i database, synlig etter page refresh

### Fase 2+ utvidelser

- Discord-webhook
- E-post (SMTP)
- Pushover / ntfy.sh (self-hosted push notifications)

---

## Docker Housekeeping

### Funksjonalitet

- **Image-oversikt:** Images brukt av GamePanel, med storrelse
- **Oppdater image:** Pull nyeste versjon
- **Rydd opp:** Slett ubrukte images (`docker image prune`)
- **Disk-bruk:** Total Docker disk-bruk per node (`docker system df`)

### Sikkerhet

- Kun admin kan slette images og kjore prune
- Panelet nekter a slette images i bruk
- Bekreftelsesdialog for prune ("Dette frigjor ~2.3 GB. Fortsett?")
