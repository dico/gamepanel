# GamePanel — Template-system

## Oversikt

Hvert spill defineres i en JSON-fil i `templates/`-mappen. Templaten beskriver alt
panelet trenger for a kjore og konfigurere et spill: Docker-image, porter, volumes,
konfigurerbare innstillinger og oppdateringsmetode.

**Nytt spill = ny JSON-fil. Ingen kodeendringer.**

---

## Template-format

### Komplett eksempel: Minecraft Java Edition

```json
{
  "slug": "minecraft-java",
  "name": "Minecraft Java Edition",
  "icon": "minecraft.svg",
  "image": "minecraft-java.jpg",
  "category": "survival",

  "docker": {
    "image": "itzg/minecraft-server:latest",
    "stop_signal": "SIGTERM",
    "stop_timeout": 30
  },

  "ports": [
    {
      "name": "Game",
      "container": 25565,
      "protocol": "tcp",
      "default_host": 25565
    }
  ],

  "volumes": [
    {
      "name": "Server Data",
      "container": "/data"
    }
  ],

  "console": {
    "type": "stdin",
    "charset": "utf-8"
  },

  "query": {
    "type": "minecraft",
    "port": 25565
  },

  "update": {
    "type": "image+version",
    "version_env": "VERSION",
    "version_values": {
      "type": "dynamic",
      "source": "https://launchermeta.mojang.com/mc/game/version_manifest.json",
      "description": "Hentes fra Mojangs API"
    },
    "description": "Image-oppdatering og Minecraft-versjon er uavhengige"
  },

  "config_groups": [
    { "id": "general", "label": "Generelt", "order": 1 },
    { "id": "access", "label": "Tilgang og whitelist", "order": 2 },
    { "id": "gameplay", "label": "Gameplay", "order": 3 },
    { "id": "performance", "label": "Ytelse", "order": 4, "advanced": true }
  ],

  "environment": {
    "fixed": { "EULA": "TRUE" },
    "configurable": [
      {
        "key": "VERSION",
        "label": "Minecraft Version",
        "type": "string",
        "default": "LATEST",
        "group": "general"
      },
      {
        "key": "MEMORY",
        "label": "Memory (MB)",
        "type": "number",
        "default": 2048,
        "group": "performance",
        "validation": { "min": 512, "max": 16384 }
      }
    ]
  },

  "config_files": [
    {
      "name": "server.properties",
      "path": "/data/server.properties",
      "format": "properties",
      "managed_fields": [
        {
          "key": "motd",
          "label": "Server Message (MOTD)",
          "type": "string",
          "default": "A Minecraft Server",
          "group": "general"
        },
        {
          "key": "gamemode",
          "label": "Game Mode",
          "type": "select",
          "options": ["survival", "creative", "adventure", "spectator"],
          "default": "survival",
          "group": "gameplay"
        },
        {
          "key": "difficulty",
          "label": "Difficulty",
          "type": "select",
          "options": ["peaceful", "easy", "normal", "hard"],
          "default": "normal",
          "group": "gameplay"
        },
        {
          "key": "pvp",
          "label": "PvP",
          "type": "boolean",
          "default": true,
          "group": "gameplay"
        },
        {
          "key": "max-players",
          "label": "Max Players",
          "type": "number",
          "default": 20,
          "group": "general",
          "validation": { "min": 1, "max": 100 }
        },
        {
          "key": "white-list",
          "label": "Enable Whitelist",
          "type": "boolean",
          "default": false,
          "group": "access"
        },
        {
          "key": "enforce-whitelist",
          "label": "Enforce Whitelist",
          "type": "boolean",
          "default": false,
          "group": "access",
          "depends_on": { "key": "white-list", "value": true }
        },
        {
          "key": "online-mode",
          "label": "Online Mode (Mojang auth)",
          "type": "boolean",
          "default": true,
          "group": "access"
        }
      ]
    },
    {
      "name": "whitelist.json",
      "path": "/data/whitelist.json",
      "format": "json",
      "description": "Rediger via filbehandler — legg til spillernavn/UUID"
    },
    {
      "name": "ops.json",
      "path": "/data/ops.json",
      "format": "json",
      "description": "Rediger via filbehandler — legg til operatorer"
    }
  ]
}
```

### Eksempel: CS2

