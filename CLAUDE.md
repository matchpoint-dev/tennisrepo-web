@AGENTS.md

# TennisRepo — Complete Site Reference

## Overview
A Next.js ATP tennis statistics site backed by Supabase (PostgreSQL). Data originates from Jeff Sackmann's tennis_atp CSVs. The frontend is entirely inline-style React — no CSS modules or Tailwind. Runs at `localhost:3000` in dev (`npm run dev`).

---

## Tech Stack
- **Framework**: Next.js (App Router) — mix of server components (`app/page.tsx`) and client components (`'use client'` at top of file)
- **Database**: Supabase — accessed via `@supabase/supabase-js` anon key (read-only from the client; the anon key can INSERT but NOT UPDATE or DELETE)
- **Client**: `app/lib/supabase.js` — exports `supabase` singleton using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Flags**: `app/lib/countryUtils.js` — exports `getFlagUrl(iocCode)` → flagcdn.com image URL (24×18 px), `getCountryFlag(iocCode)` → emoji (avoid on Windows), `getCountryName(iocCode)`. Players store 3-letter IOC codes (e.g. `USA`, `SRB`).
- **Fonts**: Inter from `next/font/google`

---

## File Structure

```
app/
  page.tsx                        # Home — server component
  RankingCard.tsx                 # 'use client' sidebar card (ATP + ELO rankings)
  layout.tsx                      # Root layout
  lib/
    supabase.js                   # Supabase client
    countryUtils.js               # Flag/country helpers
  tournaments/
    page.tsx                      # Tournament list (client)
    [id]/page.tsx                 # Tournament detail + draw (client)
  players/
    page.tsx                      # Player search/list (client)
    [id]/
      page.tsx                    # Player profile — server component
      PlayerTabNav.tsx            # Tab nav: Overview / Matches / Tournaments
      matches/page.tsx            # Full match history with filters (client)
      tournaments/page.tsx        # Tournament-by-tournament results (client)
  rankings/page.tsx               # ELO rankings table (client, 100/page)
  h2h/page.tsx                    # Head-to-head comparison (client)
  stats/page.tsx                  # Stats explorer (client)
```

---

## Database Schema (Supabase)

### `tournaments`
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | |
| name | text | e.g. `"US Open"`, `"Roland Garros"` |
| year | int | |
| level | text | See level system below |
| surface | text | `Hard`, `Clay`, `Grass`, `Carpet` |
| draw_size | int | |
| start_date | date | |

### `matches`
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | |
| tournament_id | int FK | → tournaments.id |
| round | text | `F`, `SF`, `QF`, `R16`, `R32`, `R64`, `R128`, `RR`, `BR` |
| winner_id | int FK | → players.id |
| loser_id | int FK | → players.id |
| score | text | |
| match_date | date | |
| winner_seed | int | nullable |
| winner_entry | text | nullable — `WC`, `Q`, `LL`, `PR`, etc. |
| winner_rank | int | nullable — ATP rank at time of match |
| loser_seed | int | nullable |
| loser_entry | text | nullable |
| loser_rank | int | nullable |

### `players`
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | |
| full_name | text | **use `full_name`, NOT `name`** |
| country_code | text | 3-letter IOC code |
| dob | date | |
| hand | text | |
| height | int | cm |

### `rankings`
| Column | Type | Notes |
|--------|------|-------|
| player_id | int FK | |
| ranking_date | date | weekly snapshots |
| rank | int | |
| points | int | |

### `elo_ratings`
| Column | Type | Notes |
|--------|------|-------|
| player_id | int FK | |
| surface | text | `Overall`, `Hard`, `Clay`, `Grass` |
| rating | float | |

### `player_stats`
| Column | Type | Notes |
|--------|------|-------|
| player_id | int FK | |
| (various stat columns) | | |

---

## Tournament Level System

Levels stored in `tournaments.level`:

| Code | Label | Color |
|------|-------|-------|
| `G` | Grand Slam | #f0c619 (gold) |
| `M` | Masters 1000 | #3b82f6 (blue) |
| `F` | ATP Finals | #a855f7 (purple) |
| `500` | ATP 500 | #22c55e (green) |
| `250` | ATP 250 | #94a3b8 (grey) |
| `A` | ATP 250 (legacy alias for 250) | same as 250 |
| `D` | Team Event (Davis/ATP/Laver Cup) | #f97316 |
| `E` | Exhibition | #06b6d4 |
| `NG` | Exhibition (NextGen alias) | same as E |
| `C` | Challenger | #64748b |
| `O` / `Olympics` | Olympics | #0284c7 |

**Level resolution helper** (used in several pages):
```ts
function resolveLevel(level: string): string {
  if (level === 'A') return '250'
  if (level === 'NG') return 'E'
  if (level === 'O') return 'Olympics'
  return level
}
```

**Levels excluded from title counts**: `D`, `E`, `NG`

---

## Key Patterns & Gotchas

### 1. Two-query pattern (avoid FK join issues)
Supabase FK joins can fail or return unexpected shapes. Standard approach:
```ts
// Step 1: fetch IDs
const { data: rows } = await supabase.from('rankings').select('player_id').eq(...)
const ids = rows.map(r => r.player_id)
// Step 2: fetch related records
const { data: players } = await supabase.from('players').select('id, full_name, country_code').in('id', ids)
```

### 2. Active player filter for ELO
Retired players appear in `elo_ratings` but not in the latest `rankings` week. To show only active players, fetch all `player_id`s from the most recent `ranking_date`, then filter ELO with `.in('player_id', activeIds)`.

### 3. Ghost tournament rows
Some tournaments have duplicate rows in `tournaments` (same name + year). One row has matches, the other (ghost) has none. The ghost typically has the lower `id` due to import order.

