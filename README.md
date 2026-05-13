# Ipswich & District Federation Bowls League — website

React + Vite front end with league fixtures, standings, rules, and an admin area for importing score sheets (OCR / optional OpenAI vision).

## Requirements

- Node.js 20+ recommended

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`: set `ADMIN_PASSWORD`, `SESSION_SECRET`; optional `OPENAI_API_KEY` for handwriting OCR.

## Development

Runs the static site and the admin API together:

```bash
npm run dev
```

Open the URL Vite prints (often `http://localhost:5173`). Admin: `/admin`.

- `npm run dev:vite` — front end only (API calls fail unless the API is running separately)
- `npm run dev:admin` — Express API on port 3001 (`ADMIN_PORT` in `.env`)

## Build

```bash
npm run build
npm run preview
```

Set `VITE_BASE_PATH` if the site is not served from the domain root (for example GitHub project pages).

## Data

League JSON lives under `public/data/`. The admin server reads and writes those files when you save results.

## Deploying

- **Static build**: host `dist/` on any static host.
- **Admin import**: requires the Node server (`server/index.js`) running with write access to the data files (or adapt persistence).

This repository is standalone and is not part of the TCLOT fantasy league project.
