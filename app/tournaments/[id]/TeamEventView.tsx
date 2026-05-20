'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFlagUrl, getCountryName } from '../../lib/countryUtils';

// ─── Country-level tie grouping ───────────────────────────────────────────────
// A "tie" = all matches between countryA vs countryB.
// Tie winner = country with more individual match wins.

interface TieResult {
  countryA: string;
  countryB: string;
  winsA: number;
  winsB: number;
  winner: string;  // country code of tie winner
  matches: any[];
}

function buildTies(matches: any[]): TieResult[] {
  // Group matches by unordered country pair
  const tieMap = new Map<string, any[]>();
  for (const m of matches) {
    const wc: string = m.winner?.country_code ?? '';
    const lc: string = m.loser?.country_code ?? '';
    if (!wc || !lc || wc === lc) continue;
    const key = [wc, lc].sort().join('|');
    if (!tieMap.has(key)) tieMap.set(key, []);
    tieMap.get(key)!.push(m);
  }
  const ties: TieResult[] = [];
  for (const [key, ms] of tieMap.entries()) {
    const [cA, cB] = key.split('|');
    let winsA = 0, winsB = 0;
    for (const m of ms) {
      if (m.winner?.country_code === cA) winsA++;
      else winsB++;
    }
    ties.push({ countryA: cA, countryB: cB, winsA, winsB, winner: winsA >= winsB ? cA : cB, matches: ms });
  }
  return ties;
}

