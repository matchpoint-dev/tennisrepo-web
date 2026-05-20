'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/countryUtils';
import NavBar from '../NavBar';
const LEVEL_LABELS: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals',
  '500': 'ATP 500', '250': 'ATP 250', A: 'ATP 250',
  D: 'Team Event', DC: 'Davis Cup', E: 'Exhibition', C: 'Challenger', NG: 'Exhibition',
  Olympics: 'Olympics', O: 'Olympics',
};
const LEVEL_COLORS: Record<string, string> = {
  G: '#f0c619', M: '#60a5fa', F: '#1e3a8a',
  '500': '#4b5563', '250': '#9ca3af', A: '#9ca3af',
  D: '#7c3aed', DC: '#7c3aed', E: '#06b6d4', C: '#64748b', NG: '#06b6d4',
  Olympics: '#0284c7', O: '#0284c7',
};
const SURFACE_COLORS: Record<string, string> = {
  Hard: '#3b82f6', Clay: '#c2521a', Grass: '#22c55e', Carpet: '#a855f7',
};
const ROUND_LABELS: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal',
  R16: 'Round of 16', R32: 'Round of 32', R64: 'Round of 64',
  R128: 'Round of 128', RR: 'Round Robin', BR: 'Bronze Match',
};
const EXCLUDED_TITLE_LEVELS = new Set(['D', 'DC', 'E', 'NG']);

interface Player { id: string; full_name: string; country_code: string; }

async function fetchPlayerData(playerId: string) {
  const [infoRes, rankRes, bestRankRes, titlesRes, winsRes, lossesRes, globalLatestRes] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('rankings').select('rank, ranking_date').eq('player_id', playerId)
      .order('ranking_date', { ascending: false }).limit(1).single(),
    supabase.from('rankings').select('rank').eq('player_id', playerId)
      .order('rank', { ascending: true }).limit(1).single(),
    supabase.from('matches')
      .select('tournaments(level)')
      .eq('winner_id', playerId)
      .eq('round', 'F'),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('winner_id', playerId).not('score', 'ilike', '%W/O%'),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('loser_id', playerId).not('score', 'ilike', '%W/O%'),
    supabase.from('rankings').select('ranking_date').order('ranking_date', { ascending: false }).limit(1).single(),
  ]);

  const info = infoRes.data ?? {};
  // Only show current rank if player appears in the most recent global ranking week
  const latestWeek = globalLatestRes.data?.ranking_date;
  const playerLatestDate = rankRes.data?.ranking_date;
  const isCurrentlyRanked = latestWeek && playerLatestDate && playerLatestDate === latestWeek;
  const currentRank = isCurrentlyRanked ? (rankRes.data?.rank ?? null) : null;
  const bestRank = bestRankRes.data?.rank ?? null;

  const allTitles = (titlesRes.data || []) as any[];
  const validTitles = allTitles.filter(t => !EXCLUDED_TITLE_LEVELS.has(t.tournaments?.level));
  const totalTitles = validTitles.length;
  const grandSlams  = validTitles.filter(t => t.tournaments?.level === 'G').length;
  const masters     = validTitles.filter(t => t.tournaments?.level === 'M').length;
  const atpFinals   = validTitles.filter(t => t.tournaments?.level === 'F').length;

  const totalWins   = winsRes.count ?? 0;
  const totalLosses = lossesRes.count ?? 0;
  const winPct = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;

  return { info, stats: { currentRank, bestRank, totalTitles, grandSlams, masters, atpFinals, totalWins, totalLosses, winPct } };
}

