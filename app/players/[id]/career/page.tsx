'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Inter } from 'next/font/google';
import { supabase } from '../../../lib/supabase';
import PlayerTabNav from '../PlayerTabNav';
import NavBar from '../../../NavBar';

const inter = Inter({ subsets: ['latin'] });

// ─── Round helpers ────────────────────────────────────────────────────────────

const ROUND_DEPTH: Record<string, number> = {
  R128: 0, R64: 1, R32: 2, R16: 3, RR: 3, BR: 4, QF: 5, SF: 6, F: 7,
};
const ROUND_DISPLAY: Record<string, string> = {
  R128: '1R', R64: '2R', R32: '3R', R16: '4R',
  QF: 'QF', SF: 'SF', F: 'F', RR: 'RR', BR: 'BR',
};

// ─── Result colours (Wikipedia tennis performance palette) ────────────────────

const RESULT_STYLE: Record<string, [string, string]> = {
  W:    ['#00a550', '#fff'],
  F:    ['#92d050', '#1a2800'],
  SF:   ['#c6efce', '#0a2a1a'],
  QF:   ['#ffeb9c', '#2a2800'],
  '4R': ['#ffff99', '#2a2800'],
  '3R': ['#ffff99', '#2a2800'],
  '2R': ['#ffff99', '#2a2800'],
  '1R': ['#ffff99', '#2a2800'],
  RR:   ['#ccccff', '#1a0028'],
  BR:   ['#99ccff', '#00111e'],
  NH:   ['#aaaaaa', '#333'],
  A:    ['transparent', '#2e4a6a'],
  // Olympics medal colours
  G:    ['#ffd700', '#5a3e00'],
  S:    ['#c0c0c0', '#2a2a2a'],
  B:    ['#cd7f32', '#1a0a00'],
  '4th':['#ffeb9c', '#2a2800'],
};

// Map internal result codes → Olympic display codes
const OLYMPIC_RESULT: Record<string, string> = {
  W: 'G', F: 'S',
  BR: 'B',      // won the bronze-medal match
  'BR-L': '4th', // lost the bronze-medal match
  SF: 'B',      // reached SF but no BR data (edge-case fallback)
  QF: '4th',
};

// ─── Tournaments not held in specific years ────────────────────────────────────
// Key = canonical tournament name, value = set of years it was cancelled/not held

const NOT_HELD: Record<string, Set<number>> = {
  'Wimbledon':       new Set([2020]),
  'Indian Wells':    new Set([2020]),
  'Miami':           new Set([2020]),
  'Monte-Carlo':     new Set([2020]),
  'Madrid':          new Set([2020]),
  'Canadian Open':   new Set([2020]),
  'Shanghai':        new Set([2020]),
};

// ─── Tournament name aliases → canonical name ─────────────────────────────────

