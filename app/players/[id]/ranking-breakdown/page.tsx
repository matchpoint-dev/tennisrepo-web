'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Inter } from 'next/font/google';
import { supabase } from '../../../lib/supabase';
import PlayerTabNav from '../PlayerTabNav';
import NavBar from '../../../NavBar';

const inter = Inter({ subsets: ['latin'] });

// ─────────────────────────────────────────────────────────────────────────────
// ATP POINTS TABLE  (accurate per ATP official rules, current system)
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_PTS: Record<string, Record<string, number>> = {
  G:     { W: 2000, F: 1300, SF: 800,  QF: 400, R16: 200, R32: 100, R64: 50,  R128: 10 },
  M:     { W: 1000, F: 650,  SF: 400,  QF: 200, R16: 100, R32: 50,  R64: 30,  R128: 10 },
  '500': { W: 500,  F: 330,  SF: 200,  QF: 100, R16: 50,  R32: 0,   R64: 0              },
  '250': { W: 250,  F: 165,  SF: 100,  QF: 50,  R16: 25,  R32: 0,   R64: 0              },
  A:     { W: 250,  F: 165,  SF: 100,  QF: 50,  R16: 25,  R32: 0,   R64: 0              },
  C:     { W: 125,  F: 75,   SF: 45,   QF: 25,  R16: 10,  R32: 5,   R64: 0              },
};

// United Cup: points per individual match WIN, based on opponent ATP rank + round.
// Rounds: RR = group stage, QF = city semi, SF = semi-final, F = final.
const UNITED_CUP_PTS: { maxRank: number; pts: Record<string, number> }[] = [
  { maxRank: 10,       pts: { RR: 55, QF: 80,  SF: 130, F: 180 } },
  { maxRank: 20,       pts: { RR: 45, QF: 65,  SF: 105, F: 140 } },
  { maxRank: 30,       pts: { RR: 40, QF: 55,  SF: 90,  F: 120 } },
  { maxRank: 50,       pts: { RR: 35, QF: 40,  SF: 60,  F: 90  } },
  { maxRank: 100,      pts: { RR: 25, QF: 35,  SF: 40,  F: 60  } },
  { maxRank: 250,      pts: { RR: 20, QF: 25,  SF: 35,  F: 40  } },
  { maxRank: Infinity, pts: { RR: 15, QF: 20,  SF: 25,  F: 35  } },
];

// Round depth -- used to find "deepest loss" (= best result)
const ROUND_DEPTH: Record<string, number> = {
  R128: 0, R64: 1, R32: 2, R16: 3, RR: 3, QF: 5, SF: 6, F: 7,
};

// Round -> display label
const ROUND_LABEL: Record<string, string> = {
  R128: '1R', R64: '2R', R32: '3R', R16: '4R', QF: 'QF', SF: 'SF', F: 'F',
};

// Levels excluded from ATP ranking (team events, exhibitions, NextGen Finals).
// 'D' is handled separately -- United Cup is un-excluded by name check.
const EXCLUDED = new Set(['E', 'NG']);

// Mandatory levels -- always count toward the best-19 total regardless of result.
const MANDATORY_LEVELS = new Set(['G', 'M', 'F']);
const MAX_COUNTING = 19;

// ── Presentation constants ────────────────────────────────────────────────────

const LEVEL_LABEL: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals',
  '500': 'ATP 500', '250': 'ATP 250', A: 'ATP 250', C: 'Challenger',
  D: 'United Cup',
};

const LEVEL_COLOR: Record<string, string> = {
  G: '#f0c619', M: '#3b82f6', F: '#a855f7',
  '500': '#22c55e', '250': '#94a3b8', A: '#94a3b8', C: '#64748b',
  D: '#f97316',
};

const RESULT_STYLE: Record<string, [string, string]> = {
  W:    ['#00a550', '#fff'],
  F:    ['#92d050', '#1a2800'],
  SF:   ['#c6efce', '#0a2a1a'],
  QF:   ['#ffeb9c', '#2a2800'],
  '4R': ['#ffff99', '#2a2800'],
  '3R': ['#ffff99', '#2a2800'],
  '2R': ['#ffff99', '#2a2800'],
  '1R': ['#ffff99', '#2a2800'],
};

const SURFACE_COLOR: Record<string, string> = {
  Hard: '#3b82f6', Clay: '#c2521a', Grass: '#22c55e', Carpet: '#a855f7',
};

// ── Points calculation ────────────────────────────────────────────────────────