```json
{
  "slug": "cs2",
  "name": "Counter-Strike 2",
  "icon": "cs2.svg",
  "image": "cs2.jpg",
  "category": "fps",

  "docker": {
    "image": "joedwards32/cs2:latest",
    "stop_signal": "SIGTERM",
    "stop_timeout": 15
  },

  "ports": [
    {
      "name": "Game",
      "container": 27015,
      "protocol": "udp",
      "default_host": 27015
    },
    {
      "name": "RCON",
      "container": 27015,
      "protocol": "tcp",
      "default_host": 27015
    }
  ],

  "volumes": [
    {
      "name": "Server Data",
      "container": "/home/steam/cs2-dedicated"
    }
  ],

  "console": {
    "type": "stdin",
    "charset": "utf-8"
  },

  "query": {
    "type": "source",
    "port": 27015
  },

  "update": {
    "type": "auto",
    "description": "Serveren oppdateres automatisk ved restart via SteamCMD"
  },

  "config_groups": [
    { "id": "general", "label": "Generelt", "order": 1 },
    { "id": "gameplay", "label": "Gameplay", "order": 2 }
  ],

  "environment": {
    "fixed": {},
    "configurable": [
      {
        "key": "CS2_SERVERNAME",
        "label": "Server Name",
        "type": "string",
        "default": "GamePanel CS2",
        "group": "general"
      },
      {
        "key": "CS2_MAXPLAYERS",
        "label": "Max Players",
        "type": "number",
        "default": 16,
        "group": "general"
      },
      {
        "key": "CS2_GAMETYPE",
        "label": "Game Type",
        "type": "select",
        "options": ["0", "1", "2", "3"],
        "default": "0",
        "group": "gameplay"
      },
      {
        "key": "CS2_RCONPW",
        "label": "RCON Password",
        "type": "password",
        "default": "",
        "group": "general"
      }
    ]
  },

  "config_files": []
}
```

---

## Konfigurasjonsstyring — Panelet er kilden til sannhet

Et av hovedproblemene med AMP er at konfigurasjon kan endres bade i panelet og direkte
i filer, og de overskrives. GamePanel loser dette slik:

1. **Managed fields:** Innstillinger definert i `config_files[].managed_fields` styres
   kun via UI. Panelet skriver disse til config-filen nar serveren startes eller config lagres.
2. **Filbehandler for resten:** Alt annet (plugins, whitelist-oppforinger, custom config)
   redigeres via filbehandleren. Disse rores ikke av panelet.
3. **Tydelig skille:** UI-en viser tydelig hva som er "managed" (skjemafelt i config-tab)
   og hva som ma redigeres via filbehandler.

---

## Dynamisk GUI — Template-drevet konfigurasjon

Hvert spill har helt forskjellig struktur og innstillinger. GUI-en kan derfor
ikke vaere hardkodet — den bygges dynamisk fra templatens JSON-definisjon.

### Prinsipp

Templaten beskriver **hva** som kan konfigureres. Frontend har en **form builder** som
leser template-definisjonen og rendrer riktige input-felter, gruppert i seksjoner.
Backend validerer mot samme definisjon.

### Felt-definisjon

Feltene i `environment.configurable` og `config_files[].managed_fields` bruker et
felles skjema med stotte for gruppering, betingelser og validering:

```json
{
  "key": "MAX_PLAYERS",
  "label": "Max Players",
  "type": "number",
  "default": 20,
  "group": "general",
  "description": "Maks antall spillere som kan vaere tilkoblet samtidig",
  "validation": { "min": 1, "max": 100 },
  "depends_on": null
}
```

### Stottede felttyper

| Type | Rendres som | Eksempel |
|------|-------------|----------|
| `string` | Tekstfelt | Server name, MOTD |
| `number` | Tallfelt med min/max | Max players, memory |
| `boolean` | Toggle/switch | Whitelist, PvP |
| `select` | Dropdown | Game mode, difficulty |
| `password` | Passord-felt (skjult) | RCON password |
| `text` | Textarea (flerlinjet) | Custom MOTD, welcome message |
| `list` | Tag-input / liste | Whitelist-spillere, banned IPs |

### Gruppering i UI

Grupper defineres i `config_groups`. GUI-en rendrer disse som seksjoner.
Grupper med `"advanced": true` er skjult bak en "Vis avanserte innstillinger"-toggle.

```json
{
  "config_groups": [
    { "id": "general", "label": "Generelt", "order": 1 },
    { "id": "access", "label": "Tilgang", "order": 2 },
    { "id": "gameplay", "label": "Gameplay", "order": 3 },
    { "id": "performance", "label": "Ytelse", "order": 4, "advanced": true }
  ]
}
```

### Betingede felt (`depends_on`)

Noen felt er kun relevante nar andre felt har en bestemt verdi:

```json
{
  "key": "enforce-whitelist",
  "depends_on": { "key": "white-list", "value": true }
}
```

Feltet vises kun nar whitelist er aktivert. Verdien ignoreres av backend nar
betingelsen ikke er oppfylt.

### Form builder i frontend

Frontend har en generisk `config-form` komponent som:

