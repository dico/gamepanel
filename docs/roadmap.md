# GamePanel — Roadmap

## Faser

### MVP (Fase 1) — Kjor servere

Malet er et fungerende panel som kan erstatte AMP for grunnleggende bruk.

- Opprett/start/stopp/restart/slett/oppdater spillservere (pull & recreate)
- Minecraft Java + CS2 templates
- Dynamisk konfigurasjon-GUI drevet av template JSON (form builder)
- Presets — lagre, gjenbruke og bulk-opprette servere fra maler
- Sanntidskonsoll via WebSocket (log streaming)
- Dashboard med server-cards og live status
- Spillerantall pa dashboard og server-side (query protocol per spill)
- Tilkoblingsinfo med kopier-knapp
- Portoversikt
- Filbehandler (bla, rediger, last opp/ned, slett)
- Ressursoversikt per node (CPU, RAM, disk)
- Varslingssystem i UI (badge, panel, toast)
- Brukermodell i DB med default admin (rolle-sjekk i backend fra dag 1)
- Session-basert autentisering + API-tokens
- Audit log pa alle handlinger
- Profil-side (bytt passord, administrer API-tokens)
- Template-system fra JSON
- SQLite persistering
- Lokal node (single-node oppsett)
- Linux (Ubuntu Server)
- setup.sh for guidet installasjon
- Light/dark mode

### Fase 2 — Multi-node og livskvalitet

Utvidelse for LAN-party med flere maskiner og daglig drift.

- Multi-node stotte (remote Docker hosts via TCP/TLS)
- setup-node.sh for remote noder
- Offentlig statusside per server (valgfri, uten innlogging)
- Ressursbegrensninger (minne/CPU per container)
- Automatisk sjekk for nye image-versjoner (periodisk)
- Docker housekeeping (prune, disk-oversikt)
- Audit log viewer i UI
- Auto-restart ved krasj (Docker restart policy)
- Planlagte oppgaver (restart kl 04:00)
- Backup-system (zip server-volum, metadata i backups-tabell)
- ANSI-farge i konsoll
- Importer eksisterende Docker-containere

### Fase 3 — Avansert

Funksjoner for mer avansert bruk og flere brukere.

- Multi-bruker UI (brukeradministrasjon, invitasjoner)
- Rolle-basert tilgangskontroll i UI (admin/operator/viewer)
- Ekstern varsling (Discord-webhook, ntfy.sh, e-post)
- RCON-stotte
- Oppdateringssjekker med automatisk varsling for nye Docker-images
- Metrikk-historikk (CPU/minne over tid, grafer)
- **Template-editor i nettleseren:**
  - Opprett nye templates direkte i UI (JSON-editor med validering)
  - Dupliser eksisterende template som utgangspunkt for ny
  - Rediger template-felter (docker image, porter, env, config) uten a redigere JSON-filer
  - Nyttig for rask testing av nye Docker-images uten a ssh-e inn
  - Eksporter/importer templates som JSON
- Template-markedsplass / community repository

---

## Kjente utfordringer

1. **Container stdin:** Ikke alle spill leser stdin rent. `console.type` i template stotter `stdin`, `rcon`, `exec` som alternativer.

2. **Log-volum:** Konsoll-WebSocket streamer kun mens klient er tilkoblet. Log-streamer detacher fra container nar ingen lytter. Buffer maks 1000 linjer i minnet.

3. **Port-konflikter:** `port-allocator.ts` sjekker bade SQLite og prober host-port med TCP connect for a unnga konflikter med andre tjenester.

4. **Remote fil-operasjoner:** For remote noder brukes `docker cp`/`exec` i stedet for direkte filsystem-tilgang. Kan vaere tregere for store filer.

5. **Config-synkronisering:** Managed fields skrives til config-filer ved server-start og config-lagring. Andre felt i samme fil rores ikke — kun managed keys oppdateres.

6. **Minecraft-oppdatering:** Image og spillversjon er uavhengige. Template-systemet hanterer dette med `update.type: "image+version"` og separat versjonsstyring via env var.

7. **Docker image digest-sjekk:** Krever tilgang til registry API. For private registries kan dette kreve autentisering. Offentlige images (Docker Hub) fungerer uten ekstra config.

---

## Verifikasjon (MVP)

1. Kjor `setup.sh` pa en ren Ubuntu Server — verifiser at alt installeres
2. Logg inn via `/login` med admin-bruker
3. Opprett en Minecraft-server via UI -> verifiser at Docker-container startes
4. Apne konsoll -> verifiser at logger streames live via WebSocket
5. Send en kommando (f.eks. `/list`) -> verifiser at den utfores
6. Stopp/start -> verifiser at dashboard oppdateres i sanntid
7. Sjekk spillerantall pa dashboard-kort
8. Rediger whitelist via filbehandler -> verifiser at endringer persisteres
9. Endre managed config (f.eks. whitelist on/off) -> verifiser at server.properties oppdateres
10. Opprett et preset fra serveren og deploy 2 nye servere fra det
11. Pull & recreate -> verifiser at serveren starter med nytt image og beholder data
12. Sjekk ressursoversikt -> verifiser CPU/RAM/disk vises riktig
13. Trigger en varsling (stopp en server) -> verifiser toast og varslingspanel
14. Bytt mellom light/dark mode
15. Test API-token: opprett token, bruk med curl mot API
