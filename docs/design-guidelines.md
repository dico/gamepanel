# GamePanel — Design-retningslinjer

## Filosofi

**Less is more.** Vis det brukeren trenger, skjul resten. AMP viser alt pa en gang og
drukner brukeren i valg. GamePanel viser det viktigste — avanserte innstillinger er ett
klikk unna, men aldri i veien.

---

## Arkitekturprinsipper

### Modulaert og gjenbrukbart

All kode — backend og frontend — bygges modulaert med gjenbruk som forsteprioritet:

1. **Shared styles:** Alle felles CSS-regler (knapper, inputs, badges, kort, toggles) defineres EN gang i `shared.ts` og importeres i alle komponenter. Duplisert CSS er en bug.
2. **Komponent-isolasjon:** Lit Shadow DOM gir naturlig CSS-isolasjon, men basis-styling hentes alltid fra shared.
3. **Template-drevet UI:** Konfigurasjonsskjemaer bygges fra JSON-definisjoner, ikke hardkodet per spill. Nytt spill = ny JSON, null ny frontend-kode.
4. **Repository-monster:** Database-tilgang skjer via repositories med konsistente grensesnitt. Duplisert SQL er en bug.
5. **Enkle avhengigheter:** Minimal tredjepartskode. Vi bruker ren CSS, ikke Bootstrap eller andre CSS-rammeverk. Lit (~5KB) er eneste frontend-avhengighet.

### Vedlikeholdbarhet

- **Flat filstruktur:** Unnga dype nestede mapper. En komponent = en fil.
- **Navnekonvensjoner:** Filer bruker kebab-case, klasser PascalCase, variabler camelCase.
- **Ingen abstraksjoner for tings skyld:** Tre like linjer er bedre enn en prematur abstraksjon. Abstraher forst nar monsteret er tydelig og gjentatt 3+ ganger.
- **Kode som dokumentasjon:** Selvforklarende kode > kommentarer. Kommenter KUN ikke-opplagt logikk.

### Begrensninger vi bevisst unnga

- Ingen CSS-rammeverk (Bootstrap, Tailwind) — eget design med CSS custom properties
- Ingen state-management-bibliotek — Lit reactive properties + enkel service-modul
- Ingen build-pipeline for CSS — ren CSS, ingen SCSS/PostCSS
- Ingen ikonfont — unicode/emoji for naa, Lucide SVG-ikoner senere

---

## CSS-arkitektur

### Design tokens (CSS Custom Properties)

All visuell stil styres av custom properties i `:root`, definert i `theme.css`.
Komponenter bruker ALDRI hardkodede farger — alt refererer til tokens.

```
Bakgrunn:    --bg-primary, --bg-secondary, --bg-tertiary, --bg-hover
Tekst:       --text-primary, --text-secondary, --text-muted
Kanter:      --border, --border-light
Semantisk:   --accent, --success, --warning, --danger, --info
             --success-bg, --warning-bg, --danger-bg, --info-bg
Radius:      --radius (8px), --radius-sm (4px), --radius-lg (12px)
Typografi:   --font-sans, --font-mono
Layout:      --nav-height (56px)
```

### Fargepalett

Dark mode (standard):
- Bakgrunn: #0f1117 → #161b22 → #1c2129
- Tekst: #e1e4e8 → #8b949e → #484f58
- Accent: #58a6ff (blaa, GitHub-inspirert)
- Success: #3fb950, Danger: #f85149, Warning: #d29922

Light mode:
- Bakgrunn: #ffffff → #f6f8fa → #eef1f5
- Tekst: #1f2328 → #636c76 → #8b949e
- Accent: #0969da

### Shared Styles (`shared.ts`)

Felles Lit CSS-modul som alle komponenter importerer:

```typescript
import { sharedStyles } from '../styles/shared.js';

@customElement('my-component')
export class MyComponent extends LitElement {
  static styles = [sharedStyles, css`
    /* Komponent-spesifikk CSS her */
  `];
}
```