1. Leser template-definisjonen for gjeldende spill
2. Grupperer felt etter `config_groups`
3. Rendrer riktig input-type per felt
4. Viser/skjuler felt basert pa `depends_on`
5. Skjuler `advanced`-grupper bak toggle
6. Validerer i frontend (basert pa `validation`) og backend dobbelsjekker

Samme komponent fungerer for Minecraft, CS2, Valheim — hva som helst. Null spillspesifikk
UI-kode. Alt drives av JSON.

---

## Presets — Maler for rask utrulling

Et preset er en lagret konfigurasjon som kan gjenbrukes for a opprette nye servere.
Spesielt nyttig pa LAN-party der du trenger 4 identiske CS2-servere eller 2 Minecraft-
servere med samme innstillinger.

### Konsept

```
Template (spill-definisjon)    ->   Preset (lagret config)    ->   Server (kjorende instans)
minecraft-java.json                 "LAN Survival"                  "LAN Survival #1"
                                    mode=survival                   "LAN Survival #2"
                                    max_players=10
                                    whitelist=true
```

- En **template** beskriver hva som KAN konfigureres
- Et **preset** er et sett med verdier for en bestemt template
- En **server** opprettes fra et preset (eller direkte fra template med manuelle verdier)

### Preset-format

```json
{
  "id": "preset-abc123",
  "name": "LAN Survival",
  "template_slug": "minecraft-java",
  "description": "Survival med whitelist, 10 spillere, hard difficulty",
  "environment": {
    "VERSION": "1.21.4",
    "MEMORY": "4096"
  },
  "config_values": {
    "gamemode": "survival",
    "difficulty": "hard",
    "max-players": "10",
    "white-list": "true",
    "enforce-whitelist": "true",
    "pvp": "true"
  },
  "ports_offset": 0
}
```

### Bulk-opprettelse

Nar du oppretter fra et preset kan du velge antall servere:

```
Opprett server fra preset
  Preset:  [LAN Survival]
  Antall:  [4]
  Node:    [Lokal]
  Navnemal: LAN Survival #{n}

  -> Oppretter:
     "LAN Survival #1" (port 25565)
     "LAN Survival #2" (port 25566)
     "LAN Survival #3" (port 25567)
     "LAN Survival #4" (port 25568)
```

Porter auto-inkrementeres fra templatens `default_host`. Brukeren kan overstyre.

### Eksporter/importer presets

Presets kan eksporteres som JSON-fil og deles:
- Dele LAN-oppsett med andre
- Gjenbruke config pa tvers av installasjoner
- Versjonskontroll av server-config

### Opprett preset fra eksisterende server

"Lagre som preset" fra en kjorende servers config-side. Tar alle navarende
verdier og lagrer som nytt preset.

---

## Server-oppdatering (Pull & Recreate)

Spillservere kjorer i community Docker-images. Nar det kommer oppdateringer ma
vi kunne oppdatere uten a miste data.

### Prinsipp: Pull + Recreate

Samme konsept som Portainer:

```
1. docker pull <image>:latest        # hent nytt image
2. docker stop <container>           # stopp kjorende server
3. docker rm <container>             # slett gammel container
4. docker create ... (same config)   # opprett ny container med nytt image
5. docker start <container>          # start
```

All config bevares — containeren gjenskapes med noyaktig samme innstillinger fra databasen.

### Oppdateringstyper (definert per template)

#### Type 1: `image` — Image = spillversjon

CS2, Valheim, Satisfactory osv. Pull & recreate er alt som trengs.

```json
{ "update": { "type": "image" } }
```

#### Type 2: `image+version` — Separat spillversjon (Minecraft)

Image-oppdatering gir ny wrapper. Minecraft-versjonen styres via env var separat.

```json
{
  "update": {
    "type": "image+version",
    "version_env": "VERSION",
    "version_values": {
      "type": "dynamic",
      "source": "https://launchermeta.mojang.com/mc/game/version_manifest.json"
    }
  }
}
```

UI viser to separate oppdateringsvalg: image og spillversjon.

#### Type 3: `auto` — Auto-update ved oppstart

Spill som auto-oppdaterer via SteamCMD. Bare restart.

```json
{ "update": { "type": "auto" } }
```

### Sjekk for nye images

Lokal image digest sammenlignes med remote registry periodisk (hver 6. time).
Ved ny versjon sendes varsling.

### Backup for oppdatering

Panelet tilbyr automatisk backup for oppdatering (anbefalt, valgfritt).

### Bilder og ikoner

Spillbilder og ikoner ligger i repoet og legges inn manuelt:

- `templates/images/` — profilbilder/bannere per spill (jpg/png)
- `templates/icons/` — sma ikoner (svg) for cards og navbar

Refereres i template: `"icon": "minecraft.svg"`, `"image": "minecraft-java.jpg"`.
Ingen opplastings-UI — bildene folger med templatene.
