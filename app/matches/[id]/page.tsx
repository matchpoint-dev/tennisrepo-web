'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getFlagUrl } from '../../lib/countryUtils';
import NavBar from '../../NavBar';
const ROUND_LABELS: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal',
  R16: 'Round of 16', R32: 'Round of 32', R64: 'Round of 64',
  R128: 'Round of 128', RR: 'Round Robin', BR: 'Bronze Match',
};

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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function parseScore(score: string): { sets: string[]; note: string } {
  if (!score) return { sets: [], note: '' };
  const noteMatch = score.match(/\[?(RET|W\/O|DEF|ABD|Def\.?)\]?/i);
  const note = noteMatch ? noteMatch[0].replace(/[\[\]]/g, '') : '';
  const clean = score.replace(/\[?(RET|W\/O|DEF|ABD|Def\.?)\]?/gi, '').trim();
  const sets = clean.split(' ').filter(Boolean);
  return { sets, note };
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

// A single comparison stat row with a bar
function StatRow({
  label,
  wVal,
  lVal,
  wDisplay,
  lDisplay,
  higherIsBetter = true,
}: {
  label: string;
  wVal: number;
  lVal: number;
  wDisplay: string;
  lDisplay: string;
  higherIsBetter?: boolean;
}) {
  const total = wVal + lVal;
  if (total === 0) return null;
  const wPct = total > 0 ? (wVal / total) * 100 : 50;
  const wWins = higherIsBetter ? wVal >= lVal : wVal <= lVal;
  const lWins = higherIsBetter ? lVal >= wVal : lVal <= wVal;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: wWins ? '#e2e8f0' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>{wDisplay}</span>
        <span style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: lWins ? '#e2e8f0' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>{lDisplay}</span>
      </div>
      <div style={{ position: 'relative', height: '6px', borderRadius: '3px', backgroundColor: '#0a1628', overflow: 'hidden' }}>
        {/* Winner bar (left, gold) */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${wPct}%`,
          backgroundColor: '#f0c619',
          borderRadius: '3px 0 0 3px',
          transition: 'width 0.4s ease',
        }} />
        {/* Loser bar (right, muted) */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: `${100 - wPct}%`,
          backgroundColor: '#2e4a6a',
          borderRadius: '0 3px 3px 0',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export default function MatchPage() {
  const params = useParams();
  const id = params?.id as string;
  const [match, setMatch] = useState<any>(null);
  const [h2hMatches, setH2hMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Fetch all match columns (stats included if present)
        const { data, error: err } = await supabase
          .from('matches')
          .select(`
            *,
            winner:players!matches_winner_id_fkey(id, full_name, country_code),
            loser:players!matches_loser_id_fkey(id, full_name, country_code)
          `)
          .eq('id', id)
          .single();

        if (err) throw err;
        if (!data) throw new Error('Match not found');

        // Fetch tournament
        const { data: tournamentData } = await supabase
          .from('tournaments')
          .select('id, name, year, surface, level, start_date')
          .eq('id', data.tournament_id)
          .single();

        const matchWithTournament = { ...data, tournament: tournamentData };
        setMatch(matchWithTournament);

        // Fetch H2H between these two players
        if (data.winner_id && data.loser_id) {
          const { data: h2h } = await supabase
            .from('matches')
            .select(`
              id, round, score, winner_id, loser_id,
              winner:players!matches_winner_id_fkey(id, full_name),
              loser:players!matches_loser_id_fkey(id, full_name),
              tournaments(id, name, year, surface, level)
            `)
            .or(
              `and(winner_id.eq.${data.winner_id},loser_id.eq.${data.loser_id}),and(winner_id.eq.${data.loser_id},loser_id.eq.${data.winner_id})`
            )
            .order('match_date', { ascending: false })
            .limit(500);
          setH2hMatches(h2h || []);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load match');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  const tournament = match?.tournament;
  const levelColor = tournament ? (LEVEL_COLORS[tournament.level] ?? '#94a3b8') : '#94a3b8';
  const levelLabel = tournament ? (LEVEL_LABELS[tournament.level] ?? tournament.level) : '';
  const surfColor = tournament ? (SURFACE_COLORS[tournament.surface] ?? '#94a3b8') : '#94a3b8';
  const roundLabel = match ? (ROUND_LABELS[match.round] ?? match.round) : '';
  const isGrandFinal = match?.round === 'F';
  const { sets, note } = match?.score ? parseScore(match.score) : { sets: [], note: '' };

  // Derive stats if columns exist
  const hasStats = match && (
    match.w_ace != null || match.w_df != null || match.w_svpt != null || match.minutes != null
  );

  // PostgreSQL lowercases all column names, so Sackmann's camelCase cols come back lowercase:
  // w_1stIn → w_1stin, w_1stWon → w_1stwon, w_2ndWon → w_2ndwon,
  // w_SvGms → w_svgms, w_bpSaved → w_bpsaved, w_bpFaced → w_bpfaced
  const w1stIn   = match?.w_1stin   ?? match?.w_1stIn;
  const l1stIn   = match?.l_1stin   ?? match?.l_1stIn;
  const w1stWon  = match?.w_1stwon  ?? match?.w_1stWon;
  const l1stWon  = match?.l_1stwon  ?? match?.l_1stWon;
  const w2ndWon  = match?.w_2ndwon  ?? match?.w_2ndWon;
  const l2ndWon  = match?.l_2ndwon  ?? match?.l_2ndWon;
  const wSvGms   = match?.w_svgms   ?? match?.w_SvGms;
  const lSvGms   = match?.l_svgms   ?? match?.l_SvGms;
  const wBpSaved = match?.w_bpsaved ?? match?.w_bpSaved;
  const lBpSaved = match?.l_bpsaved ?? match?.l_bpSaved;
  const wBpFaced = match?.w_bpfaced ?? match?.w_bpFaced;
  const lBpFaced = match?.l_bpfaced ?? match?.l_bpFaced;

  // 1st serve %
  const w1stPct = pct(w1stIn, match?.w_svpt);
  const l1stPct = pct(l1stIn, match?.l_svpt);
  // 1st serve won %
  const w1stWonPct = pct(w1stWon, w1stIn);
  const l1stWonPct = pct(l1stWon, l1stIn);
  // 2nd serve in (serve points - 1st serves in)
  const w2ndIn = (match?.w_svpt ?? 0) - (w1stIn ?? 0);
  const l2ndIn = (match?.l_svpt ?? 0) - (l1stIn ?? 0);
  // 2nd serve won %
  const w2ndWonPct = pct(w2ndWon, w2ndIn);
  const l2ndWonPct = pct(l2ndWon, l2ndIn);
  // BP saved %
  const wBpSavedPct = pct(wBpSaved, wBpFaced);
  const lBpSavedPct = pct(lBpSaved, lBpFaced);
  // Total serve points won
  const wTotalSrvWon = (w1stWon ?? 0) + (w2ndWon ?? 0);
  const lTotalSrvWon = (l1stWon ?? 0) + (l2ndWon ?? 0);
  const wTotalSrvPct = pct(wTotalSrvWon, match?.w_svpt);
  const lTotalSrvPct = pct(lTotalSrvWon, match?.l_svpt);
  // Total points won (on serve + return)
  const wReturnWon = (match?.l_svpt ?? 0) - lTotalSrvWon;
  const lReturnWon = (match?.w_svpt ?? 0) - wTotalSrvWon;
  const wTotalPts = wTotalSrvWon + wReturnWon;
  const lTotalPts = lTotalSrvWon + lReturnWon;
  const hasTotal = match?.w_svpt != null && match?.l_svpt != null &&
    w1stWon != null && l1stWon != null && w2ndWon != null && l2ndWon != null;

  // H2H counts (including this match)
  const winnerId = match?.winner_id;
  const loserId = match?.loser_id;
  const h2hWinnerWins = h2hMatches.filter(m => m.winner_id === winnerId).length;
  const h2hLoserWins = h2hMatches.filter(m => m.winner_id === loserId).length;

  const winnerFlagUrl = match ? getFlagUrl(match.winner?.country_code) : null;
  const loserFlagUrl = match ? getFlagUrl(match.loser?.country_code) : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <NavBar />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>

        {loading ? (
          <div style={{ color: '#64748b', padding: '6rem', textAlign: 'center', fontSize: '1rem' }}>Loading match…</div>
        ) : error ? (
          <div style={{ color: '#fca5a5', padding: '4rem', textAlign: 'center' }}>{error}</div>
        ) : !match ? (
          <div style={{ color: '#64748b', padding: '4rem', textAlign: 'center' }}>Match not found.</div>
        ) : (
          <>
            {/* Breadcrumb */}
            <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <Link href="/tournaments" style={{ color: '#64748b', textDecoration: 'none' }}>Tournaments</Link>
              <span style={{ color: '#334155' }}>›</span>
              {tournament && (
                <>
                  <Link href={`/tournaments/${tournament.id}`} style={{ color: '#64748b', textDecoration: 'none' }}>
                    {tournament.name} {tournament.year}
                  </Link>
                  <span style={{ color: '#334155' }}>›</span>
                </>
              )}
              <span style={{ color: '#94a3b8' }}>{roundLabel}</span>
            </div>

            {/* Scoreboard */}
            <div style={{
              background: isGrandFinal
                ? 'linear-gradient(135deg, #1a1200 0%, #161000 60%, #0d1f3c 100%)'
                : '#0d1f3c',
              border: `1px solid ${isGrandFinal ? '#f0c61940' : '#1e3a5f'}`,
              borderRadius: '16px',
              overflow: 'hidden',
              marginBottom: '1.25rem',
            }}>
              {/* Header bar */}
              <div style={{
                backgroundColor: '#0a1e38',
                borderBottom: `1px solid ${isGrandFinal ? '#f0c61930' : '#1e3a5f'}`,
                padding: '0.65rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}>
                {tournament && (
                  <Link href={`/tournaments/${tournament.id}`} style={{ textDecoration: 'none', color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600 }}>
                    {tournament.name} {tournament.year}
                  </Link>
                )}
                <span style={{ color: '#334155' }}>·</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isGrandFinal ? '#f0c619' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {isGrandFinal ? '🏆 ' : ''}{roundLabel}
                </span>
                {tournament?.surface && (
                  <span style={{ fontSize: '0.72rem', color: surfColor, fontWeight: 600 }}>· {tournament.surface}</span>
                )}
                {levelLabel && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: levelColor, border: `1px solid ${levelColor}44`, marginLeft: 'auto' }}>
                    {levelLabel}
                  </span>
                )}
                {match.match_date && (
                  <span style={{ fontSize: '0.72rem', color: '#475569' }}>{formatDate(match.match_date)}</span>
                )}
                {match.minutes && (
                  <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                    {Math.floor(match.minutes / 60)}h{String(match.minutes % 60).padStart(2, '0')}m
                  </span>
                )}
              </div>

              {/* Players + Score */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
                {/* Winner */}
                <div style={{ padding: '1.75rem 1.5rem', backgroundColor: isGrandFinal ? '#f0c6190a' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    {winnerFlagUrl && <img src={winnerFlagUrl} alt={match.winner?.country_code} style={{ height: 20, borderRadius: 2, flexShrink: 0 }} />}
                    <Link href={`/players/${match.winner?.id}`} style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isGrandFinal ? '#f0c619' : '#e2e8f0', lineHeight: 1.2 }}>
                        {match.winner?.full_name ?? '?'}
                      </span>
                    </Link>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {match.winner_seed && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px' }}>
                        [{match.winner_seed}]
                      </span>
                    )}
                    {!match.winner_seed && match.winner_entry && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', backgroundColor: '#0a1628', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px' }}>
                        {match.winner_entry}
                      </span>
                    )}
                    {match.winner_rank && (
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>#{match.winner_rank}</span>
                    )}
                  </div>
                </div>

                {/* Score */}
                <div style={{ padding: '1.75rem 1rem', textAlign: 'center', borderLeft: '1px solid #1e3a5f', borderRight: '1px solid #1e3a5f', minWidth: '120px' }}>
                  {sets.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {sets.map((s, i) => (
                          <span key={i} style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{s}</span>
                        ))}
                      </div>
                      {note && <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{note}</div>}
                    </>
                  ) : (
                    <span style={{ color: '#334155' }}>vs</span>
                  )}
                </div>

                {/* Loser */}
                <div style={{ padding: '1.75rem 1.5rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
                    <Link href={`/players/${match.loser?.id}`} style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#64748b', lineHeight: 1.2 }}>
                        {match.loser?.full_name ?? '?'}
                      </span>
                    </Link>
                    {loserFlagUrl && <img src={loserFlagUrl} alt={match.loser?.country_code} style={{ height: 20, borderRadius: 2, flexShrink: 0 }} />}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {match.loser_rank && (
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>#{match.loser_rank}</span>
                    )}
                    {!match.loser_seed && match.loser_entry && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', backgroundColor: '#0a1628', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px' }}>
                        {match.loser_entry}
                      </span>
                    )}
                    {match.loser_seed && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px' }}>
                        [{match.loser_seed}]
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats section */}
            {hasStats && (
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.25rem' }}>
                {/* Column headers */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {winnerFlagUrl && <img src={winnerFlagUrl} alt={match.winner?.country_code} style={{ height: 16, borderRadius: 1 }} />}
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f0c619' }}>{match.winner?.full_name?.split(' ').pop()}</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Match Stats</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8' }}>{match.loser?.full_name?.split(' ').pop()}</span>
                    {loserFlagUrl && <img src={loserFlagUrl} alt={match.loser?.country_code} style={{ height: 16, borderRadius: 1 }} />}
                  </div>
                </div>

                {/* Serve */}
                {match.w_ace != null && match.l_ace != null && (
                  <StatRow label="Aces" wVal={match.w_ace} lVal={match.l_ace} wDisplay={String(match.w_ace)} lDisplay={String(match.l_ace)} />
                )}
                {match.w_df != null && match.l_df != null && (
                  <StatRow label="Double Faults" wVal={match.w_df} lVal={match.l_df} wDisplay={String(match.w_df)} lDisplay={String(match.l_df)} higherIsBetter={false} />
                )}
                {match.w_svpt != null && match.l_svpt != null && (
                  <StatRow label="Serve Points" wVal={match.w_svpt} lVal={match.l_svpt} wDisplay={String(match.w_svpt)} lDisplay={String(match.l_svpt)} />
                )}
                {w1stIn != null && match?.w_svpt != null && l1stIn != null && match?.l_svpt != null && (
                  <StatRow label="1st Serve In" wVal={w1stPct} lVal={l1stPct} wDisplay={`${w1stIn}/${match.w_svpt} (${w1stPct}%)`} lDisplay={`${l1stIn}/${match.l_svpt} (${l1stPct}%)`} />
                )}
                {w1stWon != null && w1stIn != null && l1stWon != null && l1stIn != null && (
                  <StatRow label="1st Serve Won" wVal={w1stWonPct} lVal={l1stWonPct} wDisplay={`${w1stWon}/${w1stIn} (${w1stWonPct}%)`} lDisplay={`${l1stWon}/${l1stIn} (${l1stWonPct}%)`} />
                )}
                {w2ndWon != null && w2ndIn > 0 && l2ndWon != null && l2ndIn > 0 && (
                  <StatRow label="2nd Serve Won" wVal={w2ndWonPct} lVal={l2ndWonPct} wDisplay={`${w2ndWon}/${w2ndIn} (${w2ndWonPct}%)`} lDisplay={`${l2ndWon}/${l2ndIn} (${l2ndWonPct}%)`} />
                )}
                {hasTotal && wTotalSrvPct > 0 && lTotalSrvPct > 0 && (
                  <StatRow label="Total Serve Won" wVal={wTotalSrvPct} lVal={lTotalSrvPct} wDisplay={`${wTotalSrvWon}/${match.w_svpt} (${wTotalSrvPct}%)`} lDisplay={`${lTotalSrvWon}/${match.l_svpt} (${lTotalSrvPct}%)`} />
                )}
                {/* Break points */}
                {wBpFaced != null && wBpSaved != null && lBpFaced != null && lBpSaved != null && (
                  <StatRow
                    label="Break Points Saved"
                    wVal={wBpSavedPct || (wBpFaced === 0 ? 1 : 0)}
                    lVal={lBpSavedPct || (lBpFaced === 0 ? 1 : 0)}
                    wDisplay={`${wBpSaved}/${wBpFaced}${wBpFaced > 0 ? ` (${wBpSavedPct}%)` : ''}`}
                    lDisplay={`${lBpSaved}/${lBpFaced}${lBpFaced > 0 ? ` (${lBpSavedPct}%)` : ''}`}
                  />
                )}
                {wBpFaced != null && lBpFaced != null && (
                  <StatRow
                    label="Break Points Faced"
                    wVal={lBpFaced}
                    lVal={wBpFaced}
                    wDisplay={String(lBpFaced)}
                    lDisplay={String(wBpFaced)}
                    higherIsBetter={false}
                  />
                )}
                {/* Total points */}
                {hasTotal && wTotalPts > 0 && lTotalPts > 0 && (
                  <StatRow
                    label="Total Points Won"
                    wVal={wTotalPts}
                    lVal={lTotalPts}
                    wDisplay={`${wTotalPts} (${pct(wTotalPts, wTotalPts + lTotalPts)}%)`}
                    lDisplay={`${lTotalPts} (${pct(lTotalPts, wTotalPts + lTotalPts)}%)`}
                  />
                )}
              </div>
            )}

            {/* H2H section */}
            {h2hMatches.length > 0 && (
              <div style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '14px', overflow: 'hidden' }}>
                {/* H2H header */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Head to Head
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f0c619' }}>{match.winner?.full_name}</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f0c619' }}>{h2hWinnerWins}</span>
                    <span style={{ color: '#334155' }}>–</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#94a3b8' }}>{h2hLoserWins}</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94a3b8' }}>{match.loser?.full_name}</span>
                  </div>
                </div>

                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '55px 190px 110px 160px 120px 90px 1fr',
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

                {/* H2H rows */}
                {h2hMatches.map((m: any, i: number) => {
                  const isThisMatch = m.id === parseInt(id);
                  const winnerWon = m.winner_id === winnerId;
                  const matchWinner = winnerWon ? match.winner : match.loser;
                  const t = m.tournaments;
                  const flagUrl2 = getFlagUrl(matchWinner?.country_code);
                  const surfColor2 = SURFACE_COLORS[t?.surface] ?? '#94a3b8';
                  return (
                    <Link key={m.id} href={`/matches/${m.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '55px 190px 110px 160px 120px 90px 1fr',
                        alignItems: 'center',
                        padding: '0.7rem 1.25rem',
                        borderBottom: i < h2hMatches.length - 1 ? '1px solid #0f2030' : 'none',
                        backgroundColor: isThisMatch ? '#0f2744' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s',
                      }}
                        onMouseEnter={e => { if (!isThisMatch) e.currentTarget.style.backgroundColor = '#0a1e38'; }}
                        onMouseLeave={e => { if (!isThisMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {/* Year */}
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                          {t?.year ?? '—'}
                        </span>
                        {/* Winner */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                          {flagUrl2 && <img src={flagUrl2} alt={matchWinner?.country_code} style={{ height: 14, borderRadius: 1, flexShrink: 0 }} />}
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: winnerWon ? '#f0c619' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {matchWinner?.full_name ?? '—'}
                          </span>
                          {isThisMatch && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#475569', backgroundColor: '#1e3a5f', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                              THIS
                            </span>
                          )}
                        </div>
                        {/* Level */}
                        {t?.level ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: LEVEL_COLORS[t.level] ?? '#94a3b8', border: `1px solid ${(LEVEL_COLORS[t.level] ?? '#94a3b8') + '55'}`, backgroundColor: (LEVEL_COLORS[t.level] ?? '#94a3b8') + '15', whiteSpace: 'nowrap', display: 'inline-block', width: 'fit-content' }}>
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
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: surfColor2 }}>
                          {t?.surface ?? '—'}
                        </span>
                        {/* Score */}
                        <span style={{ fontSize: '0.82rem', color: '#64748b', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
      </main>
    </div>
  );
}