const ALIAS_MAP: Record<string, string> = {
  // Grand Slams
  'australian open': 'Australian Open',
  'french open': 'French Open',
  'roland garros': 'French Open',
  'wimbledon': 'Wimbledon',
  'us open': 'US Open',
  // ATP Finals
  'tour finals': 'ATP Finals',
  'masters cup': 'ATP Finals',
  'atp finals': 'ATP Finals',
  'nitto atp finals': 'ATP Finals',
  'barclays atp world tour finals': 'ATP Finals',
  'atp world tour finals': 'ATP Finals',
  // Masters 1000 – Indian Wells
  'indian wells masters': 'Indian Wells',
  'bnp paribas open': 'Indian Wells',
  'indian wells open': 'Indian Wells',
  // Masters 1000 – Miami
  'miami masters': 'Miami',
  'miami open': 'Miami',
  'sony open tennis': 'Miami',
  'ericsson open': 'Miami',
  'lipton championships': 'Miami',
  // Masters 1000 – Monte-Carlo
  'monte carlo masters': 'Monte-Carlo',
  'monte-carlo masters': 'Monte-Carlo',
  'monte-carlo rolex masters': 'Monte-Carlo',
  'monte carlo rolex masters': 'Monte-Carlo',
  // Masters 1000 – Madrid
  'madrid open': 'Madrid',
  'madrid masters': 'Madrid',
  // Masters 1000 – Italian Open / Rome
  'italian open': 'Italian Open',
  "internazionali bnl d'italia": 'Italian Open',
  'internazionali bnl ditalia': 'Italian Open',
  'internazionali di roma': 'Italian Open',
  'internazionali bnl': 'Italian Open',
  'internazionali': 'Italian Open',
  'rome masters': 'Italian Open',
  'rome': 'Italian Open',
  'roma': 'Italian Open',
  'foro italico': 'Italian Open',
  // Masters 1000 – Canadian Open
  'canadian open': 'Canadian Open',
  'rogers cup': 'Canadian Open',
  'national bank open': 'Canadian Open',
  'coupe rogers': 'Canadian Open',
  'canada masters': 'Canadian Open',
  'canada': 'Canadian Open',
  'montreal': 'Canadian Open',
  'montreal / toronto': 'Canadian Open',
  'toronto': 'Canadian Open',
  // Masters 1000 – Cincinnati
  'cincinnati masters': 'Cincinnati',
  'western & southern open': 'Cincinnati',
  'western & southern financial group masters': 'Cincinnati',
  'western & southern financial group masters 1000': 'Cincinnati',
  'cincinnati open': 'Cincinnati',
  // Masters 1000 – Shanghai
  'shanghai masters': 'Shanghai',
  'shanghai rolex masters': 'Shanghai',
  // Masters 1000 – Paris
  'paris masters': 'Paris Masters',
  'bnp paribas masters': 'Paris Masters',
  'rolex paris masters': 'Paris Masters',
  // Hamburg (was Masters until 2008, now 500 — handled by level-split below)
  'german open': 'Hamburg',
  'international german open': 'Hamburg',
  'hamburg masters': 'Hamburg',
  'hamburg open': 'Hamburg',
  'hamburg': 'Hamburg',
  // Olympics (Sackmann data uses "{City} Olympics" format)
  'olympics': 'Olympics',
  'summer olympics': 'Olympics',
  'olympic games': 'Olympics',
  'athens olympics': 'Olympics',
  'atlanta olympics': 'Olympics',
  'barcelona olympics': 'Olympics',
  'beijing olympics': 'Olympics',
  'london olympics': 'Olympics',
  'los angeles olympics': 'Olympics',
  'paris olympics': 'Olympics',
  'rio olympics': 'Olympics',
  'seoul olympics': 'Olympics',
  'sydney olympics': 'Olympics',
  'tokyo olympics': 'Olympics',
};

function toCanon(name: string): string {
  // Normalise curly/special apostrophe variants to plain ASCII '
  const normalised = name.toLowerCase().replace(/[\u2018\u2019\u201a\u201b\u2032\u2035\u0060]/g, "'");
  return ALIAS_MAP[normalised] ?? name;
}

// ─── Tournaments whose ATP level changed during their history ─────────────────
// masterCanon  = canonical name used when at Masters 1000 level (→ Masters section)
// lowerCanon   = canonical name used when at lower level (→ dynamic section)
// masterUntil  = last year at Masters 1000 level

const LEVEL_SPLIT: Array<{ masterCanon: string; lowerCanon: string; masterUntil: number }> = [
  { masterCanon: 'Hamburg', lowerCanon: 'Hamburg~500', masterUntil: 2008 },
];

// Human-readable display name for level-split "lower" canonicals
const CANON_DISPLAY: Record<string, string> = {
  'Hamburg~500': 'Hamburg',
};

function displayName(canon: string): string {
  return CANON_DISPLAY[canon] ?? canon.replace(/~(500|250|C|D|E|F|M|G|A)$/, '');
}

// Resolve the canonical name taking level history into account
function resolveCanon(rawName: string, level: string, year: number): string {
  const base = toCanon(rawName);
  for (const split of LEVEL_SPLIT) {
    if (base === split.masterCanon) {
      return year <= split.masterUntil ? split.masterCanon : split.lowerCanon;
    }
  }
  return base;
}

// ─── Fixed section lists ──────────────────────────────────────────────────────

const GRAND_SLAMS  = ['Australian Open', 'French Open', 'Wimbledon', 'US Open'];
const FINALS_LIST  = ['ATP Finals'];
const OLYMPIC_LIST = ['Olympics'];
const MASTERS_LIST = [
  'Indian Wells', 'Miami', 'Monte-Carlo', 'Madrid', 'Italian Open',
  'Canadian Open', 'Cincinnati', 'Shanghai', 'Paris Masters', 'Hamburg',
];

// All canonical names that are "fixed" (placed in their own hardcoded section).
// NOTE: lowerCanon entries (e.g. Hamburg~500) are intentionally NOT included here —
// they fall through to the dynamic 500s / 250s sections.
const ALL_FIXED = new Set([
  ...GRAND_SLAMS, ...FINALS_LIST, ...OLYMPIC_LIST, ...MASTERS_LIST,
]);

