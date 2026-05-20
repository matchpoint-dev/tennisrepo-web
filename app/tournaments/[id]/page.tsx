'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getFlagUrl } from '../../lib/countryUtils';
import NavBar from '../../NavBar';
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

function getTournamentLabel(name: string, level: string): string {
  return LEVEL_LABELS[level] ?? level;
}
function getTournamentColor(name: string, level: string): string {
  return LEVEL_COLORS[level] ?? '#94a3b8';
}
const SURFACE_COLORS: Record<string, string> = {
  Hard: '#3b82f6', Clay: '#c2521a', Grass: '#22c55e', Carpet: '#a855f7',
};
const SURFACE_BG: Record<string, string> = {
  Hard: 'rgba(59,130,246,0.08)', Clay: 'rgba(194,82,26,0.08)', Grass: 'rgba(34,197,94,0.08)', Carpet: 'rgba(168,85,247,0.08)',
};
// Tournaments that share the same event across multiple name eras
// Jeff Sackmann changed some names between pre-2020 and 2020+ CSVs
const TOURNAMENT_ALIAS_GROUPS: string[][] = [
  ['Tour Finals', 'Masters Cup'],          // ATP year-end championship
  ['US Open', 'Us Open'],                  // capitalisation change in 2020+ CSVs
  ['NextGen Finals', 'Next Gen Finals'],   // spacing change in 2020+ CSVs
];

function getAliases(name: string): string[] {
  const group = TOURNAMENT_ALIAS_GROUPS.find(g => g.includes(name));
  return group ?? [name];
}

// NextGen Finals is a separate exhibition — never merge with ATP Finals
const NEXT_GEN_NAME = 'NextGen Finals';

// Tournaments starting Dec 26+ are effectively the following year's edition
function displayYear(year: number, startDate: string | null): number {
  if (!startDate) return year;
  const d = new Date(startDate);
  if (d.getMonth() === 11 && d.getDate() >= 26) return year + 1;
  return year;
}

const ROUND_ORDER = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128', 'RR', 'BR'];
const ROUND_LABELS: Record<string, string> = {
  F: 'Final', SF: 'Semifinals', QF: 'Quarterfinals', R16: 'Round of 16',
  R32: 'Round of 32', R64: 'Round of 64', R128: 'Round of 128',
  RR: 'Round Robin', BR: 'Bronze Match',
};

