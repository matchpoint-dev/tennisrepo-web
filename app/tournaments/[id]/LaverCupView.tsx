'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFlagUrl } from '../../lib/countryUtils';

// ─── Country-code → Team Europe classification ────────────────────────────────
// All European ITF/IOC country codes. Players not in this set → Team World.
const EUROPE_CODES = new Set([
  'SUI', 'ESP', 'SRB', 'GRE', 'GER', 'ITA', 'NOR', 'RUS', 'AUT', 'BEL',
  'CRO', 'GBR', 'FRA', 'DEN', 'SWE', 'FIN', 'NED', 'POL', 'CZE', 'SVK',
  'HUN', 'ROU', 'BUL', 'UKR', 'POR', 'GEO', 'MDA', 'MNE', 'BIH', 'SLO',
  'LAT', 'LTU', 'EST', 'LUX', 'CYP', 'ALB', 'MKD', 'ARM', 'BLR', 'KAZ',
  'ISL', 'IRL', 'AND', 'SMR', 'MON', 'LIE',
]);

function isEurope(countryCode: string | undefined): boolean {
  return !!countryCode && EUROPE_CODES.has(countryCode);
}

// ─── Hard-coded final team scores per year ────────────────────────────────────
// Source: ATP / Laver Cup official records
const LAVER_SCORES: Record<number, { europe: number; world: number; city: string }> = {
  2017: { europe: 15, world:  9, city: 'Prague' },
  2018: { europe: 13, world: 11, city: 'Chicago' },
  2019: { europe: 11, world:  9, city: 'Geneva' },
  2021: { europe: 14, world:  1, city: 'Boston' },
  2022: { europe:  8, world: 13, city: 'London' },
  2023: { europe: 13, world:  8, city: 'Vancouver' },
  2024: { europe: 13, world: 11, city: 'Berlin' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function TeamTag({ europe }: { europe: boolean }) {
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
      color: europe ? '#60a5fa' : '#f97316',
      background: europe ? 'rgba(96,165,250,0.1)' : 'rgba(249,115,22,0.1)',
      border: `1px solid ${europe ? 'rgba(96,165,250,0.25)' : 'rgba(249,115,22,0.25)'}`,
      borderRadius: 4, padding: '1px 6px', flexShrink: 0,
    }}>
      {europe ? 'EUR' : 'WLD'}
    </span>
  );
}

function MatchRow({ m }: { m: any }) {
  const router = useRouter();
  const winnerEurope = isEurope(m.winner?.country_code);
  const loserEurope  = isEurope(m.loser?.country_code);
  return (
    <div
      onClick={() => router.push(`/matches/${m.id}`)}
      style={{
        backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f',
        borderRadius: '8px', padding: '0.65rem 1.25rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: '1rem', cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2e4f7a'; e.currentTarget.style.backgroundColor = '#112040'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e3a5f'; e.currentTarget.style.backgroundColor = '#0d1f3c'; }}
    >
      {/* Winner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
        <TeamTag europe={winnerEurope} />
        <Link href={`/players/${m.winner?.id}`} onClick={e => e.stopPropagation()} style={{
          color: '#e2e8f0', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          {getFlagUrl(m.winner?.country_code) && (
            <img src={getFlagUrl(m.winner?.country_code)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.winner?.full_name ?? '?'}</span>
        </Link>
        {m.winner_rank && <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.winner_rank}</span>}
      </div>
      {/* Score */}
      <span style={{ color: '#64748b', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'center' }}>
        {m.score || 'vs'}
      </span>
      {/* Loser */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', minWidth: 0 }}>
        {m.loser_rank && <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>#{m.loser_rank}</span>}
        <Link href={`/players/${m.loser?.id}`} onClick={e => e.stopPropagation()} style={{
          color: '#64748b', textDecoration: 'none', fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.loser?.full_name ?? '?'}</span>
          {getFlagUrl(m.loser?.country_code) && (
            <img src={getFlagUrl(m.loser?.country_code)!} alt="" style={{ height: 13, borderRadius: 1, flexShrink: 0 }} />
          )}
        </Link>
        <TeamTag europe={loserEurope} />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function LaverCupView({ matches, tournament }: { matches: any[]; tournament: any }) {
  const year: number = tournament?.year ?? 0;
  const scores = LAVER_SCORES[year];

  const europeWon = scores ? scores.europe > scores.world : null;

  // Separate europe-vs-world matches (all should be cross-team by definition)
  // Sort: europe-won matches first, then world-won — for readability
  const sortedMatches = [...matches].sort((a, b) => {
    const aEurWon = isEurope(a.winner?.country_code);
    const bEurWon = isEurope(b.winner?.country_code);
    if (aEurWon && !bEurWon) return -1;
    if (!aEurWon && bEurWon) return 1;
    return 0;
  });

  // Count wins from match data (as a cross-check / fallback display)
  const europeWins = matches.filter(m => isEurope(m.winner?.country_code)).length;
  const worldWins  = matches.filter(m => !isEurope(m.winner?.country_code)).length;

  const displayEurope = scores?.europe ?? europeWins;
  const displayWorld  = scores?.world  ?? worldWins;
  const winner = displayEurope > displayWorld ? 'Team Europe' : 'Team World';
  const winnerIsEurope = displayEurope > displayWorld;

  return (
    <div>
      {/* ── Scoreboard ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0d1f3c 0%, #0a1628 100%)',
        border: '1px solid #1e3a5f', borderRadius: '14px',
        padding: '1.5rem 2rem', marginBottom: '1.25rem',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
            Final Score
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
            {/* Team Europe */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
                Team Europe
              </div>
              <div style={{
                fontSize: '3rem', fontWeight: 900, lineHeight: 1,
                color: winnerIsEurope ? '#f0c619' : '#475569',
              }}>
                {displayEurope}
              </div>
            </div>
            {/* Divider */}
            <div style={{ fontSize: '1.5rem', color: '#334155', fontWeight: 300 }}>–</div>
            {/* Team World */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
                Team World
              </div>
              <div style={{
                fontSize: '3rem', fontWeight: 900, lineHeight: 1,
                color: !winnerIsEurope ? '#f0c619' : '#475569',
              }}>
                {displayWorld}
              </div>
            </div>
          </div>
        </div>
        {/* Winner banner */}
        <div style={{
          textAlign: 'center', marginTop: '1rem',
          padding: '0.6rem 1.5rem',
          background: 'rgba(240,198,25,0.06)', border: '1px solid #f0c61930',
          borderRadius: '8px', display: 'inline-block', width: '100%', boxSizing: 'border-box',
        }}>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>🏆 Winner — </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f0c619' }}>{winner}</span>
          {scores?.city && <span style={{ fontSize: '0.8rem', color: '#475569', marginLeft: '0.5rem' }}>· {scores.city}</span>}
        </div>
      </div>

      {/* ── Match list ── */}
      <div style={{
        fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.12em',
        marginBottom: '0.5rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: '#60a5fa', display: 'inline-block' }} />
        All Matches
        <span style={{ color: '#334155', fontWeight: 400 }}>({sortedMatches.length})</span>
      </div>

      {sortedMatches.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {sortedMatches.map(m => <MatchRow key={m.id} m={m} />)}
        </div>
      ) : (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem', backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f' }}>
          No match data available.
        </div>
      )}
    </div>
  );
}
