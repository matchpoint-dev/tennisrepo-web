'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/countryUtils';
import NavBar from '../NavBar';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCLUDED_LEVELS = new Set(['D', 'DC', 'E', 'NG']);

// ─── Hard-coded stats (sourced from ATP Tour / Wikipedia, current through early 2026) ─
// playerId = 0 → no profile link

const HC_GS_SF: StatRecord[] = [
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 54 },
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 46 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 38 },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 31 },
  { playerId: 0, playerName: 'Ivan Lendl',     countryCode: 'CZE', value: 28 },
];

const HC_GS_QF: StatRecord[] = [
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 65 },
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 58 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 47 },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 41 },
  { playerId: 0, playerName: 'Roy Emerson',    countryCode: 'AUS', value: 37 },
];

const HC_WEEKS_NO1: StatRecord[] = [
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 428 },
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 310 },
  { playerId: 0, playerName: 'Pete Sampras',   countryCode: 'USA', value: 286 },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 268 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 209 },
  { playerId: 0, playerName: 'Björn Borg',     countryCode: 'SWE', value: 109 },
  { playerId: 0, playerName: 'Andre Agassi',   countryCode: 'USA', value: 101 },
  { playerId: 0, playerName: 'Lleyton Hewitt', countryCode: 'AUS', value:  80 },
];

const HC_WEEKS_TOP5: StatRecord[] = [
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 860 },
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 859 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 837 },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 705 },
  { playerId: 0, playerName: 'Ivan Lendl',     countryCode: 'CZE', value: 563 },
  { playerId: 0, playerName: 'Pete Sampras',   countryCode: 'USA', value: 511 },
  { playerId: 0, playerName: 'Boris Becker',   countryCode: 'GER', value: 476 },
  { playerId: 0, playerName: 'Andre Agassi',   countryCode: 'USA', value: 443 },
  { playerId: 0, playerName: 'Stefan Edberg',  countryCode: 'SWE', value: 434 },
  { playerId: 0, playerName: 'John McEnroe',   countryCode: 'USA', value: 430 },
];

const HC_WEEKS_TOP10: StatRecord[] = [
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 968 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 912 },
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 861 },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 817 },
  { playerId: 0, playerName: 'Andre Agassi',   countryCode: 'USA', value: 747 },
  { playerId: 0, playerName: 'Ivan Lendl',     countryCode: 'CZE', value: 671 },
  { playerId: 0, playerName: 'Pete Sampras',   countryCode: 'USA', value: 586 },
  { playerId: 0, playerName: 'Boris Becker',   countryCode: 'GER', value: 576 },
  { playerId: 0, playerName: 'John McEnroe',   countryCode: 'USA', value: 540 },
];

const HC_YEAR_END_NO1: StatRecord[] = [
  { playerId: 0, playerName: 'Novak Djokovic', countryCode: 'SRB', value: 8, extra: '2011,12,14,15,18,20,21,23' },
  { playerId: 0, playerName: 'Pete Sampras',   countryCode: 'USA', value: 6, extra: '1993–1998' },
  { playerId: 0, playerName: 'Roger Federer',  countryCode: 'SUI', value: 5, extra: '2004–07, 2009' },
  { playerId: 0, playerName: 'Jimmy Connors',  countryCode: 'USA', value: 5 },
  { playerId: 0, playerName: 'Rafael Nadal',   countryCode: 'ESP', value: 5, extra: '2008,10,13,17,19' },
];
const TABS = [
  { key: 'grand-slams', label: 'Grand Slams' },
  { key: 'atp-tour',    label: 'ATP Tour' },
  { key: 'career',      label: 'Career Records' },
  { key: 'surface',     label: 'By Surface' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatRecord {
  playerId: number;
  playerName: string;
  countryCode: string;
  value: number | string;
  extra?: string;
}

interface FinalsRow {
  winnerId: number;
  loserId: number;
  surface: string | null;
  level: string | null;
  year: number | null;
  name: string | null;
}

type PlayerMap = Map<number, { full_name: string; country_code: string }>;

// ─── Player lookup ────────────────────────────────────────────────────────────

async function fetchPlayerMap(ids: number[]): Promise<PlayerMap> {
  if (!ids.length) return new Map();
  const map: PlayerMap = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data } = await supabase.from('players').select('id, full_name, country_code').in('id', chunk);
    for (const p of data || []) map.set(p.id, p);
  }
  return map;
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

function makeRow(id: number, map: PlayerMap, value: number | string, extra?: string): StatRecord {
  const p = map.get(id);
  return { playerId: id, playerName: p?.full_name ?? 'Unknown', countryCode: p?.country_code ?? '', value, extra };
}

function topFromCounts(counts: Map<number, number>, map: PlayerMap, n = 10): StatRecord[] {
  return [...counts.entries()]
    .filter(([id]) => map.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, v]) => makeRow(id, map, v));
}