// Earliest year a fixed tournament should show 'A' / 'NH' cells
const EARLIEST_YEAR: Record<string, number> = {
  'Australian Open': 1969, 'French Open': 1968, 'Wimbledon': 1968, 'US Open': 1968,
  'ATP Finals': 1970,
  'Indian Wells': 1990, 'Miami': 1987, 'Monte-Carlo': 1968, 'Madrid': 2002,
  'Italian Open': 1968, 'Canadian Open': 1968, 'Cincinnati': 1988,
  'Shanghai': 2009, 'Paris Masters': 1968, 'Hamburg': 1978,
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

function bestResult(matches: any[], pid: string): string {
  if (!matches.length) return '';
  if (matches.some(m => m.round === 'F' && String(m.winner_id) === pid)) return 'W';
  const losses = matches.filter(m => String(m.loser_id) === pid);
  if (losses.length) {
    const d = losses.reduce((a, b) =>
      (ROUND_DEPTH[b.round] ?? -1) > (ROUND_DEPTH[a.round] ?? -1) ? b : a);
    return ROUND_DISPLAY[d.round] ?? d.round;
  }
  const wins = matches.filter(m => String(m.winner_id) === pid);
  if (wins.length) {
    const d = wins.reduce((a, b) =>
      (ROUND_DEPTH[b.round] ?? -1) > (ROUND_DEPTH[a.round] ?? -1) ? b : a);
    return ROUND_DISPLAY[d.round] ?? d.round;
  }
  return '';
}

// Olympics-specific result: distinguishes won-BR (bronze) from lost-BR (4th)
function olympicResult(matches: any[], pid: string): string {
  if (!matches.length) return '';
  // Gold
  if (matches.some(m => m.round === 'F' && String(m.winner_id) === pid)) return 'W';
  // Silver
  if (matches.some(m => m.round === 'F' && String(m.loser_id) === pid)) return 'F';
  // Bronze medal match
  const br = matches.find(m => m.round === 'BR');
  if (br) {
    if (String(br.winner_id) === pid) return 'BR';   // won → bronze
    if (String(br.loser_id)  === pid) return 'BR-L'; // lost → 4th
  }
  // Fell out before bronze match — use standard logic
  return bestResult(matches, pid);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Entry = { result: string; tid: string; wins: number; losses: number; level: string; surface: string };
type CS    = { tourn: number; titles: number; finals: number; wins: number; losses: number; hw: number; hl: number; cw: number; cl: number; gw: number; gl: number };

// ─── Component ────────────────────────────────────────────────────────────────

export default function CareerPage() {
  const { id } = useParams() as { id: string };

  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [rankings,   setRankings]   = useState<any[]>([]);
  const [player,     setPlayer]     = useState<any>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: p } = await supabase.from('players').select('id, full_name, country_code').eq('id', id).single();
      setPlayer(p);

      let matches: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('matches')
          .select('id, winner_id, loser_id, round, tournament_id, tournaments(id, name, year, level, surface)')
          .or(`winner_id.eq.${id},loser_id.eq.${id}`)
          .order('id', { ascending: true })
          .range(from, from + 999);
        if (!data?.length) break;
        matches = [...matches, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }
      setAllMatches(matches);

      const { data: rk } = await supabase
        .from('rankings').select('rank, ranking_date').eq('player_id', id)
        .order('ranking_date', { ascending: true });
      setRankings(rk ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  // ─── Data processing ────────────────────────────────────────────────────────

  const processed = useMemo(() => {
    if (!allMatches.length) return null;
    const pid = String(id);

    const yearsSet = new Set<number>();
    allMatches.forEach(m => { if (m.tournaments?.year) yearsSet.add(m.tournaments.year); });

    // Also include years where NH tournaments should appear (e.g. 2020)
    const nhYears = new Set<number>();
    Object.values(NOT_HELD).forEach(s => s.forEach(y => nhYears.add(y)));
    nhYears.forEach(y => yearsSet.add(y));

    const years = Array.from(yearsSet).sort((a, b) => a - b);

    // Group matches by tournament_id
    const byTid = new Map<string, any[]>();
    allMatches.forEach(m => {
      const tid = String(m.tournament_id);
      if (!byTid.has(tid)) byTid.set(tid, []);
      byTid.get(tid)!.push(m);
    });

    // Result priority — used to pick the best entry when two tournament_ids
    // resolve to the same (canonical name, year).  This can happen when the DB
    // has duplicate tournament rows for the same event (a known import artefact:
    // one "ghost" row with 0 matches and one real row, or occasionally two real
    // rows with partial data).  Without this guard the last-processed entry wins,
    // which can silently replace a 'W' result with an earlier-round result and
    // drop the title from the career-stats count.
    const RESULT_PRIORITY: Record<string, number> = {
      W: 10, F: 9, SF: 8, QF: 7, '4R': 6, '3R': 5, '2R': 4, '1R': 3,
      RR: 5, BR: 4, 'BR-L': 3,
      // Olympics display codes (stored as raw result in byName)
      G: 10, S: 9, B: 4, '4th': 3,
    };

    // For non-fixed tournaments, append ~level so that a tournament that changed
    // levels across its history (e.g. Basel: 250 before 2009, 500 after) appears
    // as two separate rows — once in the 500s section and once in the 250s section.
    // Fixed tournaments (Grand Slams, Masters, etc.) always keep their plain canonical.
    function buildCanon(rawName: string, level: string, year: number): string {
      const base = resolveCanon(rawName, level, year);
      // Already handled by LEVEL_SPLIT (e.g. Hamburg~500) — keep as-is
      if (LEVEL_SPLIT.some(s => s.lowerCanon === base)) return base;
      // Fixed tournaments keep their plain name
      if (ALL_FIXED.has(base)) return base;
      // Olympics handled separately
      if (base === 'Olympics') return base;
      // Normalise 'A' → '250' so pre/post-split years of the same event
      // with different level codes still merge correctly.
      const normLevel = level === 'A' ? '250' : level;
      // Only split on the levels that appear in the dynamic sections
      if (normLevel === '500' || normLevel === '250') return `${base}~${normLevel}`;
      // Other levels (C, D, E, etc.) keep plain name so they still appear somewhere
      return base;
    }

    // Levels excluded from the career timeline entirely
    // D = team events (Davis Cup, ATP Cup, United Cup, Laver Cup, etc.)
    // NG = NextGen Finals (exhibition-style event, not an individual title)
    const EXCLUDED_LEVELS = new Set(['D', 'NG']);

    // Build canonical map with level-aware resolution
    const byName = new Map<string, Map<number, Entry>>();
    for (const [tid, ms] of byTid) {
      const t = ms[0]?.tournaments;
      if (!t) continue;
      if (EXCLUDED_LEVELS.has(t.level)) continue;
      const canon  = buildCanon(t.name, t.level, t.year);
      const year   = t.year as number;
      const wins   = ms.filter(m => String(m.winner_id) === pid).length;
      const losses = ms.filter(m => String(m.loser_id) === pid).length;
      const result = canon === 'Olympics' ? olympicResult(ms, pid) : bestResult(ms, pid);
      if (!byName.has(canon)) byName.set(canon, new Map());
      const existing = byName.get(canon)!.get(year);
      // Only overwrite if the new result is strictly better than what we already have.
      // This prevents a duplicate tournament_id with incomplete match data from
      // wiping out a correctly-computed 'W' result.
      if (!existing || (RESULT_PRIORITY[result] ?? 0) > (RESULT_PRIORITY[existing.result] ?? 0)) {
        byName.get(canon)!.set(year, { result, tid, wins, losses, level: t.level, surface: t.surface });
      }
    }

    // Year-end rankings
    const yearRank: Record<number, number> = {};
    rankings.forEach(r => {
      const yr = Number(r.ranking_date.split('-')[0]);
      yearRank[yr] = r.rank;
    });

    // Per-year career stats
    const cs: Record<number, CS> = {};
    years.forEach(y => { cs[y] = { tourn: 0, titles: 0, finals: 0, wins: 0, losses: 0, hw: 0, hl: 0, cw: 0, cl: 0, gw: 0, gl: 0 }; });
    for (const [, ym] of byName) {
      for (const [year, e] of ym) {
        if (!cs[year]) continue;
        cs[year].tourn++;
        cs[year].wins   += e.wins;
        cs[year].losses += e.losses;
        if (e.result === 'W') { cs[year].titles++; cs[year].finals++; }
        else if (e.result === 'F') cs[year].finals++;
        if (e.surface === 'Hard')  { cs[year].hw += e.wins; cs[year].hl += e.losses; }
        if (e.surface === 'Clay')  { cs[year].cw += e.wins; cs[year].cl += e.losses; }
        if (e.surface === 'Grass') { cs[year].gw += e.wins; cs[year].gl += e.losses; }
      }
    }

    // Separate 500s and 250s dynamically (anything not in ALL_FIXED / Olympics)
    const fiveHundreds: string[] = [];
    const twoFifties:   string[] = [];
    for (const [canon] of byName) {
      if (ALL_FIXED.has(canon)) continue;
      if (canon === 'Olympics') continue;
      // LEVEL_SPLIT lower canonicals explicitly end in ~500 (e.g. Hamburg~500)
      // All non-fixed dynamic canonicals are now suffixed ~500 or ~250 by buildCanon
      if (canon.endsWith('~500')) fiveHundreds.push(canon);
      else if (canon.endsWith('~250')) twoFifties.push(canon);
      // Anything else (other levels, or legacy unsuffixed rows) goes into 250s as a fallback
      else twoFifties.push(canon);
    }
    // Sort by appearances desc, then alphabetically
    const sortByApps = (arr: string[]) =>
      arr.sort((a, b) => (byName.get(b)?.size ?? 0) - (byName.get(a)?.size ?? 0) || displayName(a).localeCompare(displayName(b)));
    sortByApps(fiveHundreds);
    sortByApps(twoFifties);

    return { years, byName, yearRank, cs, fiveHundreds, twoFifties };
  }, [allMatches, rankings, id]);

  // ─── Loading / empty states ──────────────────────────────────────────────────

  if (loading) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      {player && <PlayerTabNav id={id} />}
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>Loading career data…</div>
    </div>
  );
  if (!processed || !player) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>No data found.</div>
    </div>
  );

  const { years, byName, yearRank, cs, fiveHundreds, twoFifties } = processed;
  const pid = String(id);

  // ─── Helper functions ────────────────────────────────────────────────────────

  function getEntry(name: string, year: number): Entry | null {
    return byName.get(name)?.get(year) ?? null;
  }

  function sectionYearWL(names: string[], year: number) {
    let w = 0, l = 0;
    names.forEach(n => { const e = getEntry(n, year); if (e) { w += e.wins; l += e.losses; } });
    return { w, l };
  }

  function sectionAggregate(names: string[]) {
    let titles = 0, entries = 0, w = 0, l = 0;
    names.forEach(n => {
      const ym = byName.get(n);
      if (!ym) return;
      for (const [, e] of ym) { entries++; w += e.wins; l += e.losses; if (e.result === 'W') titles++; }
    });
    return {
      sr:  `${titles}/${entries}`,
      wl:  `${w}–${l}`,
      pct: w + l ? `${Math.round(w / (w + l) * 100)}%` : '',
    };
  }

  function tournAggregate(name: string) {
    const ym = byName.get(name);
    if (!ym) return { sr: '0/0', wl: '0–0', pct: '' };
    let titles = 0, entries = 0, w = 0, l = 0;
    for (const [, e] of ym) { entries++; w += e.wins; l += e.losses; if (e.result === 'W') titles++; }
    return {
      sr:  `${titles}/${entries}`,
      wl:  `${w}–${l}`,
      pct: w + l ? `${Math.round(w / (w + l) * 100)}%` : '',
    };
  }

  // ─── Layout constants ────────────────────────────────────────────────────────

  const YEAR_W  = 38;
  const NAME_W  = 172;
  const CELL_P  = '2px 1px';
  const totalCols = 1 + years.length + 3;

  // ─── Sub-components ──────────────────────────────────────────────────────────

  function ResultCell({ name, year, fixed = false }: { name: string; year: number; fixed?: boolean }) {
    const entry    = getEntry(name, year);
    const earliest = EARLIEST_YEAR[name] ?? 0;
    const wasOnTour = (cs[year]?.wins ?? 0) + (cs[year]?.losses ?? 0) > 0;

    if (!entry) {
      // Not-held takes priority over absent
      const isNH = NOT_HELD[name]?.has(year);
      if (isNH) {
        const [bg, fg] = RESULT_STYLE['NH'];
        return (
          <td style={{ width: YEAR_W, textAlign: 'center', padding: CELL_P, borderLeft: '1px solid #1e3a5f' }}>
            <span style={{ display: 'inline-block', backgroundColor: bg, color: fg, fontSize: '0.58rem', fontWeight: 700, borderRadius: 3, padding: '2px 3px', lineHeight: 1.3, minWidth: 22, textAlign: 'center' }}>
              NH
            </span>
          </td>
        );
      }
      const showA = fixed && wasOnTour && year >= earliest;
      return (
        <td style={{ width: YEAR_W, textAlign: 'center', padding: CELL_P, borderLeft: '1px solid #1e3a5f' }}>
          {showA && <span style={{ fontSize: '0.62rem', color: '#2e4a6a', fontWeight: 600 }}>A</span>}
        </td>
      );
    }

    const isOlympics = name === 'Olympics';
    const displayCode = isOlympics ? (OLYMPIC_RESULT[entry.result] ?? entry.result) : entry.result;
    const [bg, fg] = RESULT_STYLE[displayCode] ?? ['transparent', '#64748b'];
    return (
      <td style={{ width: YEAR_W, textAlign: 'center', padding: CELL_P, borderLeft: '1px solid #1e3a5f', verticalAlign: 'middle' }}>
        <Link href={`/tournaments/${entry.tid}`} style={{ textDecoration: 'none' }}>
          <span style={{ display: 'inline-block', backgroundColor: bg, color: fg, fontSize: '0.62rem', fontWeight: 700, borderRadius: 3, padding: '2px 3px', lineHeight: 1.3, minWidth: 22, textAlign: 'center' }}>
            {displayCode}
          </span>
        </Link>
      </td>
    );
  }

  function SectionHeader({ label }: { label: string }) {
    return (
      <tr>
        <td colSpan={totalCols} style={{ backgroundColor: '#0d1f3c', color: '#f0c619', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '7px 14px', borderTop: '2px solid #1e3a5f', borderBottom: '1px solid #1e3a5f' }}>
          {label}
        </td>
      </tr>
    );
  }

  function TournamentRow({ name, fixed = false }: { name: string; fixed?: boolean }) {
    if (!byName.has(name)) return null;
    const agg = tournAggregate(name);
    const label = displayName(name);
    return (
      <tr onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d2040')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <td style={{ padding: '3px 14px', fontSize: '0.78rem', color: '#e2e8f0', whiteSpace: 'nowrap', borderRight: '1px solid #1e3a5f', borderBottom: '1px solid #0f1e33', position: 'sticky', left: 0, backgroundColor: '#0d1f3c', zIndex: 2, minWidth: NAME_W }}>
          {label}
        </td>
        {years.map(year => <ResultCell key={year} name={name} year={year} fixed={fixed} />)}
        <td style={{ padding: '3px 8px', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', borderLeft: '2px solid #1e3a5f', whiteSpace: 'nowrap', borderBottom: '1px solid #0f1e33' }}>{agg.sr}</td>
        <td style={{ padding: '3px 8px', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', borderLeft: '1px solid #1e3a5f', whiteSpace: 'nowrap', borderBottom: '1px solid #0f1e33' }}>{agg.wl}</td>
        <td style={{ padding: '3px 8px', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', borderLeft: '1px solid #1e3a5f', whiteSpace: 'nowrap', borderBottom: '1px solid #0f1e33' }}>{agg.pct}</td>
      </tr>
    );
  }

  function WLRow({ names }: { names: string[] }) {
    const agg = sectionAggregate(names);
    return (
      <tr style={{ backgroundColor: '#0a1628' }}>
        <td style={{ padding: '4px 14px', fontSize: '0.7rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', borderRight: '1px solid #1e3a5f', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f', position: 'sticky', left: 0, backgroundColor: '#0a1628', zIndex: 2 }}>
          Win–loss
        </td>
        {years.map(year => {
          const { w, l } = sectionYearWL(names, year);
          return (
            <td key={year} style={{ width: YEAR_W, textAlign: 'center', fontSize: '0.6rem', color: '#475569', padding: '3px 1px', borderLeft: '1px solid #1e3a5f', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f', whiteSpace: 'nowrap' }}>
              {(w || l) ? `${w}–${l}` : ''}
            </td>
          );
        })}
        <td style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', borderLeft: '2px solid #1e3a5f', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f', whiteSpace: 'nowrap' }}>{agg.sr}</td>
        <td style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', borderLeft: '1px solid #1e3a5f', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f', whiteSpace: 'nowrap' }}>{agg.wl}</td>
        <td style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', borderLeft: '1px solid #1e3a5f', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f', whiteSpace: 'nowrap' }}>{agg.pct}</td>
      </tr>
    );
  }

  // ─── Career stat totals ──────────────────────────────────────────────────────

  const totals = {
    tourn:  Object.values(cs).reduce((s, r) => s + r.tourn, 0),
    titles: Object.values(cs).reduce((s, r) => s + r.titles, 0),
    finals: Object.values(cs).reduce((s, r) => s + r.finals, 0),
    wins:   Object.values(cs).reduce((s, r) => s + r.wins, 0),
    losses: Object.values(cs).reduce((s, r) => s + r.losses, 0),
    hw: Object.values(cs).reduce((s, r) => s + r.hw, 0),
    hl: Object.values(cs).reduce((s, r) => s + r.hl, 0),
    cw: Object.values(cs).reduce((s, r) => s + r.cw, 0),
    cl: Object.values(cs).reduce((s, r) => s + r.cl, 0),
    gw: Object.values(cs).reduce((s, r) => s + r.gw, 0),
    gl: Object.values(cs).reduce((s, r) => s + r.gl, 0),
  };

  const statRows: Array<{ label: string; getValue: (y: number) => string | number; total: string }> = [
    { label: 'Tournaments',       getValue: y => cs[y]?.tourn || '', total: `Career total: ${totals.tourn}` },
    { label: 'Titles',            getValue: y => cs[y]?.titles || '', total: `Career total: ${totals.titles}` },
    { label: 'Finals',            getValue: y => cs[y]?.finals || '', total: `Career total: ${totals.finals}` },
    { label: 'Hard W–L',         getValue: y => { const r = cs[y]; return r?.hw || r?.hl ? `${r.hw}–${r.hl}` : ''; }, total: `${totals.hw}–${totals.hl} (${totals.hw + totals.hl ? Math.round(totals.hw / (totals.hw + totals.hl) * 100) : 0}%)` },
    { label: 'Clay W–L',         getValue: y => { const r = cs[y]; return r?.cw || r?.cl ? `${r.cw}–${r.cl}` : ''; }, total: `${totals.cw}–${totals.cl} (${totals.cw + totals.cl ? Math.round(totals.cw / (totals.cw + totals.cl) * 100) : 0}%)` },
    { label: 'Grass W–L',        getValue: y => { const r = cs[y]; return r?.gw || r?.gl ? `${r.gw}–${r.gl}` : ''; }, total: `${totals.gw}–${totals.gl} (${totals.gw + totals.gl ? Math.round(totals.gw / (totals.gw + totals.gl) * 100) : 0}%)` },
    { label: 'Overall W–L',      getValue: y => { const r = cs[y]; return r?.wins || r?.losses ? `${r.wins}–${r.losses}` : ''; }, total: `${totals.wins}–${totals.losses}` },
    { label: 'Win %',             getValue: y => { const r = cs[y]; const t = (r?.wins ?? 0) + (r?.losses ?? 0); return t ? `${Math.round(r.wins / t * 100)}%` : ''; }, total: `${totals.wins + totals.losses ? Math.round(totals.wins / (totals.wins + totals.losses) * 100) : 0}%` },
    { label: 'Year-end ranking',  getValue: y => yearRank[y] ?? '', total: '' },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0' }}>
      <NavBar />

      <div style={{ backgroundColor: '#0d1f3c', padding: '20px 24px 0' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Link href={`/players/${id}`} style={{ textDecoration: 'none' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', margin: 0, marginBottom: 12 }}>{player.full_name}</h1>
          </Link>
        </div>
      </div>

      <PlayerTabNav id={id} />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#f0c619', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
          Career Timeline
        </h2>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
          {(['W','F','SF','QF','4R','3R','2R','1R','RR','NH'] as const).map(code => {
            const labels: Record<string, string> = { W:'Winner', F:'Finalist', SF:'Semifinal', QF:'Quarterfinal', '4R':'4th Round', '3R':'3rd Round', '2R':'2nd Round', '1R':'1st Round', RR:'Round Robin', NH:'Not Held' };
            const [bg, fg] = RESULT_STYLE[code];
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ backgroundColor: bg, color: fg, fontSize: '0.62rem', fontWeight: 700, borderRadius: 3, padding: '2px 5px', lineHeight: 1.3, border: code === 'NH' ? 'none' : undefined }}>{code}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{labels[code]}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '0.62rem', color: '#2e4a6a', fontWeight: 600, lineHeight: 1.3 }}>A</span>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Absent</span>
          </div>
        </div>
        {/* Olympics legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: '#475569', marginRight: 4 }}>Olympics:</span>
          {([['G','Gold'],['S','Silver'],['B','Bronze'],['4th','4th place']] as const).map(([code, label]) => {
            const [bg, fg] = RESULT_STYLE[code];
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ backgroundColor: bg, color: fg, fontSize: '0.62rem', fontWeight: 700, borderRadius: 3, padding: '2px 5px', lineHeight: 1.3 }}>{code}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', border: '1px solid #1e3a5f', borderRadius: 10, WebkitOverflowScrolling: 'touch' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: NAME_W }} />
              {years.map(y => <col key={y} style={{ width: YEAR_W }} />)}
              <col style={{ width: 58 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 52 }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#070f1c', borderBottom: '2px solid #1e3a5f' }}>
                <th style={{ padding: '6px 14px', textAlign: 'left', color: '#64748b', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: '#070f1c', zIndex: 3, borderRight: '1px solid #1e3a5f' }}>
                  Tournament
                </th>
                {years.map(y => (
                  <th key={y} style={{ width: YEAR_W, textAlign: 'center', color: '#94a3b8', fontSize: '0.63rem', fontWeight: 700, padding: '6px 2px', borderLeft: '1px solid #1e3a5f', letterSpacing: '-0.02em' }}>
                    {y}
                  </th>
                ))}
                {[{ h: 'SR', t: 'Titles / Appearances' }, { h: 'W–L', t: 'Win–Loss' }, { h: 'Win%', t: 'Win percentage' }].map(({ h, t }, i) => (
                  <th key={h} title={t} style={{ padding: '6px 8px', textAlign: 'center', color: '#f0c619', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: i === 0 ? '2px solid #1e3a5f' : '1px solid #1e3a5f', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Grand Slams */}
              <SectionHeader label="Grand Slam Tournaments" />
              {GRAND_SLAMS.map(n => <TournamentRow key={n} name={n} fixed />)}
              <WLRow names={GRAND_SLAMS} />

              {/* Year-End Championships */}
              <SectionHeader label="Year-End Championships" />
              {FINALS_LIST.filter(n => byName.has(n)).map(n => <TournamentRow key={n} name={n} fixed />)}

              {/* Olympics */}
              {OLYMPIC_LIST.some(n => byName.has(n)) && (
                <>
                  <SectionHeader label="Olympics" />
                  {OLYMPIC_LIST.filter(n => byName.has(n)).map(n => <TournamentRow key={n} name={n} />)}
                </>
              )}

              {/* ATP Masters 1000 */}
              <SectionHeader label="ATP Masters 1000" />
              {MASTERS_LIST.filter(n => byName.has(n)).map(n => <TournamentRow key={n} name={n} fixed />)}
              <WLRow names={MASTERS_LIST} />

              {/* ATP 500 */}
              {fiveHundreds.length > 0 && (
                <>
                  <SectionHeader label="ATP 500" />
                  {fiveHundreds.map(n => <TournamentRow key={n} name={n} />)}
                  <WLRow names={fiveHundreds} />
                </>
              )}

              {/* ATP 250 */}
              {twoFifties.length > 0 && (
                <>
                  <SectionHeader label="ATP 250" />
                  {twoFifties.map(n => <TournamentRow key={n} name={n} />)}
                  <WLRow names={twoFifties} />
                </>
              )}

              {/* Career Statistics */}
              <SectionHeader label="Career Statistics" />
              {statRows.map(({ label, getValue, total }) => (
                <tr key={label} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d2040')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={{ padding: '4px 14px', fontSize: '0.73rem', color: '#94a3b8', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: '#0d1f3c', zIndex: 2, borderRight: '1px solid #1e3a5f', borderBottom: '1px solid #0f1e33' }}>
                    {label}
                  </td>
                  {years.map(year => (
                    <td key={year} style={{ width: YEAR_W, textAlign: 'center', fontSize: '0.68rem', color: label === 'Year-end ranking' ? '#f0c619' : '#e2e8f0', fontWeight: label === 'Year-end ranking' ? 700 : 400, padding: '3px 2px', borderLeft: '1px solid #1e3a5f', borderBottom: '1px solid #0f1e33', whiteSpace: 'nowrap' }}>
                      {getValue(year)}
                    </td>
                  ))}
                  <td colSpan={3} style={{ padding: '4px 10px', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', borderLeft: '2px solid #1e3a5f', borderBottom: '1px solid #0f1e33', whiteSpace: 'nowrap' }}>
                    {total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

// ─── Nav bar ─────────────────────────────────────────────────────────────────

