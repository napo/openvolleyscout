# OpenVolleyScout

<p align="center">
  <img src="src/assets/openvolleyscout.svg" alt="OpenVolleyScout Logo" width="400"/>
</p>

<p align="center">
  <b>Analyze. Scout. Improve.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active%20development-orange"/>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue"/>
  <img src="https://img.shields.io/badge/platform-web-blue"/>
  <img src="https://img.shields.io/badge/made%20with-React%20%2B%20Vite-61dafb"/>
</p>

OpenVolleyScout is a local-first web application for volleyball match setup,
scouting, tactical-system editing, and early match reporting.

The application runs entirely in the browser. Match projects, team archives,
rosters, and competition names are persisted on the device with IndexedDB.
Locale and defense-system editor state are stored in `localStorage`.

Live demo: https://napo.github.io/openvolleyscout

> The project is under active development. Some workflows are complete enough
> to use as foundations, while analysis and advanced tactical automation are
> still evolving.

## Installation & Downloads

### Desktop Application

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| **Windows** (64-bit) | [.exe installer](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout-0.20.1_x64-setup.exe) |
| **macOS** (Intel) | [.dmg installer](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScoutv0.20.1_x64.dmg) |
| **macOS** (Apple Silicon) | [.dmg installer](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout_v0.20.1_aarch64.dmg) |
| **Linux** (Ubuntu/Debian) | [.deb package](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout_v0.20.1_amd64.deb) |
| **Linux** (RedHat/Fedora) | [.rpm package](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout-v0.20.1-1.x86_64.rpm) |
| **Linux** (Universal) | [AppImage](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout_v0.20.1_amd64.AppImage) |
| **Android** | [.apk](https://github.com/napo/openvolleyscout/releases/download/v0.20.1/OpenVolleyScout-v0.20.1_android.apk) |

### Web Browser (No Installation)

No installation needed — use the [live demo](https://napo.github.io/openvolleyscout) directly in any modern browser.

See all [releases](https://github.com/napo/openvolleyscout/releases) for older versions.

## Current Capabilities

- Create and manage archived teams and rosters.
- Create match projects from competition metadata, selected teams, and
  match-specific rosters.
- Configure match-level scouting settings such as set targets and tie-break
  targets.
- Start sets from selected lineups and serving team.
- Record rally events, touches, points, score corrections, set endings, and
  match endings through an event log.
- Persist scouting progress back into the active `MatchProject`.
- Generate live quick stats, set summaries, rally summaries, and DataVolley-like
  rally strings from recorded events.
- Edit and persist a simple defense-system layout in the browser.

## Technical Stack

- React 18
- TypeScript
- Vite
- React Router
- Zustand
- Dexie / IndexedDB

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview a production build:

```bash
npm run preview
```

Run the current validation script:

```bash
npm test
```

`npm test` currently runs `scripts/validate-match-stats.mjs`, which bundles and
executes the match-statistics fixture validation.

## Main Application Routes

The app uses hash routing, so routes are rendered under `#/...`.

- `#/` - landing page
- `#/teams` - archived team and roster management
- `#/match` - match setup workflow
- `#/scouting` - live scouting workflow
- `#/systems` - defense-system editor
- `#/analysis` - placeholder for future analysis views
- `#/load-data` - saved match project loading
- `#/settings` - locale and local-data actions
- `#/about` - project information

## Documentation

Start with [docs/README.md](docs/README.md).

Important entry points:

- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Domain Model](docs/domain-model.md)
- [Persistence](docs/persistence.md)
- [Scouting Architecture](docs/scouting.md)
- [Tactical Systems](docs/systems.md)
- [Code Structure](docs/code-structure.md)
- [Developer Guidelines](docs/developer-guidelines.md)

## Project Status

Implemented foundations:

- local match and archive persistence
- match creation and readiness validation
- event-sourced scouting session replay
- scouting persistence into `MatchProject.events` and `MatchProject.scoutingSession`
- match statistics builder and validation fixture
- simple defense-system editor backed by `localStorage`
- English and Italian UI translations with persisted locale choice

Still in progress:

- full DataVolley export compatibility
- advanced player suggestion from tactical systems
- persistent tactical-system repository in IndexedDB
- full analysis screens
- broader automated test coverage

## Preview

![home](docs/images/00-home.png)  
![team](docs/images/01-team.png)  
![match](docs/images/02-match.png)  
![configurematch](docs/images/03-prematch.png)  
![roster](docs/images/04-roster.png)  
![start](docs/images/05-start.png)  
![start_scouting](docs/images/06-scouting_start.png)  
![scouting](docs/images/07-scouting_reception.png)  
![matchreporto](docs/images/08-matchreport.png)  
![charts](docs/images/09-charts.png)  
![systems](docs/images/10-system_reception.png)