function PlayerSearchInput({
  label, side, value, onSelect, otherPlayerId,
}: {
  label: string; side: 'left' | 'right';
  value: Player | null;
  onSelect: (p: Player | null) => void;
  otherPlayerId?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value) setQuery(value.full_name); }, [value]);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('players')
        .select('id, full_name, country_code')
        .ilike('full_name', `%${query}%`)
        .limit(8);
      setResults((data || []).filter((p: any) => String(p.id) !== String(otherPlayerId)));
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [query, otherPlayerId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (p: Player) => { onSelect(p); setQuery(p.full_name); setOpen(false); };
  const clear  = () => { onSelect(null); setQuery(''); };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          placeholder={`Search ${label}…`}
          onChange={e => { setQuery(e.target.value); if (value) onSelect(null); }}
          onFocus={() => results.length && setOpen(true)}
          style={{
            width: '100%', padding: '0.7rem 2.2rem 0.7rem 1rem',
            backgroundColor: '#0a1628', border: '1px solid #1e3a5f',
            borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {value && (
          <button onClick={clear} style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {results.map((p: any) => {
            const flag = getFlagUrl(p.country_code);
            return (
              <div key={p.id} onClick={() => select(p)}
                style={{ padding: '0.6rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', borderBottom: '1px solid #0a1628' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#142035')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {flag && <img src={flag} alt={p.country_code} style={{ height: 14, borderRadius: 1 }} />}
                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{p.full_name}</span>
                <span style={{ color: '#475569', marginLeft: 'auto', fontSize: '0.78rem' }}>{p.country_code}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDob(dob: string | null): string {
  if (!dob) return '—';
  const [y, m, d] = dob.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
function calcAge(dob: string | null): string {
  if (!dob) return '';
  const [y, m, d] = dob.split('-').map(Number);
  const age = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / (365.25 * 24 * 3600 * 1000));
  return ` (age ${age})`;
}

export default function H2HPage() {
  const router = useRouter();
  const [player1, setPlayer1] = useState<Player | null>(null);
  const [player2, setPlayer2] = useState<Player | null>(null);
  const [p1Data, setP1Data] = useState<any>(null);
  const [p2Data, setP2Data] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [surfaceFilter, setSurfaceFilter] = useState('All');

  // Fetch player extended data when selected
  useEffect(() => {
    if (!player1) { setP1Data(null); return; }
    setStatsLoading(true);
    fetchPlayerData(player1.id).then(d => { setP1Data(d); setStatsLoading(false); });
  }, [player1]);
  useEffect(() => {
    if (!player2) { setP2Data(null); return; }
    setStatsLoading(true);
    fetchPlayerData(player2.id).then(d => { setP2Data(d); setStatsLoading(false); });
  }, [player2]);

  // Fetch H2H matches
  const fetchH2H = useCallback(async () => {
    if (!player1 || !player2) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('matches')
        .select('id, winner_id, loser_id, score, round, tournament_id, match_date, tournaments(id, name, year, surface, level)')
        .or(`and(winner_id.eq.${player1.id},loser_id.eq.${player2.id}),and(winner_id.eq.${player2.id},loser_id.eq.${player1.id})`)
        .order('match_date', { ascending: false })
        .limit(500);
      setMatches(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [player1, player2]);

  useEffect(() => { fetchH2H(); setSurfaceFilter('All'); }, [fetchH2H]);

  const filtered = surfaceFilter === 'All' ? matches : matches.filter(m => m.tournaments?.surface === surfaceFilter);
  const isWalkover = (m: any) => m.score && m.score.toUpperCase().includes('W/O');
  const p1Wins = filtered.filter(m => String(m.winner_id) === String(player1?.id) && !isWalkover(m)).length;
  const p2Wins = filtered.filter(m => String(m.winner_id) === String(player2?.id) && !isWalkover(m)).length;
  const surfaces = ['All', ...Array.from(new Set(matches.map(m => m.tournaments?.surface).filter(Boolean))) as string[]];

  // Compare stat row helper
  const better = (v1: number | null, v2: number | null, lowerIsBetter = false) => {
    if (v1 == null || v2 == null) return { p1: false, p2: false };
    if (v1 === v2) return { p1: false, p2: false };
    return lowerIsBetter
      ? { p1: v1 < v2, p2: v2 < v1 }
      : { p1: v1 > v2, p2: v2 > v1 };
  };

  const compStats: { label: string; p1: any; p2: any; lowerIsBetter?: boolean }[] = p1Data && p2Data ? [
    { label: 'Current Rank', p1: p1Data.stats.currentRank ?? '—', p2: p2Data.stats.currentRank ?? '—', lowerIsBetter: true },
    { label: 'Best Rank',    p1: p1Data.stats.bestRank ?? '—',    p2: p2Data.stats.bestRank ?? '—',    lowerIsBetter: true },
    { label: 'Total Titles', p1: p1Data.stats.totalTitles,        p2: p2Data.stats.totalTitles },
    { label: 'Grand Slams',  p1: p1Data.stats.grandSlams,         p2: p2Data.stats.grandSlams },
    { label: 'Masters 1000', p1: p1Data.stats.masters,            p2: p2Data.stats.masters },
    { label: 'ATP Finals',   p1: p1Data.stats.atpFinals,          p2: p2Data.stats.atpFinals },
    { label: 'Total Wins',   p1: p1Data.stats.totalWins,          p2: p2Data.stats.totalWins },
    { label: 'Win %',        p1: p1Data.stats.winPct != null ? `${p1Data.stats.winPct}%` : '—', p2: p2Data.stats.winPct != null ? `${p2Data.stats.winPct}%` : '—' },
  ] : [];

  const p1Flag = getFlagUrl(player1?.country_code ?? '');
  const p2Flag = getFlagUrl(player2?.country_code ?? '');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <NavBar />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f0c619', margin: '0 0 1.5rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Head to Head
        </h1>

        {/* Search row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
          <PlayerSearchInput label="Player 1" side="left" value={player1} onSelect={setPlayer1} otherPlayerId={player2?.id} />
          <span style={{ color: '#334155', fontWeight: 800, fontSize: '1.1rem', textAlign: 'center', padding: '0 0.5rem' }}>vs</span>
          <PlayerSearchInput label="Player 2" side="right" value={player2} onSelect={setPlayer2} otherPlayerId={player1?.id} />
        </div>

        {/* Main comparison panel */}
        {player1 && player2 && (
          <>
            {/* Three-column header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'start' }}>

              {/* Player 1 card */}
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, overflow: 'hidden' }}>
                {/* Player name banner */}
                <div style={{ backgroundColor: '#f0c619', padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {p1Flag && <img src={p1Flag} alt={player1.country_code} style={{ height: 20, borderRadius: 2 }} />}
                  <div>
                    <Link href={`/players/${player1.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0a1628', lineHeight: 1.2 }}>{player1.full_name}</div>
                    </Link>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1a1200' }}>{player1.country_code}</div>
                  </div>
                </div>
                {/* Profile table */}
                <div style={{ padding: '0.75rem 0' }}>
                  {p1Data ? [
                    { label: 'Date of Birth', value: p1Data.info.date_of_birth ? `${formatDob(p1Data.info.date_of_birth)}${calcAge(p1Data.info.date_of_birth)}` : '—' },
                    { label: 'Height', value: p1Data.info.height_cm ? `${p1Data.info.height_cm} cm` : '—' },
                    { label: 'Plays', value: p1Data.info.hand === 'R' ? 'Right-Handed' : p1Data.info.hand === 'L' ? 'Left-Handed' : p1Data.info.hand ?? '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 1.25rem', borderBottom: '1px solid #0a1628' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{row.label}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>{row.value}</span>
                    </div>
                  )) : (
                    <div style={{ padding: '1rem 1.25rem', color: '#475569', fontSize: '0.8rem' }}>Loading…</div>
                  )}
                </div>
              </div>

              {/* Center: win counts + comparison stats */}
              <div style={{ minWidth: 340 }}>
                {/* Win counter */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginBottom: '1.25rem', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, padding: '1.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem', fontWeight: 900, color: p1Wins >= p2Wins ? '#f0c619' : '#94a3b8', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p1Wins}</div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>{player1.full_name.split(' ').pop()}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>vs</div>
                    <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: '0.15rem' }}>{loading ? '…' : `${filtered.length} matches`}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem', fontWeight: 900, color: p2Wins > p1Wins ? '#f0c619' : '#94a3b8', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p2Wins}</div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>{player2.full_name.split(' ').pop()}</div>
                  </div>
                </div>

                {/* Comparison stats */}
                {compStats.length > 0 && (
                  <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, overflow: 'hidden' }}>
                    {compStats.map((row, i) => {
                      const b = better(
                        typeof row.p1 === 'number' ? row.p1 : null,
                        typeof row.p2 === 'number' ? row.p2 : null,
                        row.lowerIsBetter
                      );
                      return (
                        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: i < compStats.length - 1 ? '1px solid #0a1628' : 'none' }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: b.p1 ? '#f0c619' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{row.p1}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', padding: '0 0.75rem', whiteSpace: 'nowrap' }}>{row.label}</span>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: b.p2 ? '#f0c619' : '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.p2}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Player 2 card */}
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, overflow: 'hidden' }}>
                {/* Player name banner */}
                <div style={{ backgroundColor: '#1e3a5f', padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <Link href={`/players/${player2.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1.2 }}>{player2.full_name}</div>
                    </Link>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>{player2.country_code}</div>
                  </div>
                  {p2Flag && <img src={p2Flag} alt={player2.country_code} style={{ height: 20, borderRadius: 2 }} />}
                </div>
                {/* Profile table */}
                <div style={{ padding: '0.75rem 0' }}>
                  {p2Data ? [
                    { label: 'Date of Birth', value: p2Data.info.date_of_birth ? `${formatDob(p2Data.info.date_of_birth)}${calcAge(p2Data.info.date_of_birth)}` : '—' },
                    { label: 'Height', value: p2Data.info.height_cm ? `${p2Data.info.height_cm} cm` : '—' },
                    { label: 'Plays', value: p2Data.info.hand === 'R' ? 'Right-Handed' : p2Data.info.hand === 'L' ? 'Left-Handed' : p2Data.info.hand ?? '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 1.25rem', borderBottom: '1px solid #0a1628' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{row.label}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>{row.value}</span>
                    </div>
                  )) : (
                    <div style={{ padding: '1rem 1.25rem', color: '#475569', fontSize: '0.8rem' }}>Loading…</div>
                  )}
                </div>
              </div>
            </div>

            {/* Surface filter */}
            {surfaces.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {surfaces.map(s => (
                  <button key={s} onClick={() => setSurfaceFilter(s)}
                    style={{ padding: '0.35rem 0.9rem', borderRadius: 20, border: `1px solid ${surfaceFilter === s ? (SURFACE_COLORS[s] || '#f0c619') : '#1e3a5f'}`, backgroundColor: surfaceFilter === s ? (SURFACE_COLORS[s] || '#f0c619') + '22' : 'transparent', color: surfaceFilter === s ? (SURFACE_COLORS[s] || '#f0c619') : '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                    {s}{s !== 'All' && <span style={{ marginLeft: '0.3rem', fontSize: '0.75rem', opacity: 0.8 }}>({matches.filter(m => m.tournaments?.surface === s).length})</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Match history — same table style as match page H2H */}
            {loading ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Loading matches…</div>
            ) : filtered.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem', backgroundColor: '#0d1f3c', borderRadius: 12, border: '1px solid #1e3a5f' }}>
                No matches found{surfaceFilter !== 'All' ? ` on ${surfaceFilter}` : ''}.
              </div>
            ) : (
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '14px', overflow: 'hidden' }}>
                {/* Table column headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '55px 185px 115px 180px 120px 85px 1fr',
                  padding: '0.5rem 1.25rem',
                  borderBottom: '1px solid #1e3a5f',
                  backgroundColor: '#0a1628',
                }}>
                  {['Year', 'Winner', 'Level', 'Event', 'Round', 'Surface', 'Score'].map(col => (
                    <span key={col} style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: col === 'Score' ? 'right' : 'left' }}>
                      {col}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                {filtered.map((m: any, i: number) => {
                  const winnerIsP1 = String(m.winner_id) === String(player1.id);
                  const winner = winnerIsP1 ? player1 : player2;
                  const winnerFlag = getFlagUrl(winner.country_code);
                  const t = m.tournaments;
                  const lvlColor = LEVEL_COLORS[t?.level] ?? '#94a3b8';
                  const sfcColor = SURFACE_COLORS[t?.surface] ?? '#94a3b8';
                  return (
                    <Link key={m.id} href={`/matches/${m.id}`} style={{ textDecoration: 'none' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '55px 185px 115px 180px 120px 85px 1fr',
                          alignItems: 'center',
                          padding: '0.7rem 1.25rem',
                          borderBottom: i < filtered.length - 1 ? '1px solid #0f2030' : 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0a1e38')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Year */}
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                          {t?.year ?? '—'}
                        </span>
                        {/* Winner */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                          {winnerFlag && <img src={winnerFlag} alt={winner.country_code} style={{ height: 14, borderRadius: 1, flexShrink: 0 }} />}
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: winnerIsP1 ? '#f0c619' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {winner.full_name}
                          </span>
                        </div>
                        {/* Level */}
                        {t?.level ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: lvlColor, border: `1px solid ${lvlColor}55`, backgroundColor: `${lvlColor}15`, whiteSpace: 'nowrap', display: 'inline-block', width: 'fit-content' }}>
                            {LEVEL_LABELS[t.level] ?? t.level}
                          </span>
                        ) : <span />}
                        {/* Event */}
                        <span style={{ fontSize: '0.82rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t?.name ?? '—'}
                        </span>
                        {/* Round */}
                        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                          {ROUND_LABELS[m.round] ?? m.round ?? '—'}
                        </span>
                        {/* Surface */}
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: sfcColor }}>
                          {t?.surface ?? '—'}
                        </span>
                        {/* Score */}
                        <span style={{ fontSize: '0.82rem', color: '#64748b', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', display: 'block', width: '100%' }}>
                          {m.score || '—'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!player1 && !player2 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '4rem', backgroundColor: '#0d1f3c', borderRadius: 12, border: '1px solid #1e3a5f' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎾</div>
            <p style={{ margin: 0, fontSize: '1rem' }}>Search for two players above to compare their head-to-head record.</p>
          </div>
        )}
      </main>
    </div>
  );
}