interface PointsResult { pts: number; result: string; approx: boolean }

function unitedCupPtsForMatch(opponentRank: number | null, round: string): number {
  if (!opponentRank || opponentRank <= 0) return 0;
  const tier = UNITED_CUP_PTS.find(t => opponentRank <= t.maxRank)!;
  // Map any unrecognized round to RR (group stage)
  const r = ['RR', 'QF', 'SF', 'F'].includes(round) ? round : 'RR';
  return tier.pts[r] ?? 0;
}

function computePoints(level: string, tournamentName: string, matches: any[], pid: string): PointsResult {
  if (!matches.length) return { pts: 0, result: '', approx: false };

  // ── United Cup: sum per-match-win points based on opponent rank ───────────
  if (level === 'D') {
    const wins = matches.filter(m => String(m.winner_id) === pid);
    if (!wins.length) return { pts: 0, result: '', approx: false };

    let totalPts = 0;
    for (const m of wins) {
      totalPts += unitedCupPtsForMatch(m.loser_rank as number | null, m.round);
    }

    const wonF  = matches.some(m => m.round === 'F'  && String(m.winner_id) === pid);
    const lostF = matches.some(m => m.round === 'F'  && String(m.loser_id)  === pid);
    const wonSF = matches.some(m => m.round === 'SF' && String(m.winner_id) === pid);
    const lostSF= matches.some(m => m.round === 'SF' && String(m.loser_id)  === pid);

    let result: string;
    if      (wonF)         result = 'W';
    else if (lostF)        result = 'F';
    else if (wonSF||lostSF)result = 'SF';
    else                   result = `${wins.length}W`;

    return { pts: totalPts, result, approx: false };
  }

  // ── ATP Finals: round-robin + knockout ────────────────────────────────────
  if (level === 'F') {
    const rrWins = matches.filter(m => m.round === 'RR' && String(m.winner_id) === pid).length;
    const wonSF  = matches.some(m => m.round === 'SF' && String(m.winner_id) === pid);
    const lostSF = matches.some(m => m.round === 'SF' && String(m.loser_id)  === pid);
    const wonF   = matches.some(m => m.round === 'F'  && String(m.winner_id) === pid);
    const lostF  = matches.some(m => m.round === 'F'  && String(m.loser_id)  === pid);

    const pts = rrWins * 200 + (wonSF ? 400 : 0) + (wonF ? 500 : 0);

    let result: string;
    if (wonF)       result = 'W';
    else if (lostF) result = 'F';
    else if (wonSF || lostSF) result = 'SF';
    else            result = `${rrWins}W RR`;

    return { pts, result, approx: false };
  }

  // ── All other levels ──────────────────────────────────────────────────────
  const table = LEVEL_PTS[level];
  if (!table) return { pts: 0, result: '', approx: true };

  if (matches.some(m => m.round === 'F' && String(m.winner_id) === pid)) {
    return { pts: table.W ?? 0, result: 'W', approx: level === 'C' };
  }

  const losses = matches.filter(m => String(m.loser_id) === pid);
  if (!losses.length) return { pts: 0, result: '', approx: false };

  const elimRound = losses.reduce((best, m) =>
    (ROUND_DEPTH[m.round] ?? -1) > (ROUND_DEPTH[best.round] ?? -1) ? m : best,
    losses[0],
  ).round as string;

  return {
    pts:    table[elimRound] ?? 0,
    result: ROUND_LABEL[elimRound] ?? elimRound,
    approx: level === 'C',
  };
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RankingBreakdownPage() {
  const { id } = useParams() as { id: string };

  const [player,      setPlayer]     = useState<any>(null);
  const [ranking,     setRanking]    = useState<any>(null);
  const [matches,     setMatches]    = useState<any[]>([]);
  // name(lower)+year → final match_date for every tournament in the fetch window
  const [nameYearFinal, setNameYearFinal] = useState<Map<string, string>>(new Map());
  const [loading,     setLoading]    = useState(true);

  useEffect(() => {
    async function load() {
      const today       = new Date();
      const cutoff      = new Date(today);
      cutoff.setDate(cutoff.getDate() - 385);
      const cutoffStr   = cutoff.toISOString().split('T')[0];
      const currentYear = today.getFullYear();

      const [{ data: p }, { data: rk }] = await Promise.all([
        supabase.from('players').select('id, full_name, country_code').eq('id', id).single(),
        supabase.from('rankings')
          .select('rank, points, ranking_date')
          .eq('player_id', id)
          .gte('ranking_date', cutoffStr)
          .order('ranking_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setPlayer(p);
      setRanking(rk);

      // Fetch 3 years of tournament metadata (need name + year to match editions)
      const { data: recentTourns } = await supabase
        .from('tournaments')
        .select('id, name, year, start_date')
        .in('year', [currentYear - 2, currentYear - 1, currentYear]);

      const allTourns = recentTourns ?? [];

      const validTids = allTourns
        .filter((t: any) => {
          const d = t.start_date ?? null;
          return d && d >= cutoffStr;
        })
        .map((t: any) => t.id as number);

      if (validTids.length > 0) {
        // Fetch player's matches + the final match of EVERY tournament in the window
        // (not just the player's — we need to know when each tournament ended so we
        //  can determine when the previous year's edition's points expire).
        const [matchRes, finalsRes] = await Promise.all([
          supabase
            .from('matches')
            .select('id, winner_id, loser_id, winner_rank, loser_rank, round, match_date, tournament_id, tournaments(id, name, year, level, surface, start_date)')
            .or(`winner_id.eq.${id},loser_id.eq.${id}`)
            .in('tournament_id', validTids)
            .order('id', { ascending: true }),
          // Only need the final (round='F') to know when each tournament ended
          supabase
            .from('matches')
            .select('tournament_id, match_date')
            .eq('round', 'F')
            .in('tournament_id', validTids),
        ]);

        setMatches(matchRes.data ?? []);

        // Build "name(lower)__year" → final match_date
        // First build tid → {name, year} from tournament metadata
        const tidMeta: Record<number, { name: string; year: number }> = {};
        for (const t of allTourns) tidMeta[t.id] = { name: t.name, year: t.year };

        const nyf = new Map<string, string>();
        for (const f of finalsRes.data ?? []) {
          const meta = tidMeta[f.tournament_id];
          if (!meta || !f.match_date) continue;
          const key = `${meta.name.toLowerCase()}__${meta.year}`;
          // Keep the latest final date if duplicates exist
          if (!nyf.has(key) || f.match_date > nyf.get(key)!) {
            nyf.set(key, f.match_date);
          }
        }
        setNameYearFinal(nyf);
      }

      setLoading(false);
    }
    load();
  }, [id]);

  // ── Process breakdown ─────────────────────────────────────────────────────

  const breakdown = useMemo(() => {
    const pid      = String(id);
    const todayStr = new Date().toISOString().split('T')[0];

    // Group the player's matches by tournament_id
    const byTid = new Map<string, { matches: any[]; t: any }>();
    for (const m of matches) {
      const t = m.tournaments;
      if (!t) continue;
      if (EXCLUDED.has(t.level)) continue;
      if (t.level === 'D' && !t.name.toLowerCase().includes('united cup')) continue;

      const tid = String(t.id);
      if (!byTid.has(tid)) byTid.set(tid, { matches: [], t });
      byTid.get(tid)!.matches.push(m);
    }

    type Entry = {
      name: string; level: string; surface: string; year: number;
      pts: number; result: string; approx: boolean; tid: string; startDate: string;
      // expiryDate: the final match_date of the NEXT edition of this tournament.
      // null = next edition hasn't ended (or hasn't started) — points are still active.
      expiryDate: string | null;
      expired: boolean;
    };
    const dedup = new Map<string, Entry>();

    for (const [tid, { matches: ms, t }] of byTid) {
      const { pts, result, approx } = computePoints(t.level, t.name, ms, pid);
      if (!result) continue;

      const startDate = t.start_date ?? `${t.year}-01-01`;
      const nk        = t.name.toLowerCase();

      // Drop date = exactly 1 year after the tournament's start date.
      const expiryDate = startDate
        ? `${t.year + 1}-${startDate.slice(5)}`  // same month/day, next year
        : null;
      const expired    = expiryDate !== null && expiryDate <= todayStr;

      const key = `${nk}__${t.year}`;
      const existing = dedup.get(key);
      if (!existing || pts > existing.pts) {
        dedup.set(key, {
          name: t.name, level: t.level, surface: t.surface,
          year: t.year, pts, result, approx, tid, startDate, expiryDate, expired,
        });
      }
    }

    const allEntries = Array.from(dedup.values());

    // ── Best-19 selection ──────────────────────────────────────────────────
    // Mandatory: G, M, F -- always count regardless of result.
    // Optional:  everything else -- best results fill remaining slots up to 19.
    // Expired entries never count (points already dropped).
    const activeEntries  = allEntries.filter(e => !e.expired);
    const expiredEntries = allEntries.filter(e => e.expired);

    const mandatory = activeEntries.filter(e => MANDATORY_LEVELS.has(e.level));
    const optional  = activeEntries.filter(e => !MANDATORY_LEVELS.has(e.level));

    const sortedOptional = [...optional].sort((a, b) => b.pts - a.pts);
    const slotsLeft      = Math.max(0, MAX_COUNTING - mandatory.length);
    const countingOpt    = sortedOptional.slice(0, slotsLeft);
    const nonCountingOpt = sortedOptional.slice(slotsLeft);

    const countingEntries = [...mandatory, ...countingOpt];
    // Expired entries are dropped from the ranking entirely — hide from both tables.
    const nonCounting     = nonCountingOpt
      .sort((a, b) => b.pts - a.pts);

    const computedTotal  = countingEntries.reduce((s, e) => s + e.pts, 0);
    const challengerPts  = countingEntries.filter(e => e.approx).reduce((s, e) => s + e.pts, 0);

    // Group counting entries by normalised level
    const LEVEL_ORDER = ['G', 'F', 'M', '500', '250', 'C', 'D'];
    const grouped = new Map<string, typeof countingEntries>();
    for (const lvl of LEVEL_ORDER) grouped.set(lvl, []);

    for (const e of countingEntries) {
      const key = (e.level === 'A') ? '250' : e.level;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    }

    for (const arr of grouped.values()) {
      arr.sort((a, b) => {
        const ya = parseInt(a.startDate.slice(0, 4));
        const yb = parseInt(b.startDate.slice(0, 4));
        if (ya !== yb) return yb - ya;
        return a.startDate.localeCompare(b.startDate);
      });
    }

    // Category totals for the composition bar (counting entries only)
    const byCategory: Record<string, number> = {};
    for (const e of countingEntries) {
      const key = e.level === 'A' ? '250' : e.level;
      byCategory[key] = (byCategory[key] ?? 0) + e.pts;
    }

    return {
      grouped, nonCounting, computedTotal, byCategory, challengerPts,
      totalCounting: countingEntries.length,
      totalMandatory: mandatory.length,
    };
  }, [matches, id, nameYearFinal]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      {player && <PlayerTabNav id={id} />}
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>Loading ranking breakdown...</div>
    </div>
  );

  if (!player) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>Player not found.</div>
    </div>
  );

  const { grouped, nonCounting, computedTotal, byCategory, challengerPts, totalCounting, totalMandatory } = breakdown;

  const actualPts   = ranking?.points ?? 0;
  const currentRank = ranking?.rank   ?? null;

  const today   = new Date();
  const cutoff  = new Date(today); cutoff.setDate(cutoff.getDate() - 364);
  const fmtOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const windowEnd   = today.toLocaleDateString('en-US', fmtOpts);
  const windowStart = cutoff.toLocaleDateString('en-US', fmtOpts);

  const totalEntries = totalCounting + nonCounting.length;

  const catOrder = ['G', 'M', 'F', '500', '250', 'C', 'D'];
  const totalForBar = Object.values(byCategory).reduce((s, v) => s + v, 0) || 1;
  const barSegments = catOrder
    .filter(c => (byCategory[c] ?? 0) > 0)
    .map(c => ({ level: c, pts: byCategory[c], pct: byCategory[c] / totalForBar * 100 }));

  // expiryDate is the final match_date of the next edition of this tournament,
  // or null if that edition hasn't ended yet (points still active, drop date unknown).
  function dropDateStr(expiryDate: string | null): string {
    if (!expiryDate) return '—';
    return new Date(expiryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function daysUntilDrop(expiryDate: string | null): number | null {
    if (!expiryDate) return null;
    return Math.round((new Date(expiryDate + 'T00:00:00').getTime() - Date.now()) / 86400000);
  }
  function dropColor(days: number | null): string {
    if (days === null) return '#475569';   // unknown — muted
    if (days <= 0)     return '#ef4444';
    if (days <= 21)    return '#ef4444';
    if (days <= 60)    return '#f97316';
    if (days <= 120)   return '#facc15';
    return '#475569';
  }

  const LEVEL_TITLES: Record<string, string> = {
    G: 'Grand Slams', F: 'ATP Finals', M: 'Masters 1000',
    '500': 'ATP 500', '250': 'ATP 250', C: 'Challengers', D: 'United Cup',
  };

  // Counting table: Tournament | Result | Points | Gained | Drops
  const COLS    = '2fr 80px 90px 130px 160px';
  // Non-counting table: Tournament | Level | Result | Points | Drops
  const COLS_NC = '1fr 120px 80px 90px 160px';

  function TableHeader({ cols }: { cols: string }) {
    const headers = cols === COLS
      ? ['Tournament', 'Result', 'Points', 'Gained', 'Drops']
      : ['Tournament', 'Level', 'Result', 'Points', 'Drops'];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, backgroundColor: '#070f1c', borderBottom: '1px solid #1e3a5f', padding: '7px 20px' }}>
        {headers.map(h => (
          <div key={h} style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Tournament' ? 'left' : 'right' }}>
            {h}
          </div>
        ))}
      </div>
    );
  }

  function TournamentRow({ e, i, lastIdx, cols }: { e: any; i: number; lastIdx: number; cols: string }) {
    const [resBg, resFg] = RESULT_STYLE[e.result] ?? ['#1e3a5f', '#64748b'];
    const ptsColor = e.pts >= 1000 ? '#f0c619' : e.pts >= 360 ? '#60a5fa' : e.pts >= 90 ? '#e2e8f0' : '#94a3b8';
    const isNC   = cols === COLS_NC;
    const days   = daysUntilDrop(e.expiryDate);
    const dColor = dropColor(days);
    const rowBase  = i % 2 === 0 ? 'transparent' : '#0d1f3c';

    return (
      <div
        key={`${e.tid}-${i}`}
        style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: i < lastIdx ? '1px solid #0f1e33' : 'none', backgroundColor: rowBase, opacity: isNC ? 0.65 : 1 }}
        onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = '#112240')}
        onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = rowBase)}
      >
        {/* Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: SURFACE_COLOR[e.surface] ?? '#475569', flexShrink: 0, display: 'inline-block' }} title={e.surface} />
          <Link href={`/tournaments/${e.tid}`} style={{ textDecoration: 'none', color: isNC ? '#475569' : '#e2e8f0', fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.name}
          </Link>
          {e.approx && (
            <span title="Points approximate" style={{ fontSize: '0.58rem', color: '#64748b', border: '1px solid #334155', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>~</span>
          )}
        </div>

        {/* Level badge (non-counting table only) */}
        {isNC && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: LEVEL_COLOR[e.level] ?? '#94a3b8' }}>
              {LEVEL_LABEL[e.level] ?? e.level}
            </span>
          </div>
        )}

        {/* Result */}
        <div style={{ textAlign: 'right' }}>
          <span style={{ display: 'inline-block', backgroundColor: resBg, color: resFg, fontSize: '0.68rem', fontWeight: 700, borderRadius: 3, padding: '3px 7px' }}>
            {e.result}
          </span>
        </div>

        {/* Points */}
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: isNC ? '#334155' : ptsColor, fontVariantNumeric: 'tabular-nums', textDecoration: isNC ? 'line-through' : 'none' }}>
            {e.pts.toLocaleString()}
          </span>
        </div>

        {/* Gained (counting table only) */}
        {!isNC && (
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            {fmtDate(e.startDate)}
          </div>
        )}

        {/* Drops (both tables) */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: dColor, fontVariantNumeric: 'tabular-nums', fontWeight: (days !== null && days <= 60) ? 600 : 400 }}>
            {dropDateStr(e.expiryDate)}
          </div>
          <div style={{ fontSize: '0.62rem', color: dColor, opacity: 0.85, marginTop: 1 }}>
            {days === null ? '' : days <= 0 ? 'Dropping' : `in ${days}d`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0' }}>
      <NavBar />

      {/* Player header */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '20px 24px 0' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Link href={`/players/${id}`} style={{ textDecoration: 'none' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', margin: 0, marginBottom: 12 }}>
              {player.full_name}
            </h1>
          </Link>
        </div>
      </div>

      <PlayerTabNav id={id} />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#f0c619', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.2rem' }}>
          Ranking Breakdown
        </h2>

        {/* Summary cards */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>

          <div style={{ background: 'linear-gradient(135deg, #0d1f3c 60%, #1a2800 100%)', border: '1px solid #f0c61940', borderRadius: 10, padding: '16px 22px', minWidth: 130 }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Current Rank</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f0c619', lineHeight: 1 }}>
              {currentRank ? `#${currentRank}` : '-'}
            </div>
          </div>

          <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '16px 22px', minWidth: 130 }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Official ATP Pts</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>{actualPts.toLocaleString()}</div>
          </div>

          <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '16px 22px', minWidth: 130 }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Counting Results</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>
              {totalCounting}
              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 400, marginLeft: 4 }}>/ {MAX_COUNTING}</span>
            </div>
            <div style={{ fontSize: '0.67rem', color: '#475569', marginTop: 4 }}>
              {totalMandatory} mandatory
            </div>
          </div>

          <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '16px 22px' }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>52-Week Window</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#94a3b8', lineHeight: 1.6 }}>
              {windowStart}<br /><span style={{ color: '#334155' }}>to</span> {windowEnd}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {totalEntries === 0 ? (
          <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 12, padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#475569', marginBottom: 8 }}>No ranking points found</div>
            <div style={{ fontSize: '0.82rem', color: '#334155' }}>
              No ATP main-tour results were found in the last 52 weeks for this player.
            </div>
          </div>
        ) : (
          <>
            {/* Composition bar */}
            {barSegments.length > 0 && (
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 12, gap: 2 }}>
                  {barSegments.map(s => (
                    <div key={s.level} title={`${LEVEL_LABEL[s.level]}: ${s.pts.toLocaleString()} pts`}
                      style={{ width: `${s.pct}%`, backgroundColor: LEVEL_COLOR[s.level], borderRadius: 2, minWidth: s.pct > 0.5 ? 3 : 0 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                  {barSegments.map(s => (
                    <div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: LEVEL_COLOR[s.level], flexShrink: 0 }} />
                      <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{LEVEL_LABEL[s.level]}</span>
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#e2e8f0' }}>{s.pts.toLocaleString()}</span>
                      <span style={{ fontSize: '0.68rem', color: '#475569' }}>({s.pct.toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Counting tables grouped by level */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {catOrder.map(lvl => {
                const rows = grouped.get(lvl) ?? [];
                if (!rows.length) return null;
                const sectionTotal = rows.reduce((s, e) => s + e.pts, 0);

                return (
                  <div key={lvl} style={{ border: '1px solid #1e3a5f', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px', backgroundColor: '#0d1f3c', borderBottom: '2px solid #1e3a5f' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: LEVEL_COLOR[lvl] }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {LEVEL_TITLES[lvl]}
                        </span>
                        {MANDATORY_LEVELS.has(lvl) && (
                          <span style={{ fontSize: '0.6rem', color: '#475569', border: '1px solid #334155', borderRadius: 3, padding: '1px 5px' }}>
                            mandatory
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: LEVEL_COLOR[lvl] ?? '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                        {sectionTotal.toLocaleString()} pts
                      </span>
                    </div>

                    <TableHeader cols={COLS} />

                    {rows.map((e, i) => (
                      <TournamentRow key={`${e.tid}-${i}`} e={e} i={i} lastIdx={rows.length - 1} cols={COLS} />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Grand total */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                Best {totalCounting} result{totalCounting !== 1 ? 's' : ''}
                {challengerPts > 0 && ' · challenger pts approximate'}
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f0c619', fontVariantNumeric: 'tabular-nums' }}>
                {computedTotal.toLocaleString()} pts
              </span>
            </div>

            {/* Non-counting table */}
            {nonCounting.length > 0 && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#1e3a5f' }} />
                  <span style={{ fontSize: '0.7rem', color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                    Not Counting Toward Total
                  </span>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#1e3a5f' }} />
                </div>
                <p style={{ fontSize: '0.78rem', color: '#334155', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {nonCounting.some(e => e.expired)
                    ? `These results are outside the best ${MAX_COUNTING} or have already dropped from the ranking.`
                    : `These results are outside the best ${MAX_COUNTING} and do not count toward the total.`
                  }
                </p>

                <div style={{ border: '1px solid #1a2d47', borderRadius: 10, overflow: 'hidden', opacity: 0.85 }}>
                  <TableHeader cols={COLS_NC} />
                  {nonCounting.map((e, i) => (
                    <TournamentRow key={`nc-${e.tid}-${i}`} e={e} i={i} lastIdx={nonCounting.length - 1} cols={COLS_NC} />
                  ))}
                </div>

                <div style={{ marginTop: 8, textAlign: 'right', fontSize: '0.72rem', color: '#334155' }}>
                  {nonCounting.reduce((s, e) => s + e.pts, 0).toLocaleString()} pts not counting
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
