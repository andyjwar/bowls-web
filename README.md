# Ipswich & District Federation Bowls League — website

React + Vite front end with league fixtures, standings, rules, and an admin area for **bulk CSV results import** with per-fixture corrections.

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

Open the URL Vite prints (often `http://localhost:5173`). Admin: **`/admin`** (same origin, e.g. `http://localhost:5173/admin`). Sign in with `ADMIN_PASSWORD` from `.env` (default in `.env.example` is `changeme`).

If the terminal shows **`Port 3001 is already in use`** for the `[admin]` line, Vite is proxying `/api` to an **old** Express process: stop whatever is on `3001` (e.g. `lsof -ti:3001 | xargs kill`) and run `npm run dev` again so CSV import returns fixture rows and lists them under **“Imported fixtures”.**

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

### Bulk CSV import (admin `/admin`)

You can transcribe handwritten score sheets in ChatGPT, export to CSV, then import one file covering many matches (and optionally many weeks / divisions).

- **Important**: Rows are validated and **saved straight into** `public/data/*.json` and `registered-players.json`. There is no undo in the UI. Use git or backups before importing.
- Prefer **Excel / Google Sheets / Numbers**, then export **UTF-8 CSV**, so commas line up cleanly. Quotes work for club names that contain commas, e.g. `"Stone Lodge Reds, Seniors"`.

**Unified header row** — use one spreadsheet row for every logical column (`result` rows and `player` rows share the **same shape** — leave irrelevant cells blank, but keep the commas so rows line up):

```csv
type,league_id,section_id,division_id,week,match_date,home,away,home_points,away_points,home_shots,away_shots,rink_1_home,rink_1_away,rink_2_home,rink_2_away,rink_3_home,rink_3_away,home_player_1,home_player_2,away_player_1,away_player_2,home_players,away_players,team,player
```

What to put where (match / `type=result` rows):

| What you have | CSV columns |
|---------------|-------------|
| League | `league_id` (e.g. `samford-2026`) — optional if you set the default league in admin before import |
| Section (multi-section leagues) | `section_id` (e.g. `monday-evening`) — same string as in `public/data/*.json` |
| Division | `division_id` (e.g. `a`–`e` for Samford Monday, or `1` for Wednesday afternoon) |
| Which round / week | Either **`week`** (1–14) **or** **`match_date`** — see below |
| Match date | `match_date` as `YYYY-MM-DD` or `DD/MM/YYYY` (day-first, UK). The importer looks this date up on the division’s fixture list and picks the **week** automatically. If you also fill `week` and they disagree with the calendar, **the date wins** and you get a warning. |
| Home / away club names | `home`, `away` — spell them like the league JSON (minor typos are fuzzy-matched) |
| Sheet “result” (form points, e.g. 10–2) | `home_points`, `away_points` |
| **Total** shots for each side (whole match aggregate) | `home_shots`, `away_shots` — this is what updates **standings** (aliases include `total_shots_home`, `total_shots_away`, `shots_home`) |
| Optional per-rink breakdown | `rink_1_home`, `rink_1_away`, … up to rink 9 if you want. Stored on the saved result row for reference; if the rink sums disagree with match totals by 4+, you’ll get a warning. |
| Names of players on each side | Use **`home_player_1`, `home_player_2`, …** (same for **`away_player_*`**), **or** a single **`home_players`** / **`away_players`** cell with names split by **`;`** or **`|`**. If both styles are filled, numbered columns win and list values are appended for any extra names. |
| Unused columns on result rows | `team`, `player` — leave blank. |

Add **registered-roster entries** (`type=player`): same columns; leave match fields blank, set `team`, `player`, `league_id`, `section_id` as needed — same trailing columns as matches so CSV column counts align.

Extra columns only trimmed when they are **empty** cells **beyond** the header width (helps exports with a stray comma at end).

- **`result` rows**: one row per match; mix many divisions/weeks / dates in the same file.
- **`player` rows**: roster additions for validation against `registered-players.json`.

Synonyms cover `record_type`, `home_team`, `division`, `match_date`, `date_of_match`, `date`, result/points aliases (`result_home`, `home_pts`), and shot total aliases (`total_home_shots`, …).

**Samford examples**

Week number plus totals (minimal):

```csv
type,league_id,section_id,division_id,week,match_date,home,away,home_points,away_points,home_shots,away_shots,rink_1_home,rink_1_away,rink_2_home,rink_2_away,rink_3_home,rink_3_away,home_player_1,home_player_2,away_player_1,away_player_2,home_players,away_players,team,player
result,samford-2026,monday-evening,a,1,,Waldringfield Swans,Kirton A,10,2,94,71,,,,,,,,,,,,,,
```

Same match keyed by diary date (`week` blank — resolved from fixtures):

```csv
result,samford-2026,monday-evening,a,,2026-05-11,Waldringfield Swans,Kirton A,10,2,94,71,47,43,47,28,,,,,,,S Smith;G Coles,,,
```

Roster line (note the empty cells up to `team` / `player`):

```csv
player,samford-2026,monday-evening,,,,,,,,,,,,,,,,,,,,,,Waldringfield Swans,S Smith
```

Use `section_id` values exactly as in the league JSON. If you omit `league_id` / `section_id` on rows, set **optional default league / section** in the admin CSV area (collapsed *Optional default league / section*) before uploading.

After a successful import, the admin page lists **one row per saved fixture** (for that upload, kept in `sessionStorage` until you clear the list or reload). Click **Correct** on any fixture to edit it individually.

Club **team lists** and **fixture schedules** are still edited in league JSON manually; CSV import does not create divisions or change who plays whom.

**Suggested ChatGPT preamble** after you paste handwriting:

```text
Output a single UTF-8 CSV with this exact header row (do not shorten columns):

type,league_id,section_id,division_id,week,match_date,home,away,home_points,away_points,home_shots,away_shots,rink_1_home,rink_1_away,rink_2_home,rink_2_away,rink_3_home,rink_3_away,home_player_1,home_player_2,away_player_1,away_player_2,home_players,away_players,team,player

- type=result for each match row; type=player for roster additions.
- Use league_id samford-2026 and section_id monday-evening unless I say otherwise.
- For each match fill division_id, either week OR match_date (YYYY-MM-DD from the fixture list), clubs, points, TOTAL match shots home/away, optional per-rink shots, optional player columns.
- Separate multiple players in home_players / away_players with semicolons OR use numbered home_player_N columns.

Output CSV only — no markdown code fence.

## Deploying

- **Static build**: host `dist/` on any static host.
- **Admin import**: requires the Node server (`server/index.js`) running with write access to the data files (or adapt persistence).

This repository is standalone and is not part of the TCLOT fantasy league project.