export default function TournamentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [otherEditions, setOtherEditions] = useState<any[]>([]);
  const [allTimeWinners, setAllTimeWinners] = useState<any[]>([]);
  const [showAllEditions, setShowAllEditions] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Get this tournament
        const tResult = await supabase.from('tournaments').select('*').eq('id', id).single();
        if (tResult.error || !tResult.data) { setLoading(false); return; }
        const t = tResult.data;
        setTournament(t);

        // 2. Get this edition's matches + all editions of same tournament (inc. aliases)
        // For ATP Finals (level F): query by level — covers all historical names:
        //   Masters Grand Prix (1970–1989), ATP Tour World Championships (1990–1999),
        //   Tennis Masters Cup (2000–2008), ATP World Tour Finals (2009–2016),
        //   ATP Finals (2017–present).
        // NextGen Finals uses level NG, so level F is safe to use as a unique identifier.
        // For all other tournaments: query by name (inc. aliases for name changes).
        const aliases = getAliases(t.name);
        const edQuery = t.level === 'F'
          ? supabase
              .from('tournaments')
              .select('id, year, draw_size, name, start_date')
              .eq('level', 'F')
              .order('year', { ascending: false })
              .limit(1000)
          : supabase
              .from('tournaments')
              .select('id, year, draw_size, name, start_date')
              .in('name', aliases)
              .order('year', { ascending: false })
              .limit(1000);

        const [mResult, allEdResult] = await Promise.all([
          supabase
            .from('matches')
            .select(`
              id, round, score, winner_id, loser_id,
              winner_seed, winner_entry, winner_rank,
              loser_seed, loser_entry, loser_rank,
              winner:players!matches_winner_id_fkey(id, full_name, country_code),
              loser:players!matches_loser_id_fkey(id, full_name, country_code)
            `)
            .eq('tournament_id', id)
            .limit(256),
          edQuery,
        ]);

        if (!mResult.error) {
          const sorted = (mResult.data || []).sort((a: any, b: any) => {
            const ai = ROUND_ORDER.indexOf(a.round), bi = ROUND_ORDER.indexOf(b.round);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
          setMatches(sorted);
        }

        const allEditionsRaw = allEdResult.data || [];

        // Build tournament_id → display year lookup.
        // Using displayYear means Dec 26+ editions are correctly keyed to the next year,
        // so winner lookups and dedup all work off the same consistent year value.
        const idToYear: Record<number, number> = {};
        allEditionsRaw.forEach((e: any) => {
          idToYear[e.id] = displayYear(e.year, e.start_date);
        });

        // Use EVERY raw ID for fetching finals — avoids the bug where the
        // "lower ID wins" dedup keeps a ghost row that has no matches.
        const allRawIds = allEditionsRaw.map((e: any) => e.id);

        // 3. Fetch all Finals across every edition (using all raw IDs)
        let allFinals: any[] = [];
        if (allRawIds.length > 0) {
          const finalsResult = await supabase
            .from('matches')
            .select(`
              tournament_id,
              winner:players!matches_winner_id_fkey(id, full_name, country_code)
            `)
            .in('tournament_id', allRawIds)
            .eq('round', 'F')
            .limit(2000);
          allFinals = finalsResult.data || [];
        }

        // Build display year → winner map AND display year → real tournament ID
        const winnerByYear: Record<number, any> = {};
        const realIdByYear: Record<number, number> = {};
        allFinals.forEach((m: any) => {
          const year = idToYear[m.tournament_id];
          if (year && m.winner && !winnerByYear[year]) {
            winnerByYear[year] = m.winner;
            realIdByYear[year] = m.tournament_id;
          }
        });

        // Deduplicate editions by display year — keep highest id per year
        // (highest id = match-bearing row; display year avoids Dec 26+ duplicates)
        const seenYears = new Map<number, any>();
        for (const e of allEditionsRaw) {
          const dy = displayYear(e.year, e.start_date);
          if (!seenYears.has(dy) || e.id > seenYears.get(dy).id) {
            seenYears.set(dy, { ...e, _displayYear: dy });
          }
        }
        const allEditions = Array.from(seenYears.values())
          .sort((a, b) => b._displayYear - a._displayYear);

        // Other editions: filter by display year so Dec 26+ editions are never
        // mistakenly treated as the same year as the current page.
        const currentDisplayYear = displayYear(t.year, t.start_date);
        const others = allEditions
          .filter((e: any) => e._displayYear !== currentDisplayYear)
          .map((e: any) => ({
            ...e,
            winner: winnerByYear[e._displayYear] ?? null,
            id: realIdByYear[e._displayYear] ?? e.id,
          }));
        setOtherEditions(others);

        // All-time winners tally — dedup by display year
        const seenFinalYears = new Set<number>();
        const tally: Record<number, { player: any; titles: number }> = {};
        allFinals.forEach((m: any) => {
          const year = idToYear[m.tournament_id];
          if (!year || seenFinalYears.has(year)) return;
          seenFinalYears.add(year);
          const w = m.winner;
          if (!w) return;
          if (!tally[w.id]) tally[w.id] = { player: w, titles: 0 };
          tally[w.id].titles++;
        });
        const sorted = Object.values(tally).sort((a, b) => b.titles - a.titles).slice(0, 10);
        setAllTimeWinners(sorted);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const byRound = matches.reduce((acc: Record<string, any[]>, m: any) => {
    const r = m.round || 'Unknown';
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {});
  const rounds = Object.keys(byRound).sort((a, b) => {
    const ai = ROUND_ORDER.indexOf(a), bi = ROUND_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const finalMatch = byRound['F']?.[0];
  const champion = finalMatch?.winner;
  const finalist = finalMatch?.loser;
  const finalScore = finalMatch?.score;

  const surfColor = tournament ? (SURFACE_COLORS[tournament.surface] ?? '#94a3b8') : '#94a3b8';
  const surfBg = tournament ? (SURFACE_BG[tournament.surface] ?? 'transparent') : 'transparent';
  const levelColor = tournament ? getTournamentColor(tournament.name, tournament.level) : '#94a3b8';
  const levelLabel = tournament ? getTournamentLabel(tournament.name, tournament.level) : '';


  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <NavBar />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
          <Link href="/tournaments" style={{ color: '#64748b', textDecoration: 'none' }}>← All Tournaments</Link>
        </div>

        {loading ? (
          <div style={{ color: '#64748b', padding: '4rem', textAlign: 'center' }}>Loading…</div>
        ) : !tournament ? (
          <div style={{ color: '#64748b', padding: '4rem', textAlign: 'center' }}>Tournament not found.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.5rem', alignItems: 'start' }}>

            {/* ── Left column ── */}
            <div>

              {/* Hero header */}
              <div style={{
                border: '1px solid #1e3a5f',
                borderRadius: '14px',
                padding: '1.75rem 2rem',
                marginBottom: '1.25rem',
                background: `linear-gradient(135deg, #0d1f3c 70%, ${surfBg})`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, color: '#f0c619', lineHeight: 1.2 }}>
                      {tournament.name}
                    </h1>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: '1rem', fontWeight: 600 }}>{displayYear(tournament.year, tournament.start_date)}</span>
                      {tournament.surface && (
                        <span style={{ color: surfColor, fontSize: '0.9rem', fontWeight: 600 }}>● {tournament.surface}</span>
                      )}
                      {tournament.start_date && (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          📅 {new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {tournament.draw_size && (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{tournament.draw_size}-player draw</span>
                      )}
                    </div>
                  </div>
                  {tournament.level && (
                    <span style={{
                      fontSize: '0.85rem', fontWeight: 700,
                      color: levelColor, backgroundColor: '#0a1628',
                      border: `1px solid ${levelColor}`,
                      borderRadius: '8px', padding: '0.4rem 1rem', whiteSpace: 'nowrap',
                    }}>
                      {levelLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Champion Banner */}
              {champion && (
                <div style={{
                  background: 'linear-gradient(135deg, #1a1200 0%, #2a1f00 50%, #0d1f3c 100%)',
                  border: '1px solid #f0c61940',
                  borderRadius: '14px',
                  padding: '1.5rem 2rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: '2.5rem' }}>🏆</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f0c619', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.3rem' }}>
                      Winner
                    </div>
                    <Link href={`/players/${champion.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f0c619', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getFlagUrl(champion.country_code) && <img src={getFlagUrl(champion.country_code)!} alt={champion.country_code} style={{ height: 20, borderRadius: 2 }} />}
                        {champion.full_name}
                      </div>
                    </Link>
                    {finalScore && (
                      <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                        def.{' '}
                        <Link href={`/players/${finalist?.id}`} style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          {getFlagUrl(finalist?.country_code) && <img src={getFlagUrl(finalist?.country_code)!} alt={finalist?.country_code} style={{ height: 14, borderRadius: 1 }} />}
                          {finalist?.full_name}
                        </Link>
                        <span style={{ marginLeft: '0.6rem', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{finalScore}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Draw */}
              {matches.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem', backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f' }}>
                  No match data available for this tournament.
                </div>
              ) : (
                rounds.map((round) => (
                  <div key={round} style={{ marginBottom: '1.25rem' }}>
                    <div style={{
                      fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8',
                      textTransform: 'uppercase', letterSpacing: '0.12em',
                      marginBottom: '0.5rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: round === 'F' ? '#f0c619' : surfColor, display: 'inline-block' }} />
                      {ROUND_LABELS[round] ?? round}
                      <span style={{ color: '#334155', fontWeight: 400 }}>({byRound[round].length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {byRound[round].map((m: any) => (
                        <div key={m.id}
                          onClick={() => router.push(`/matches/${m.id}`)}
                          style={{
                            backgroundColor: round === 'F' ? '#1a1600' : '#0d1f3c',
                            border: `1px solid ${round === 'F' ? '#f0c61930' : '#1e3a5f'}`,
                            borderRadius: '8px',
                            padding: '0.65rem 1.25rem',
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            alignItems: 'center',
                            gap: '1rem',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s, background-color 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = round === 'F' ? '#f0c61970' : '#2e4f7a';
                            e.currentTarget.style.backgroundColor = round === 'F' ? '#1f1a00' : '#112040';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = round === 'F' ? '#f0c61930' : '#1e3a5f';
                            e.currentTarget.style.backgroundColor = round === 'F' ? '#1a1600' : '#0d1f3c';
                          }}
                        >
                          {/* Winner cell */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            {m.winner_seed && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                {m.winner_seed}
                              </span>
                            )}
                            {!m.winner_seed && m.winner_entry && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', background: '#0a1628', border: '1px solid #334155', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
                                {m.winner_entry}
                              </span>
                            )}
                            <Link href={`/players/${m.winner?.id}`} onClick={e => e.stopPropagation()} style={{
                              color: round === 'F' ? '#f0c619' : '#e2e8f0',
                              textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
                              display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
                            }}>
                              {getFlagUrl(m.winner?.country_code) && <img src={getFlagUrl(m.winner?.country_code)!} alt={m.winner?.country_code} style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.winner?.full_name ?? '?'}</span>
                            </Link>
                            {m.winner_rank && (
                              <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.winner_rank}</span>
                            )}
                          </div>
                          {/* Score */}
                          <span style={{ color: '#64748b', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {m.score || 'vs'}
                          </span>
                          {/* Loser cell */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', minWidth: 0 }}>
                            {m.loser_rank && (
                              <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.loser_rank}</span>
                            )}
                            <Link href={`/players/${m.loser?.id}`} onClick={e => e.stopPropagation()} style={{
                              color: '#64748b', textDecoration: 'none',
                              fontSize: '0.9rem',
                              display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
                            }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.loser?.full_name ?? '?'}</span>
                              {getFlagUrl(m.loser?.country_code) && <img src={getFlagUrl(m.loser?.country_code)!} alt={m.loser?.country_code} style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />}
                            </Link>
                            {!m.loser_seed && m.loser_entry && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', background: '#0a1628', border: '1px solid #334155', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
                                {m.loser_entry}
                              </span>
                            )}
                            {m.loser_seed && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                {m.loser_seed}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

            </div>

            {/* ── Right sidebar ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Tournament info */}
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Tournament Info
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {[
                    { label: 'Year', value: displayYear(tournament.year, tournament.start_date) },
                    { label: 'Surface', value: tournament.surface, color: surfColor },
                    { label: 'Category', value: levelLabel, color: levelColor },
                    { label: 'Draw Size', value: tournament.draw_size ? `${tournament.draw_size} players` : null },
                    { label: 'Date', value: tournament.start_date ? new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: '#64748b' }}>{row.label}</span>
                      <span style={{ color: (row as any).color ?? '#e2e8f0', fontWeight: 500 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Runner-Up */}
              {finalist && (
                <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Final
                  </h3>
                  <Link href={`/players/${finalist.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {getFlagUrl(finalist.country_code) && <img src={getFlagUrl(finalist.country_code)!} alt={finalist.country_code} style={{ height: 16, borderRadius: 2 }} />}
                    <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>{finalist.full_name}</span>
                  </Link>
                </div>
              )}

              {/* Other Editions */}
              {otherEditions.length > 0 && (
                <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Other Editions
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {(showAllEditions ? otherEditions : otherEditions.slice(0, 10)).map(ed => (
                      <Link key={ed.id} href={`/tournaments/${ed.id}`} style={{
                        display: 'flex', alignItems: 'center',
                        padding: '0.5rem 0.6rem', borderRadius: '6px',
                        backgroundColor: '#0a1628', textDecoration: 'none',
                        border: '1px solid transparent', gap: '0.5rem',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#1e3a5f')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                      >
                        <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.8rem', minWidth: 36 }}>{ed._displayYear ?? ed.year}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.82rem', flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {ed.winner ? (
                            <>
                              {getFlagUrl(ed.winner.country_code) && <img src={getFlagUrl(ed.winner.country_code)!} alt={ed.winner.country_code} style={{ height: 12, borderRadius: 1 }} />}
                              {ed.winner.full_name}
                            </>
                          ) : <span style={{ color: '#334155' }}>—</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {otherEditions.length > 10 && (
                    <button
                      onClick={() => setShowAllEditions(v => !v)}
                      style={{
                        marginTop: '0.75rem', width: '100%',
                        padding: '0.45rem', borderRadius: '6px',
                        backgroundColor: '#0a1628', border: '1px solid #1e3a5f',
                        color: '#64748b', fontSize: '0.78rem', fontWeight: 600,
                        cursor: 'pointer', letterSpacing: '0.05em',
                      }}
                    >
                      {showAllEditions ? '↑ Show less' : `↓ ${otherEditions.length - 10} more editions`}
                    </button>
                  )}
                </div>
              )}

              {/* All-Time Winners */}
              {allTimeWinners.length > 0 && (
                <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '12px', overflow: 'hidden' }}>
                  <h3 style={{ margin: 0, padding: '1rem 1.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid #1e3a5f' }}>
                    🏆 Most Titles Here
                  </h3>
                  {allTimeWinners.map((entry, i) => (
                    <div key={entry.player.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.65rem 1.25rem',
                      borderBottom: i < allTimeWinners.length - 1 ? '1px solid #1e3a5f' : 'none',
                      backgroundColor: i === 0 ? '#1a1600' : 'transparent',
                    }}>
                      <span style={{ fontSize: i < 3 ? '0.95rem' : '0.75rem', width: 20, textAlign: 'center', color: i >= 3 ? '#334155' : undefined, flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      {getFlagUrl(entry.player.country_code) && <img src={getFlagUrl(entry.player.country_code)!} alt={entry.player.country_code} style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />}
                      <Link href={`/players/${entry.player.id}`} style={{
                        flex: 1, color: i === 0 ? '#f0c619' : '#e2e8f0',
                        textDecoration: 'none', fontWeight: i === 0 ? 700 : 500, fontSize: '0.82rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.player.full_name}
                      </Link>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: i === 0 ? '#f0c619' : '#64748b', flexShrink: 0 }}>
                        ×{entry.titles}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