**Frontend fix** (in `tournaments/[id]/page.tsx`):
- Fetch finals from ALL raw edition IDs (not deduped)
- Build `winnerByYear: Record<number, player>` and `realIdByYear: Record<number, tournamentId>` keyed by year
- Navigation links use `realIdByYear[year]` so clicks always go to the match-bearing row
- Display deduplication (keep lower id per year) is separate from navigation

**DB fix**: Run `fix_ghost_tournaments.sql` in Supabase SQL Editor (finds rows with same name+year where one has 0 matches and a sibling has matches, deletes the empty one).

### 4. Tournament name aliases
Some events changed CSV names between pre-2020 and post-2020 data:
```ts
const TOURNAMENT_ALIAS_GROUPS = [
  ['Tour Finals', 'Masters Cup'],
  ['US Open', 'Us Open'],
  ['NextGen Finals', 'Next Gen Finals'],
]
```
The `getAliases(name)` function in `tournaments/[id]/page.tsx` returns all aliases so edition queries find all rows regardless of name variation.

### 5. Server vs Client components
- `app/page.tsx` (Home) is a **server component** — no event handlers, no `useState`
- Interactive components must live in separate files with `'use client'` at the top
- `RankingCard.tsx` was extracted from Home for this reason

### 6. `full_name` not `name`
The `players` table column is `full_name`. Using `.select('name')` will throw `column players.name does not exist`.

### 7. Supabase anon key permissions
The anon key supports SELECT and INSERT, but **not UPDATE or DELETE**. Schema fixes must be run in the Supabase SQL Editor (Dashboard → SQL Editor). PowerShell PATCH via the REST API also doesn't work for most bulk updates.

---

## Pages — What Each Does

### `/` (Home) — server component
- Fetches: top-10 ATP rankings (from `rankings` table, latest date), top-10 ELO rankings (filtered to active players), 8 recent tournaments (year ≥ 2024, excluding Davis Cup)
- Layout: left column = tournament cards + explore grid, right sidebar = two `RankingCard` components (ATP Rankings in gold, ELO Rankings in blue)
- Tournament cards show level badge + surface badge

### `/tournaments` — client component
- Lists tournaments with filters (year, surface, level)
- Links to `/tournaments/[id]`

### `/tournaments/[id]` — client component
- Shows tournament header (name, year, surface, level badge, draw size, date)
- Champion banner with score and finalist
- Match draw grouped by round (F → SF → QF → ...)
- Match rows: `winner [seed] [flag] [name] [#rank] | score | [#rank] [name] [flag] [seed] loser`
- Right sidebar: Tournament Info, Final (finalist), Other Editions (with ghost-safe navigation), Most Titles Here (deduped tally)
- Uses `winnerByYear` + `realIdByYear` pattern for ghost safety

### `/players` — client component
- Search/browse player list

### `/players/[id]` — server component
- Player profile: stats, ELO ratings with ranks, recent matches, ATP ranking (current + best)
- Tab nav: Overview | Matches | Tournaments

### `/players/[id]/matches` — client component
- Full paginated match history (fetches in 1000-record chunks)
- Filters: surface, level, result (W/L), year, round
- Match rows show: tournament name + level badge + surface badge + round label + opponent flag/name/seed/entry/rank + score + W/L badge
- `GROUPS_PER_PAGE = 20` match groups per page

### `/players/[id]/tournaments` — client component
- One entry per tournament appearance showing best round reached
- Filters and pagination

### `/rankings` — client component
- ELO rankings table, 100 rows/page, active players only
- Columns: Rank (gold/silver/bronze for top 3) | Flag + Player name | ELO rating
- Fetches: latest ranking date → active player IDs → ELO filtered to active IDs → player names

### `/h2h` — client component
- Two player search boxes with autocomplete
- Shows all head-to-head matches between selected players

### `/stats` — client component
- Stats explorer

---

## SQL Fix Files (in `tennisrepo/` repo)

| File | Purpose |
|------|---------|
| `fix_500_levels.sql` | Resets all 500→250, re-applies 500 with exact year ranges. Run in SQL Editor. |
| `fix_ghost_tournaments.sql` | Deletes ghost rows (0 matches, sibling has matches). Also fixes pre-2009 500 levels for classic events. |
| `diagnose_duplicates.sql` | Diagnostic: shows duplicate name+year entries with match counts. |
| `fix_levels.ps1` | PowerShell version of level fix (uses REST PATCH — limited by anon key). |

**Key 500-level rules:**
- Dubai, Rotterdam, Barcelona, Tokyo — 500 for all years (classic events)
- Basel — 500 from 2009+ only (was 250 before 2009)
- Halle, Queen's Club — 500 from 2015+
- Washington — 500 for 1990–2002 and 2009+
- Vienna — 500 for 1996–2008 and 2015+
- Hamburg — 500 from 2009+
- Doha, Dallas, Munich — 500 from 2025+

---

## Design System

**Color palette:**
- Background: `#0a1628` (darkest navy)
- Card/panel: `#0d1f3c`
- Border: `#1e3a5f`
- Muted text: `#64748b`, `#94a3b8`
- Body text: `#e2e8f0`
- Gold accent: `#f0c619` (winners, highlights)
- Podium: gold `#f0c619`, silver `#94a3b8`, bronze `#cd7c44`

**Surface colors:** Hard `#3b82f6`, Clay `#c2521a`, Grass `#22c55e`, Carpet `#a855f7`

**Seed badge style** (gold): `background: #2a1f00, border: #f0c61940, color: #f0c619, borderRadius: 4, fontSize: 0.7rem`

**Entry badge style** (muted): `background: #0a1628, border: #334155, color: #64748b, borderRadius: 4, fontSize: 0.68rem`

**Rank display**: small muted `#475569` text, `#N` format