function finalsWon(finals: FinalsRow[], filter: (f: FinalsRow) => boolean, map: PlayerMap, n = 10): StatRecord[] {
  const counts = new Map<number, number>();
  for (const f of finals) {
    if (!filter(f)) continue;
    counts.set(f.winnerId, (counts.get(f.winnerId) || 0) + 1);
  }
  return topFromCounts(counts, map, n);
}

function finalsPlayed(finals: FinalsRow[], filter: (f: FinalsRow) => boolean, map: PlayerMap, n = 10): StatRecord[] {
  const counts = new Map<number, number>();
  for (const f of finals) {
    if (!filter(f)) continue;
    counts.set(f.winnerId, (counts.get(f.winnerId) || 0) + 1);
    counts.set(f.loserId,  (counts.get(f.loserId)  || 0) + 1);
  }
  return topFromCounts(counts, map, n);
}

function finalsWinRate(finals: FinalsRow[], filter: (f: FinalsRow) => boolean, map: PlayerMap, minFinals: number, n = 10): StatRecord[] {
  const wins = new Map<number, number>();
  const apps = new Map<number, number>();
  for (const f of finals) {
    if (!filter(f)) continue;
    wins.set(f.winnerId, (wins.get(f.winnerId) || 0) + 1);
    apps.set(f.winnerId, (apps.get(f.winnerId) || 0) + 1);
    apps.set(f.loserId,  (apps.get(f.loserId)  || 0) + 1);
  }
  const rows: StatRecord[] = [];
  for (const [id, a] of apps) {
    if (a < minFinals || !map.has(id)) continue;
    const w = wins.get(id) || 0;
    rows.push(makeRow(id, map, ((w / a) * 100).toFixed(1) + '%', `${w}W-${a - w}L`));
  }
  return rows.sort((a, b) => parseFloat(b.value as string) - parseFloat(a.value as string)).slice(0, n);
}

function surfaceWinRate(rows: any[], map: PlayerMap, minMatches: number, n = 10): StatRecord[] {
  return rows
    .filter(r => (r.wins + r.losses) >= minMatches && map.has(r.player_id))
    .map(r => makeRow(r.player_id, map, ((r.wins / (r.wins + r.losses)) * 100).toFixed(1) + '%', `${r.wins}W-${r.losses}L`))
    .sort((a, b) => parseFloat(b.value as string) - parseFloat(a.value as string))
    .slice(0, n);
}

// ─── Slam name normalizer ─────────────────────────────────────────────────────

function slamKey(name: string | null): string {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('australian')) return 'ao';
  if (n.includes('roland') || n.includes('french')) return 'rg';
  if (n.includes('wimbledon')) return 'wim';
  if (n.includes('us open') || n === 'us open') return 'uso';
  return '';
}

// ─── Paginated data loaders ───────────────────────────────────────────────────