// ─── Connected-components group inference (country level) ────────────────────
function inferCountryGroups(ties: TieResult[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const t of ties) {
    if (!adj.has(t.countryA)) adj.set(t.countryA, new Set());
    if (!adj.has(t.countryB)) adj.set(t.countryB, new Set());
    adj.get(t.countryA)!.add(t.countryB);
    adj.get(t.countryB)!.add(t.countryA);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const cc of adj.keys()) {
    if (visited.has(cc)) continue;
    const comp: string[] = [];
    const queue = [cc];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const nb of (adj.get(cur) ?? [])) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

interface CountryStanding {
  countryCode: string;
  tieWins: number;
  tieLosses: number;
  matchWins: number;
  matchLosses: number;
}

function computeCountryStandings(groupCodes: string[], ties: TieResult[]): CountryStanding[] {
  const standings = new Map<string, CountryStanding>();
  for (const cc of groupCodes) {
    standings.set(cc, { countryCode: cc, tieWins: 0, tieLosses: 0, matchWins: 0, matchLosses: 0 });
  }
  for (const t of ties) {
    if (!standings.has(t.countryA) || !standings.has(t.countryB)) continue;
    const sA = standings.get(t.countryA)!;
    const sB = standings.get(t.countryB)!;
    if (t.winner === t.countryA) { sA.tieWins++; sB.tieLosses++; }
    else { sB.tieWins++; sA.tieLosses++; }
    sA.matchWins   += t.winsA;  sA.matchLosses += t.winsB;
    sB.matchWins   += t.winsB;  sB.matchLosses += t.winsA;
  }
  return Array.from(standings.values()).sort(
    (a, b) => b.tieWins - a.tieWins || (b.matchWins - b.matchLosses) - (a.matchWins - a.matchLosses),
  );
}

// ─── Country name helper (fallback to code) ───────────────────────────────────
function countryLabel(cc: string): string {
  try { return getCountryName(cc) || cc; } catch { return cc; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ label, count, color = '#f97316' }: { label: string; count?: number; color?: string }) {
  return (
    <div style={{
      fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.12em',
      marginBottom: '0.5rem', marginTop: '1.5rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
    }}>
      <span style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
      {count !== undefined && <span style={{ color: '#334155', fontWeight: 400 }}>({count})</span>}
    </div>
  );
}

function CountryStandingsTable({ standings }: { standings: CountryStanding[] }) {
  return (
    <div style={{ border: '1px solid #1e3a5f', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.75rem' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 36px 36px 70px',
        backgroundColor: '#0a1628', padding: '0.45rem 1rem', gap: '0.25rem',
      }}>
        {['Country', 'W', 'L', 'Matches'].map((h, i) => (
          <span key={h} style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#475569',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            textAlign: i > 0 ? 'center' : 'left',
          }}>{h}</span>
        ))}
      </div>
      {standings.map((s, i) => (
        <div key={s.countryCode} style={{
          display: 'grid', gridTemplateColumns: '1fr 36px 36px 70px',
          padding: '0.55rem 1rem', gap: '0.25rem', alignItems: 'center',
          backgroundColor: i === 0 ? 'rgba(240,198,25,0.04)' : 'transparent',
          borderTop: '1px solid #1e3a5f',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.5rem', color: i < 2 ? '#f97316' : 'transparent', flexShrink: 0 }}>●</span>
            {getFlagUrl(s.countryCode) && (
              <img src={getFlagUrl(s.countryCode)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />
            )}
            <span style={{
              color: i === 0 ? '#e2e8f0' : '#94a3b8', fontWeight: i === 0 ? 700 : 500,
              fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {countryLabel(s.countryCode)}
            </span>
          </div>
          <span style={{ textAlign: 'center', color: '#22c55e', fontWeight: 700, fontSize: '0.88rem' }}>{s.tieWins}</span>
          <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>{s.tieLosses}</span>
          <span style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>{s.matchWins}–{s.matchLosses}</span>
        </div>
      ))}
    </div>
  );
}

function TieHeader({ tie }: { tie: TieResult }) {
  const winnerLabel = countryLabel(tie.winner);
  const loserCode   = tie.winner === tie.countryA ? tie.countryB : tie.countryA;
  const winnerWins  = tie.winner === tie.countryA ? tie.winsA : tie.winsB;
  const loserWins   = tie.winner === tie.countryA ? tie.winsB : tie.winsA;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.45rem 0.75rem', marginBottom: '0.35rem',
      backgroundColor: '#0a1628', border: '1px solid #1e3a5f',
      borderRadius: '6px', fontSize: '0.8rem',
    }}>
      {getFlagUrl(tie.winner) && <img src={getFlagUrl(tie.winner)!} alt="" style={{ height: 13, borderRadius: 1 }} />}
      <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{winnerLabel}</span>
      <span style={{ color: '#f0c619', fontWeight: 800 }}>{winnerWins}</span>
      <span style={{ color: '#334155' }}>–</span>
      <span style={{ color: '#64748b' }}>{loserWins}</span>
      {getFlagUrl(loserCode) && <img src={getFlagUrl(loserCode)!} alt="" style={{ height: 13, borderRadius: 1 }} />}
      <span style={{ color: '#64748b' }}>{countryLabel(loserCode)}</span>
    </div>
  );
}

function IndividualMatchRow({ m }: { m: any }) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/matches/${m.id}`)}
      style={{
        backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f',
        borderRadius: '8px', padding: '0.55rem 1.25rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: '1rem', cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2e4f7a'; e.currentTarget.style.backgroundColor = '#112040'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e3a5f'; e.currentTarget.style.backgroundColor = '#0d1f3c'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
        <Link href={`/players/${m.winner?.id}`} onClick={e => e.stopPropagation()} style={{
          color: '#e2e8f0', textDecoration: 'none', fontWeight: 600, fontSize: '0.88rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          {getFlagUrl(m.winner?.country_code) && (
            <img src={getFlagUrl(m.winner?.country_code)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.winner?.full_name ?? '?'}</span>
        </Link>
        {m.winner_rank && <span style={{ fontSize: '0.7rem', color: '#475569', flexShrink: 0 }}>#{m.winner_rank}</span>}
      </div>
      <span style={{ color: '#64748b', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'center' }}>
        {m.score || 'vs'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', minWidth: 0 }}>
        {m.loser_rank && <span style={{ fontSize: '0.7rem', color: '#475569', flexShrink: 0 }}>#{m.loser_rank}</span>}
        <Link href={`/players/${m.loser?.id}`} onClick={e => e.stopPropagation()} style={{
          color: '#64748b', textDecoration: 'none', fontSize: '0.88rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.loser?.full_name ?? '?'}</span>
          {getFlagUrl(m.loser?.country_code) && (
            <img src={getFlagUrl(m.loser?.country_code)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />
          )}
        </Link>
      </div>
    </div>
  );
}

function KnockoutMatchRow({ m, isF = false }: { m: any; isF?: boolean }) {
  const router = useRouter();
  const wc = m.winner?.country_code ?? '';
  const lc = m.loser?.country_code  ?? '';
  // In knockout rounds for team events, we show country-level winner info
  return (
    <div
      onClick={() => router.push(`/matches/${m.id}`)}
      style={{
        backgroundColor: isF ? '#1a1600' : '#0d1f3c',
        border: `1px solid ${isF ? '#f0c61930' : '#1e3a5f'}`,
        borderRadius: '8px', padding: '0.65rem 1.25rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: '1rem', cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = isF ? '#f0c61970' : '#2e4f7a';
        e.currentTarget.style.backgroundColor = isF ? '#1f1a00' : '#112040';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isF ? '#f0c61930' : '#1e3a5f';
        e.currentTarget.style.backgroundColor = isF ? '#1a1600' : '#0d1f3c';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
        <Link href={`/players/${m.winner?.id}`} onClick={e => e.stopPropagation()} style={{
          color: isF ? '#f0c619' : '#e2e8f0', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          {getFlagUrl(wc) && <img src={getFlagUrl(wc)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.winner?.full_name ?? '?'}</span>
        </Link>
        {m.winner_rank && <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.winner_rank}</span>}
      </div>
      <span style={{ color: '#64748b', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'center' }}>
        {m.score || 'vs'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', minWidth: 0 }}>
        {m.loser_rank && <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.loser_rank}</span>}
        <Link href={`/players/${m.loser?.id}`} onClick={e => e.stopPropagation()} style={{
          color: '#64748b', textDecoration: 'none', fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.loser?.full_name ?? '?'}</span>
          {getFlagUrl(lc) && <img src={getFlagUrl(lc)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />}
        </Link>
      </div>
    </div>
  );
}

// ─── Champion banner (country) ────────────────────────────────────────────────
export function TeamChampionBanner({ match, tournament }: { match: any; tournament: any }) {
  if (!match) return null;
  const winnerCountry = match.winner?.country_code ?? '';
  const loserCountry  = match.loser?.country_code  ?? '';
  const winnerName    = countryLabel(winnerCountry);
  const loserName     = countryLabel(loserCountry);
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1200 0%, #2a1f00 50%, #0d1f3c 100%)',
      border: '1px solid #f0c61940', borderRadius: '14px',
      padding: '1.5rem 2rem', marginBottom: '1.25rem',
      display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: '2.5rem' }}>🏆</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f0c619', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.3rem' }}>
          Winner
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f0c619', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {getFlagUrl(winnerCountry) && <img src={getFlagUrl(winnerCountry)!} alt={winnerCountry} style={{ height: 24, borderRadius: 3 }} />}
          {winnerName}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.3rem' }}>
          def.{' '}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
            {getFlagUrl(loserCountry) && <img src={getFlagUrl(loserCountry)!} alt={loserCountry} style={{ height: 14, borderRadius: 1 }} />}
            {loserName}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function TeamEventView({ matches }: { matches: any[] }) {
  const rrMatches = matches.filter(m => m.round === 'RR');
  const sfMatches = matches.filter(m => m.round === 'SF');
  const fMatches  = matches.filter(m => m.round === 'F');

  const ties = buildTies(rrMatches);
  const groups = inferCountryGroups(ties);
  const GROUP_NAMES = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F'];

  return (
    <div>
      {/* ── Group stages ── */}
      {groups.map((groupCodes, gi) => {
        const groupTies = ties.filter(t => groupCodes.includes(t.countryA));
        const standings = computeCountryStandings(groupCodes, groupTies);
        return (
          <div key={gi}>
            <SectionHeader label={GROUP_NAMES[gi] ?? `Group ${gi + 1}`} color="#f97316" />
            <CountryStandingsTable standings={standings} />
            {/* Ties */}
            {groupTies.map(tie => {
              const tieKey = [tie.countryA, tie.countryB].sort().join('|');
              return (
                <div key={tieKey} style={{ marginBottom: '0.75rem' }}>
                  <TieHeader tie={tie} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {tie.matches.map(m => <IndividualMatchRow key={m.id} m={m} />)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── Semifinals ── */}
      {sfMatches.length > 0 && (
        <>
          <SectionHeader label="Semifinals" count={sfMatches.length} color="#f0c619" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {sfMatches.map(m => <KnockoutMatchRow key={m.id} m={m} />)}
          </div>
        </>
      )}

      {/* ── Final ── */}
      {fMatches.length > 0 && (
        <>
          <SectionHeader label="Final" color="#f0c619" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
            {fMatches.map(m => <KnockoutMatchRow key={m.id} m={m} isF />)}
          </div>
        </>
      )}

      {matches.length === 0 && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem', backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f' }}>
          No match data available.
        </div>
      )}
    </div>
  );
}