Shared styles inneholder:
- **Knapper:** `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger`, `.btn-sm`, `.btn-lg`, `.btn-ghost`
- **Skjemakontroller:** `input`, `select`, `textarea` — konsistent hoyde (42px), padding, border, focus-state
- **Toggles:** `.toggle` med custom checkbox-styling
- **Badges:** `.badge-running`, `.badge-stopped`, `.badge-error`, `.badge-creating`
- **Kort:** `.card`, `.card-header`
- **Status:** `.status-success`, `.status-error`, `.status-warning`
- **Layout:** `.empty` for tomme tilstander

### Regler for ny CSS

1. **Sjekk shared forst:** Finnes det allerede en klasse for dette? Bruk den.
2. **Er dette gjenbrukbart?** Legg det i shared.ts, ikke i komponenten.
3. **Er dette komponent-spesifikt?** Da horer det hjemme i komponentens `static styles`.
4. **Aldri hardkodede farger.** Bruk tokens.
5. **Konsistent spacing:** Bruk 4, 8, 12, 16, 20, 24, 32, 48, 64px.

---

## Light og Dark Mode

### Brukervalg med system-default

Tre innstillinger: **Light**, **Dark**, **System** (folger OS). Lagres i localStorage.
Dark er standard. Byttes med theme-toggle i navbar.

Implementert via `data-theme`-attributt pa `<html>`:
```css
:root { /* dark tokens */ }
[data-theme="light"] { /* light overrides */ }
```

---

## "Less is more" — Informasjonshierarki

### Prinsipp: Vis standarder, skjul avansert

Hvert grensesnitt har tre lag:

1. **Synlig:** Det brukeren trenger 90% av tiden
2. **Ett klikk unna:** Avanserte innstillinger bak toggle eller "Show advanced settings"
3. **Egen side/modal:** Sjelden brukte funksjoner (template-redigering, node-config)

### Eksempler

#### Server-opprettelse (Create Server dialog)

**Synlig:** Velg spill, servernavn, node
**Vises etter spillvalg:** Template-drevne config-felter fra `environment.configurable`
**Bak "Show advanced":** Grupper merket `advanced: true` i template

#### Server-side (tabs)

**Synlig:** Console (default), Configuration, Files, Info
**Handlinger:** Start/Stop/Restart/Recreate/Delete — synlige knapper over tabs

#### Dashboard server-card

**Synlig:** Servernavn, template, status-badge, porter, CPU/RAM (live via WS)
**Handlinger:** Start/Stop + Delete — synlige i kortet

---

## Navigasjonsstruktur

### Navbar (topp, sticky)

```
[GamePanel]    Servers    [notification-bell] [user (role)] [theme-toggle] [Logout]
```

- **Servers** er default landingsside
- **Notification bell** med ulest-badge, dropdown med varsler
- **Theme toggle** bytter dark/light
- **Logout** knapp

### Server-side (tabs)

```
← Back to servers

Server Name                                     [badge: running]
Template Name

[Start] [Stop] [Restart] [Recreate] [Delete]

[Console]  [Configuration]  [Files]  [Info]
```

---

## Komponent-retningslinjer

### Kort (server-cards pa dashboard)

- Klikkbart — navigerer til serverside
- Status-badge oppe til hoyre
- Template-navn under servernavn
- Porter i monospace
- Live CPU/RAM stats nar serveren kjorer (via WebSocket)
- Handlingsknapper nederst, stopper event-propagation

### Modaler / Dialoger

- Overlay med click-outside-to-close
- Maks 500px bredde
- Scroll i dialogen om innholdet er langt
- Cancel + primary action nederst til hoyre
- Brukes for opprettelse, bekreftelser — ikke for visning

### Skjemakontroller (inputs)

Konsistente maal og stil pa tvers av alle komponenter:

