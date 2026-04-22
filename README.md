# OpenVolleyScout
<img src="src/assets/openvolleyscout.svg" width="200px"/>

Open-source React web application for volleyball scouting and match analysis.

## Vision
OpenVolleyScout is designed to be:
- open
- portable
- maintainable
- extensible
- usable without proprietary runtime dependencies

## Goals
- collect match data set by set and rally by rally
- store data locally
- export data in open formats
- generate match statistics and box score style reports
- evolve over time through a clean architecture

## Stack
- React
- TypeScript
- Vite
- Zustand or Redux Toolkit
- Dexie + IndexedDB

## Main app states
- Startup
- Scouting
- Analysis

## Setup
```bash
npm install
npm run dev
```

## GitHub Pages
This project is deployed as a GitHub Pages project page.

- Public URL: `https://napo.github.io/openvolleyscout/`
- Vite base path: `/openvolleyscout/`
- Deployment: GitHub Actions builds the app on pushes to `main`, uploads `dist`, and deploys it to GitHub Pages

To keep client-side navigation compatible with GitHub Pages static hosting, the app uses hash-based routing for deployed routes.