/** Load all tournament finals (paginated). Includes tournament name for slam identification. */
async function loadAllFinals(): Promise<FinalsRow[]> {
  const all: FinalsRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('matches')
      .select('winner_id, loser_id, tournaments(surface, level, year, name)')
      .eq('round', 'F')
      .not('winner_id', 'is', null)
      .not('loser_id', 'is', null)
      .range(offset, offset + 999);
    if (!data?.length) break;
    for (const m of data) {
      const t = (m as any).tournaments;
      const lvl = t?.level ?? null;
      if (lvl && EXCLUDED_LEVELS.has(lvl)) continue;
      all.push({
        winnerId: m.winner_id as number,
        loserId:  m.loser_id  as number,
        surface:  t?.surface ?? null,
        level:    lvl,
        year:     t?.year    ?? null,
        name:     t?.name    ?? null,
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

/** Load all player surface win/loss stats. Only fetches wins & losses. */
async function loadPlayerWL(): Promise<Map<number, { wins: number; losses: number }>> {
  const surfaceTotals = new Map<number, { wins: number; losses: number }>();
  const overallMap    = new Map<number, { wins: number; losses: number }>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('player_stats')
      .select('player_id, surface, wins, losses')
      .gt('wins', 0)
      .range(offset, offset + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (r.surface === 'Overall') {
        overallMap.set(r.player_id, { wins: r.wins, losses: r.losses });
      } else {
        const prev = surfaceTotals.get(r.player_id) || { wins: 0, losses: 0 };
        surfaceTotals.set(r.player_id, { wins: prev.wins + r.wins, losses: prev.losses + r.losses });
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  // Merge: prefer Overall row when available
  const result = new Map<number, { wins: number; losses: number }>();
  for (const [id, sums] of surfaceTotals) result.set(id, overallMap.get(id) ?? sums);
  for (const [id, overall] of overallMap)  if (!result.has(id)) result.set(id, overall);
  return result;
}

/** Paginate all win/loss rows for a specific surface (no row-limit truncation). */
async function loadSurfaceWL(surface: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('player_stats')
      .select('player_id, wins, losses')
      .eq('surface', surface)
      .gt('wins', 0)
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

/** Lazy-load match service stats (aces, DFs, BP). Called only when Career tab opens. */
async function loadMatchStats() {
  const aceMap   = new Map<number, number>();
  const dfMap    = new Map<number, number>();
  const bpSaved  = new Map<number, number>();
  const bpFaced  = new Map<number, number>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('matches')
      .select('winner_id, loser_id, w_ace, l_ace, w_df, l_df, w_bpsaved, w_bpfaced, l_bpsaved, l_bpfaced')
      .not('winner_id', 'is', null)
      .range(offset, offset + 999);
    if (!data?.length) break;
    for (const m of data) {
      const wid = m.winner_id as number, lid = m.loser_id as number;
      if (m.w_ace  != null) aceMap.set(wid,  (aceMap.get(wid)  || 0) + m.w_ace);
      if (m.l_ace  != null) aceMap.set(lid,  (aceMap.get(lid)  || 0) + m.l_ace);
      if (m.w_df   != null) dfMap.set(wid,   (dfMap.get(wid)   || 0) + m.w_df);
      if (m.l_df   != null) dfMap.set(lid,   (dfMap.get(lid)   || 0) + m.l_df);
      if (m.w_bpsaved != null) bpSaved.set(wid, (bpSaved.get(wid) || 0) + m.w_bpsaved);
      if (m.w_bpfaced != null) bpFaced.set(wid, (bpFaced.get(wid) || 0) + m.w_bpfaced);
      if (m.l_bpsaved != null) bpSaved.set(lid, (bpSaved.get(lid) || 0) + m.l_bpsaved);
      if (m.l_bpfaced != null) bpFaced.set(lid, (bpFaced.get(lid) || 0) + m.l_bpfaced);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return { aceMap, dfMap, bpSaved, bpFaced };
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ title, subtitle, color, records, loading, valueLabel }: {
  title: string; subtitle?: string; color: string;
  records: StatRecord[]; loading: boolean; valueLabel: string;
}) {
  const podium = ['#f0c619', '#94a3b8', '#cd7c44'];
  return (
    <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e3a5f', backgroundColor: '#0a1628' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>{title}</h3>
          <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>{valueLabel}</span>
        </div>
        {subtitle && <p style={{ margin: '0.2rem 0 0', fontSize: '0.73rem', color: '#475569' }}>{subtitle}</p>}
      </div>
      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: '0.65rem 1.25rem', borderBottom: i < 4 ? '1px solid #0a1628' : 'none', display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
              <div style={{ width: 18, height: 12, backgroundColor: '#1e3a5f', borderRadius: 3, opacity: 0.4, flexShrink: 0 }} />
              <div style={{ width: 20, height: 14, backgroundColor: '#1e3a5f', borderRadius: 2, opacity: 0.35, flexShrink: 0 }} />
              <div style={{ flex: 1, height: 12, backgroundColor: '#1e3a5f', borderRadius: 3, opacity: 0.35 }} />
              <div style={{ width: 38, height: 12, backgroundColor: '#1e3a5f', borderRadius: 3, opacity: 0.4 }} />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>No data</div>
      ) : (
        <div>
          {records.map((rec, idx) => (
            <div key={`${rec.playerId}-${idx}`}
              style={{ padding: '0.6rem 1.25rem', borderBottom: idx < records.length - 1 ? '1px solid #0a1628' : 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#142035')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ width: 18, textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, flexShrink: 0, color: idx < 3 ? podium[idx] : '#475569' }}>
                {idx + 1}
              </span>
              {rec.countryCode
                ? <img src={getFlagUrl(rec.countryCode) ?? ''} alt={rec.countryCode} style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 20, height: 14, flexShrink: 0 }} />
              }
              {rec.playerId > 0 ? (
                <Link href={`/players/${rec.playerId}`}
                  style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f0c619')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#e2e8f0')}
                >
                  {rec.playerName}
                </Link>
              ) : (
                <span style={{ color: '#e2e8f0', fontWeight: 500, fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rec.playerName}
                </span>
              )}
              {rec.extra && <span style={{ color: '#475569', fontSize: '0.74rem', flexShrink: 0 }}>{rec.extra}</span>}
              <span style={{ color, fontWeight: 700, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 38, textAlign: 'right' }}>
                {typeof rec.value === 'number' ? rec.value.toLocaleString() : rec.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '1px solid #1e3a5f' }}>
      <h2 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</h2>
      {note && <p style={{ margin: '0.15rem 0 0', fontSize: '0.73rem', color: '#475569' }}>{note}</p>}
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [era, setEra]             = useState<'all' | 'open'>('all');
  const [activeTab, setActiveTab] = useState('grand-slams');

  // Raw data
  const [careerWL,    setCareerWL]    = useState<Map<number, { wins: number; losses: number }>>(new Map());
  const [hardStats,   setHardStats]   = useState<any[]>([]);
  const [clayStats,   setClayStats]   = useState<any[]>([]);
  const [grassStats,  setGrassStats]  = useState<any[]>([]);
  const [finals,      setFinals]      = useState<FinalsRow[]>([]);
  const [aceMap,      setAceMap]      = useState<Map<number, number>>(new Map());
  const [dfMap,       setDfMap]       = useState<Map<number, number>>(new Map());
  const [bpSavedMap,  setBpSavedMap]  = useState<Map<number, number>>(new Map());
  const [bpFacedMap,  setBpFacedMap]  = useState<Map<number, number>>(new Map());
  const [playerMap,   setPlayerMap]   = useState<PlayerMap>(new Map());

  // Loading flags
  const [loadingWL,      setLoadingWL]      = useState(true);
  const [loadingSurface, setLoadingSurface] = useState(true);
  const [loadingFinals,  setLoadingFinals]  = useState(true);
  const [loadingMatch,   setLoadingMatch]   = useState(false);
  const [matchLoaded,    setMatchLoaded]    = useState(false);

  const mergeMap = (nm: PlayerMap) => setPlayerMap(prev => new Map([...prev, ...nm]));

  // ── Career W/L (surface rows summed) ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      const wl = await loadPlayerWL();
      setCareerWL(wl);
      mergeMap(await fetchPlayerMap([...wl.keys()]));
      setLoadingWL(false);
    })();
  }, []);

  // ── Surface win/loss stats (fully paginated — no row-limit cutoff) ─────────
  useEffect(() => {
    (async () => {
      const [h, c, g] = await Promise.all([
        loadSurfaceWL('Hard'),
        loadSurfaceWL('Clay'),
        loadSurfaceWL('Grass'),
      ]);
      setHardStats(h);
      setClayStats(c);
      setGrassStats(g);
      const ids = [...new Set([
        ...h.map((r: any) => r.player_id),
        ...c.map((r: any) => r.player_id),
        ...g.map((r: any) => r.player_id),
      ])];
      mergeMap(await fetchPlayerMap(ids));
      setLoadingSurface(false);
    })();
  }, []);

  // ── All finals (paginated) ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const all = await loadAllFinals();
      setFinals(all);
      const ids = [...new Set([...all.map(f => f.winnerId), ...all.map(f => f.loserId)])];
      mergeMap(await fetchPlayerMap(ids));
      setLoadingFinals(false);
    })();
  }, []);

  // ── Match stats — lazy load on Career tab ────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'career' || matchLoaded || loadingMatch) return;
    setLoadingMatch(true);
    (async () => {
      const { aceMap: am, dfMap: dm, bpSaved, bpFaced } = await loadMatchStats();
      setAceMap(am); setDfMap(dm); setBpSavedMap(bpSaved); setBpFacedMap(bpFaced);
      mergeMap(await fetchPlayerMap([...new Set([...am.keys(), ...dm.keys()])]));
      setMatchLoaded(true);
      setLoadingMatch(false);
    })();
  }, [activeTab, matchLoaded, loadingMatch]);

  // ─── Derived stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const openYear  = era === 'open' ? 1968 : 0;
    const eraFinals = openYear ? finals.filter(f => (f.year ?? 0) >= openYear) : finals;

    // Filters
    const isGS      = (f: FinalsRow) => f.level === 'G';
    const isMasters = (f: FinalsRow) => f.level === 'M';
    const isATPF    = (f: FinalsRow) => f.level === 'F';
    const is500     = (f: FinalsRow) => f.level === '500';
    const is250     = (f: FinalsRow) => f.level === '250' || f.level === 'A';
    const isHard    = (f: FinalsRow) => f.surface === 'Hard';
    const isClay    = (f: FinalsRow) => f.surface === 'Clay';
    const isGrass   = (f: FinalsRow) => f.surface === 'Grass';
    const anyValid  = (_: FinalsRow) => true;
    const isAO      = (f: FinalsRow) => f.level === 'G' && slamKey(f.name) === 'ao';
    const isRG      = (f: FinalsRow) => f.level === 'G' && slamKey(f.name) === 'rg';
    const isWim     = (f: FinalsRow) => f.level === 'G' && slamKey(f.name) === 'wim';
    const isUSO     = (f: FinalsRow) => f.level === 'G' && slamKey(f.name) === 'uso';

    // ── Career W-L from summed surface stats ────────────────────────────────
    const wlEntries = [...careerWL.entries()].filter(([id]) => playerMap.has(id));

    const careerWins = wlEntries
      .sort((a, b) => b[1].wins - a[1].wins)
      .slice(0, 10)
      .map(([id, v]) => makeRow(id, playerMap, v.wins, `${v.wins}W-${v.losses}L`));

    const careerMatches = wlEntries
      .sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
      .slice(0, 10)
      .map(([id, v]) => makeRow(id, playerMap, v.wins + v.losses, `${v.wins}W-${v.losses}L`));

    const winRate = wlEntries
      .filter(([, v]) => (v.wins + v.losses) >= 200)
      .map(([id, v]) => ({ id, rate: v.wins / (v.wins + v.losses), ...v }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10)
      .map(r => makeRow(r.id, playerMap, (r.rate * 100).toFixed(1) + '%', `${r.wins}W-${r.losses}L`));

    // ── Titles per season ────────────────────────────────────────────────────
    // From finals wins, group by year → find player with most wins in a single season
    const seasonBests = new Map<number, number>(); // playerId -> best single-season total
    const seasonCounts = new Map<string, number>(); // `pid|year` -> count
    for (const f of eraFinals) {
      if (f.year == null) continue;
      const key = `${f.winnerId}|${f.year}`;
      seasonCounts.set(key, (seasonCounts.get(key) || 0) + 1);
    }
    for (const [key, cnt] of seasonCounts) {
      const pid = parseInt(key.split('|')[0]);
      if (!seasonBests.has(pid) || cnt > seasonBests.get(pid)!) seasonBests.set(pid, cnt);
    }
    const mostTitlesInSeason = [...seasonBests.entries()]
      .filter(([id]) => playerMap.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, v]) => {
        // find which year this best season was
        let bestYear = 0;
        for (const [key, cnt] of seasonCounts) {
          const [pidStr, yrStr] = key.split('|');
          if (parseInt(pidStr) === id && cnt === v) { bestYear = parseInt(yrStr); break; }
        }
        return makeRow(id, playerMap, v, bestYear ? String(bestYear) : '');
      });

    // ── Match stats ──────────────────────────────────────────────────────────
    const topAces = [...aceMap.entries()]
      .filter(([id]) => playerMap.has(id))
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, v]) => makeRow(id, playerMap, v));

    const topDFs = [...dfMap.entries()]
      .filter(([id]) => playerMap.has(id))
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, v]) => makeRow(id, playerMap, v));

    const bpSaveRows: StatRecord[] = [];
    for (const [id, saved] of bpSavedMap) {
      if (!playerMap.has(id)) continue;
      const faced = bpFacedMap.get(id) || 0;
      if (faced < 300) continue;
      bpSaveRows.push(makeRow(id, playerMap, ((saved / faced) * 100).toFixed(1) + '%', `${saved}/${faced}`));
    }
    const bestBPSave = bpSaveRows
      .sort((a, b) => parseFloat(b.value as string) - parseFloat(a.value as string))
      .slice(0, 10);

    return {
      // GS titles by slam
      aoTitles:   finalsWon(eraFinals, isAO,  playerMap),
      rgTitles:   finalsWon(eraFinals, isRG,  playerMap),
      wimTitles:  finalsWon(eraFinals, isWim, playerMap),
      usoTitles:  finalsWon(eraFinals, isUSO, playerMap),
      // GS finals
      gsTitles:        finalsWon(eraFinals,     isGS, playerMap),
      gsFinalApps:     finalsPlayed(eraFinals,  isGS, playerMap),
      gsFinalWinRate:  finalsWinRate(eraFinals, isGS, playerMap, 3),
      // ATP Tour
      mostTitles:       finalsWon(eraFinals,     anyValid, playerMap),
      mostFinalApps:    finalsPlayed(eraFinals,  anyValid, playerMap),
      bestFinalRate:    finalsWinRate(eraFinals, anyValid, playerMap, 10),
      mastersTitles:    finalsWon(eraFinals,     isMasters, playerMap),
      mastersFinalApps: finalsPlayed(eraFinals,  isMasters, playerMap),
      mastersFinalRate: finalsWinRate(eraFinals, isMasters, playerMap, 5),
      atpFinalsTitles:  finalsWon(eraFinals,     isATPF, playerMap),
      atpFinalApps:     finalsPlayed(eraFinals,  isATPF, playerMap),
      atp500Titles:     finalsWon(eraFinals,     is500,  playerMap),
      atp500FinalApps:  finalsPlayed(eraFinals,  is500,  playerMap),
      atp250Titles:     finalsWon(eraFinals,     is250,  playerMap),
      atp250FinalApps:  finalsPlayed(eraFinals,  is250,  playerMap),
      hardTitles:       finalsWon(eraFinals,     isHard,  playerMap),
      clayTitles:       finalsWon(eraFinals,     isClay,  playerMap),
      grassTitles:      finalsWon(eraFinals,     isGrass, playerMap),
      mostTitlesInSeason,
      // Career
      careerWins, careerMatches, winRate,
      // Match stats
      topAces, topDFs, bestBPSave,
      // Surface win rates
      hardWinRate:    surfaceWinRate(hardStats,  playerMap, 200),
      clayWinRate:    surfaceWinRate(clayStats,  playerMap, 150),
      grassWinRate:   surfaceWinRate(grassStats, playerMap,  50),
      hardFinalWins:  finalsWon(eraFinals,    isHard,  playerMap),
      hardFinalApps:  finalsPlayed(eraFinals, isHard,  playerMap),
      clayFinalWins:  finalsWon(eraFinals,    isClay,  playerMap),
      clayFinalApps:  finalsPlayed(eraFinals, isClay,  playerMap),
      grassFinalWins: finalsWon(eraFinals,    isGrass, playerMap),
      grassFinalApps: finalsPlayed(eraFinals, isGrass, playerMap),
    };
  }, [careerWL, hardStats, clayStats, grassStats, finals, aceMap, dfMap, bpSavedMap, bpFacedMap, playerMap, era]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const eraNote  = era === 'open' ? 'Open Era (1968-present)' : 'All time';
  const psLoad   = loadingWL;
  const finLoad  = loadingFinals;
  const surLoad  = loadingSurface;
  const mLoad    = loadingMatch || !matchLoaded;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      <NavBar />

      <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '2rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0c619', margin: 0 }}>Records &amp; Statistics</h1>
            <p style={{ color: '#64748b', margin: '0.3rem 0 0', fontSize: '0.875rem' }}>All-time leaders across every major category</p>
          </div>
          <div style={{ display: 'flex', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '8px', overflow: 'hidden' }}>
            {(['all', 'open'] as const).map(e => (
              <button key={e} onClick={() => setEra(e)} style={{
                padding: '0.45rem 1.1rem', border: 'none', cursor: 'pointer', fontSize: '0.83rem',
                fontWeight: 600, transition: 'all 0.15s',
                backgroundColor: era === e ? '#1e3a5f' : 'transparent',
                color: era === e ? '#e2e8f0' : '#64748b',
              }}>
                {e === 'all' ? 'All Time' : 'Open Era'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f', marginBottom: '1.75rem', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '0.7rem 1.25rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#f0c619' : '#64748b',
              backgroundColor: 'transparent', whiteSpace: 'nowrap',
              borderBottom: activeTab === tab.key ? '2px solid #f0c619' : '2px solid transparent',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ── GRAND SLAMS ────────────────────────────────────────────────────── */}
        {activeTab === 'grand-slams' && (
          <div>
            <SectionHead title="Titles by Individual Slam" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Australian Open Titles" subtitle={eraNote} color="#3b82f6" records={stats.aoTitles}  loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Roland Garros Titles"   subtitle={eraNote} color="#c2521a" records={stats.rgTitles}  loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Wimbledon Titles"       subtitle={eraNote} color="#22c55e" records={stats.wimTitles} loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most US Open Titles"         subtitle={eraNote} color="#f0c619" records={stats.usoTitles} loading={finLoad} valueLabel="Titles" />
            </StatGrid>

            <SectionHead title="Grand Slam Finals" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Grand Slam Titles"          subtitle={eraNote} color="#f0c619" records={stats.gsTitles}       loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Grand Slam Finals Reached"  subtitle={eraNote} color="#e2a720" records={stats.gsFinalApps}    loading={finLoad} valueLabel="Finals" />
              <StatCard title="Best Grand Slam Finals Win Rate" subtitle={`${eraNote} · min. 3 finals`} color="#a855f7" records={stats.gsFinalWinRate} loading={finLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="Grand Slam Deep Runs" note="Open Era · sourced from ATP Tour / Wikipedia" />
            <StatGrid>
              <StatCard title="Most Grand Slam Semifinals"    subtitle="Open Era · through 2026 AO" color="#f0c619" records={HC_GS_SF} loading={false} valueLabel="SFs" />
              <StatCard title="Most Grand Slam Quarterfinals" subtitle="Open Era · through 2026 AO" color="#e2a720" records={HC_GS_QF} loading={false} valueLabel="QFs" />
            </StatGrid>
          </div>
        )}

        {/* ── ATP TOUR ────────────────────────────────────────────────────────── */}
        {activeTab === 'atp-tour' && (
          <div>
            <SectionHead title="Overall" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Career Titles"         subtitle={eraNote} color="#22c55e" records={stats.mostTitles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Career Finals Reached" subtitle={eraNote} color="#94a3b8" records={stats.mostFinalApps} loading={finLoad} valueLabel="Finals" />
              <StatCard title="Best Career Finals Win Rate" subtitle={`${eraNote} · min. 10 finals`} color="#a855f7" records={stats.bestFinalRate} loading={finLoad} valueLabel="Win %" />
            </StatGrid>
            <StatGrid>
              <StatCard title="Most Titles in a Single Season" subtitle={eraNote} color="#f0c619" records={stats.mostTitlesInSeason} loading={finLoad} valueLabel="Titles" />
            </StatGrid>

            <SectionHead title="ATP Finals (Year-End Championship)" note={eraNote} />
            <StatGrid>
              <StatCard title="Most ATP Finals Titles"       subtitle={eraNote} color="#a855f7" records={stats.atpFinalsTitles} loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most ATP Finals Appearances"  subtitle={eraNote} color="#9333ea" records={stats.atpFinalApps}    loading={finLoad} valueLabel="Apps" />
            </StatGrid>

            <SectionHead title="Masters 1000" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Masters 1000 Titles"         subtitle={eraNote} color="#3b82f6" records={stats.mastersTitles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Masters 1000 Finals Reached" subtitle={eraNote} color="#60a5fa" records={stats.mastersFinalApps} loading={finLoad} valueLabel="Finals" />
              <StatCard title="Best Masters 1000 Finals Win Rate" subtitle={`${eraNote} · min. 5 finals`} color="#a855f7" records={stats.mastersFinalRate} loading={finLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="ATP 500" note={eraNote} />
            <StatGrid>
              <StatCard title="Most ATP 500 Titles"          subtitle={eraNote} color="#22c55e" records={stats.atp500Titles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most ATP 500 Finals Reached"  subtitle={eraNote} color="#4ade80" records={stats.atp500FinalApps} loading={finLoad} valueLabel="Finals" />
            </StatGrid>

            <SectionHead title="ATP 250" note={eraNote} />
            <StatGrid>
              <StatCard title="Most ATP 250 Titles"         subtitle={eraNote} color="#94a3b8" records={stats.atp250Titles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most ATP 250 Finals Reached" subtitle={eraNote} color="#cbd5e1" records={stats.atp250FinalApps} loading={finLoad} valueLabel="Finals" />
            </StatGrid>

            <SectionHead title="By Surface" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Hard Court Titles"  subtitle={eraNote} color="#3b82f6" records={stats.hardTitles}  loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Clay Court Titles"  subtitle={eraNote} color="#c2521a" records={stats.clayTitles}  loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Grass Court Titles" subtitle={eraNote} color="#22c55e" records={stats.grassTitles} loading={finLoad} valueLabel="Titles" />
            </StatGrid>
          </div>
        )}

        {/* ── CAREER RECORDS ──────────────────────────────────────────────────── */}
        {activeTab === 'career' && (
          <div>
            <SectionHead title="Win-Loss Records" note="Career totals across all surfaces — not affected by era filter" />
            <StatGrid>
              <StatCard title="Most Career Wins"            color="#22c55e" records={stats.careerWins}    loading={psLoad} valueLabel="Wins" />
              <StatCard title="Most Career Matches Played"  color="#94a3b8" records={stats.careerMatches} loading={psLoad} valueLabel="Matches" />
              <StatCard title="Best Career Win Rate"        subtitle="Min. 200 career matches" color="#a855f7" records={stats.winRate} loading={psLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="Finals Records" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Titles"          subtitle={eraNote} color="#f0c619" records={stats.mostTitles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Finals Reached"  subtitle={eraNote} color="#e2a720" records={stats.mostFinalApps} loading={finLoad} valueLabel="Finals" />
              <StatCard title="Best Finals Win Rate" subtitle={`${eraNote} · min. 10 finals`} color="#a855f7" records={stats.bestFinalRate} loading={finLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="Masters 1000 Records" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Masters 1000 Titles"          subtitle={eraNote} color="#3b82f6" records={stats.mastersTitles}    loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Masters 1000 Finals Reached"  subtitle={eraNote} color="#60a5fa" records={stats.mastersFinalApps} loading={finLoad} valueLabel="Finals" />
              <StatCard title="Best Masters 1000 Finals Win Rate" subtitle={`${eraNote} · min. 5 finals`} color="#a855f7" records={stats.mastersFinalRate} loading={finLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="Match Statistics" note={activeTab === 'career' && !matchLoaded ? 'Loading match data...' : 'Career totals from all ATP matches with available stats'} />
            <StatGrid>
              <StatCard title="Most Career Aces"           color="#f0c619" records={stats.topAces}   loading={mLoad} valueLabel="Aces" />
              <StatCard title="Most Career Double Faults"  color="#ef4444" records={stats.topDFs}    loading={mLoad} valueLabel="DFs" />
              <StatCard title="Best Break Point Save Rate" subtitle="Min. 300 BP faced" color="#22c55e" records={stats.bestBPSave} loading={mLoad} valueLabel="Save %" />
            </StatGrid>

            <SectionHead title="ATP Rankings Records" note="Sourced from ATP Tour / Wikipedia · not era-filtered" />
            <StatGrid>
              <StatCard title="Most Weeks at World No. 1"  subtitle="All time" color="#f0c619" records={HC_WEEKS_NO1}    loading={false} valueLabel="Weeks" />
              <StatCard title="Most Weeks in Top 5"        subtitle="All time" color="#22c55e" records={HC_WEEKS_TOP5}   loading={false} valueLabel="Weeks" />
              <StatCard title="Most Weeks in Top 10"       subtitle="All time" color="#3b82f6" records={HC_WEEKS_TOP10}  loading={false} valueLabel="Weeks" />
              <StatCard title="Most Year-End No. 1 Finishes" subtitle="All time" color="#a855f7" records={HC_YEAR_END_NO1} loading={false} valueLabel="Times" />
            </StatGrid>
          </div>
        )}

        {/* ── BY SURFACE ──────────────────────────────────────────────────────── */}
        {activeTab === 'surface' && (
          <div>
            <SectionHead title="Surface Win Rates" note="From player stats · Hard min. 200 matches · Clay min. 150 · Grass min. 50" />
            <StatGrid>
              <StatCard title="Best Hard Court Win Rate"  subtitle="Min. 200 matches" color="#3b82f6" records={stats.hardWinRate}  loading={surLoad} valueLabel="Win %" />
              <StatCard title="Best Clay Court Win Rate"  subtitle="Min. 150 matches" color="#c2521a" records={stats.clayWinRate}  loading={surLoad} valueLabel="Win %" />
              <StatCard title="Best Grass Court Win Rate" subtitle="Min. 50 matches"  color="#22c55e" records={stats.grassWinRate} loading={surLoad} valueLabel="Win %" />
            </StatGrid>

            <SectionHead title="Hard Court Finals" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Hard Court Titles"         subtitle={eraNote} color="#3b82f6" records={stats.hardFinalWins} loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Hard Court Finals Reached" subtitle={eraNote} color="#60a5fa" records={stats.hardFinalApps} loading={finLoad} valueLabel="Finals" />
            </StatGrid>

            <SectionHead title="Clay Court Finals" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Clay Court Titles"         subtitle={eraNote} color="#c2521a" records={stats.clayFinalWins} loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Clay Court Finals Reached" subtitle={eraNote} color="#ef7c4a" records={stats.clayFinalApps} loading={finLoad} valueLabel="Finals" />
            </StatGrid>

            <SectionHead title="Grass Court Finals" note={eraNote} />
            <StatGrid>
              <StatCard title="Most Grass Court Titles"         subtitle={eraNote} color="#22c55e" records={stats.grassFinalWins} loading={finLoad} valueLabel="Titles" />
              <StatCard title="Most Grass Court Finals Reached" subtitle={eraNote} color="#4ade80" records={stats.grassFinalApps} loading={finLoad} valueLabel="Finals" />
            </StatGrid>
          </div>
        )}

      </main>
    </div>
  );
}