```
Hoyde:        42px (input, select)
Padding:      10px 12px
Border:       1px solid var(--border)
Border-radius: var(--radius) (8px)
Focus:        border-color: var(--accent)
Font:         14px var(--font-sans)
Select:       Custom chevron-ikon via SVG, appearance: none
```

Alle kontroller SKAL bruke shared styles for konsistens.

### Knapper

| Variant | Bruk | Klasse |
|---------|------|--------|
| Default | Sekundaerhandlinger | `.btn` |
| Primary | Hovedhandling (Opprett, Lagre) | `.btn .btn-primary` |
| Success | Positive handlinger (Start) | `.btn .btn-success` |
| Danger | Destruktive handlinger (Delete) | `.btn .btn-danger` |
| Ghost | Tertiare (ikoner, toggles) | `.btn .btn-ghost` |
| Small | Kompakte kontekster | `.btn .btn-sm` |

### Badges

| Status | Klasse | Farge |
|--------|--------|-------|
| Running | `.badge-running` | Gronn |
| Stopped | `.badge-stopped` | Gra |
| Error | `.badge-error` | Rod |
| Creating | `.badge-creating` | Blaa |
| Online | `.badge-online` | Gronn |
| Offline | `.badge-offline` | Gra |

---

## Konsoll-design

Konsollen er den viktigste enkeltkomponenten — den ma foles bra a bruke.

- **Monospace font:** JetBrains Mono / Fira Code via `var(--font-mono)`
- **Alltid mork bakgrunn** (#0d1117) uavhengig av tema
- Auto-scroll til bunn, stopper om bruker har scrollet opp
- Input-felt i bunnen med prompt-symbol (>)
- Kommandohistorikk med piltaster (opp/ned)
- Visuelt skille mellom brukerkommandoer (accent-farge) og server-output

---

## Config Form (Template-drevet)

Konfigurasjonsskjemaet bygges dynamisk fra template JSON:

- **Grupper:** Rendres som seksjoner med header (`config_groups`)
- **Felttyper:** string, number, boolean (toggle), select, password, text (textarea)
- **Betingede felt:** `depends_on` styrer synlighet
- **Avanserte grupper:** Skjult bak "Show advanced settings" toggle
- **Validering:** Frontend + backend sjekker min/max fra template
- **Dirty-state:** Save-knapp er disabled til noe er endret

---

## Filbehandler

- **To moduser:** Browser (filtre) og Editor (tekstredigering)
- Breadcrumb-navigasjon med klikkbare stisegmenter
- Mapper vises forst, deretter filer — alfabetisk
- Teksteditor med monospace font og mork bakgrunn
- Save + Cancel + "Back to files" navigasjon
- Path traversal-beskyttelse i backend

---

## Typografi

- **UI-tekst:** Inter (eller system-ui) via `var(--font-sans)`
- **Kode/konsoll:** JetBrains Mono via `var(--font-mono)`
- **Storrelser:** 11px (hint), 12px (small), 13px (body), 14px (input), 16px (h3), 20px (h2), 24px (h1)

---

## Responsivitet

Panelet skal fungere pa:
- **Desktop (primaer):** Full layout med navbar + innhold
- **Tablet:** Kollapset navigasjon, men full funksjonalitet
- **Mobil:** Grunnleggende oversikt og start/stopp

Grid bruker CSS Grid med `auto-fill, minmax()` for automatisk responsivitet
uten media queries.

---

## Relatert dokumentasjon

- [Arkitektur](architecture.md) — Tech stack, prosjektstruktur, multi-node
- [API](api.md) — REST-endepunkter og WebSocket-protokoll
- [Templates](templates.md) — Dynamisk GUI, presets, oppdatering
- [Funksjoner](features.md) — Konsoll, filbehandler, spillerantall, varsling
- [Database](database.md) — Datamodell, autentisering, roller
- [Roadmap](roadmap.md) — Faser og utviklingsplan
