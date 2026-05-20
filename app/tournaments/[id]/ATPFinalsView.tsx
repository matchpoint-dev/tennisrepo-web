'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFlagUrl } from '../../lib/countryUtils';

// ─── Score parsing ────────────────────────────────────────────────────────────
function parseScore(score: string | null): { wSets: number; lSets: number } {
  if (!score) return { wSets: 0, lSets: 0 };
  const sets = score.replace(/\([^)]*\)/g, '').trim().split(/\s+/);
  let wSets = 0, lSets = 0;
  for (const set of sets) {
    const parts = set.split('-');
    if (parts.length !== 2) continue;
    const a = parseInt(parts[0]), b = parseInt(parts[1]);
    if (isNaN(a) || isNaN(b)) continue;
    if (a > b) wSets++; else if (b > a) lSets++;
  }
  return { wSets, lSets };
}

// ─── Connected-components group inference ────────────────────────────────────
function inferGroups(rrMatches: any[]): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const m of rrMatches) {
    const w: number = m.winner_id ?? m.winner?.id;
    const l: number = m.loser_id ?? m.loser?.id;
    if (!w || !l) continue;
    if (!adj.has(w)) adj.set(w, new Set());
    if (!adj.has(l)) adj.set(l, new Set());
    adj.get(w)!.add(l);
    adj.get(l)!.add(w);
  }
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const pid of adj.keys()) {
    if (visited.has(pid)) continue;
    const comp: number[] = [];
    const queue = [pid];
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
  // Largest groups first
  return components.sort((a, b) => b.length - a.length);
}

// ─── Standings computation ────────────────────────────────────────────────────
interface Standing {
  player: any;
  seed?: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
}

function computeStandings(
  groupIds: number[],
  rrMatches: any[],
  playerMap: Map<number, any>,
  seedMap: Map<number, number>,
): Standing[] {
  const standings = new Map<number, Standing>();
  for (const pid of groupIds) {
    standings.set(pid, {
      player: playerMap.get(pid),
      seed: seedMap.get(pid),
      wins: 0, losses: 0, setsWon: 0, setsLost: 0,
    });
  }
  for (const m of rrMatches) {
    const wid: number = m.winner_id ?? m.winner?.id;
    const lid: number = m.loser_id ?? m.loser?.id;
    if (!standings.has(wid) || !standings.has(lid)) continue;
    standings.get(wid)!.wins++;
    standings.get(lid)!.losses++;
    const { wSets, lSets } = parseScore(m.score);
    standings.get(wid)!.setsWon += wSets;
    standings.get(wid)!.setsLost += lSets;
    standings.get(lid)!.setsWon += lSets;
    standings.get(lid)!.setsLost += wSets;
  }
  return Array.from(standings.values()).sort(
    (a, b) => b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost),
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ label, count, color = '#a855f7' }: { label: string; count?: number; color?: string }) {
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

function GroupTable({ standings }: { standings: Standing[] }) {
  const advance = Math.min(2, Math.floor(standings.length / 2));
  return (
    <div style={{ border: '1px solid #1e3a5f', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.75rem' }}>
      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 36px 36px 56px',
        backgroundColor: '#0a1628', padding: '0.45rem 1rem', gap: '0.25rem',
      }}>
        {['Player', 'W', 'L', 'Sets'].map((h, i) => (
          <span key={h} style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#475569',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            textAlign: i > 0 ? 'center' : 'left',
          }}>{h}</span>
        ))}
      </div>
      {standings.map((s, i) => (
        <div key={s.player?.id ?? i} style={{
          display: 'grid', gridTemplateColumns: '1fr 36px 36px 56px',
          padding: '0.55rem 1rem', gap: '0.25rem', alignItems: 'center',
          backgroundColor: i < advance ? 'rgba(240,198,25,0.04)' : 'transparent',
          borderTop: '1px solid #1e3a5f',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.5rem', color: i < advance ? '#f0c619' : 'transparent', flexShrink: 0 }}>●</span>
            {s.seed != null && (
              <span style={{ fontSize: '0.65rem', color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>
                {s.seed}
              </span>
            )}
            {getFlagUrl(s.player?.country_code) && (
              <img src={getFlagUrl(s.player?.country_code)!} alt="" style={{ height: 12, borderRadius: 1, flexShrink: 0 }} />
            )}
            <Link href={`/players/${s.player?.id}`} style={{
              color: i < advance ? '#e2e8f0' : '#64748b', textDecoration: 'none',
              fontWeight: i < advance ? 600 : 400, fontSize: '0.85rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.player?.full_name ?? '—'}
            </Link>
          </div>
          <span style={{ textAlign: 'center', color: '#22c55e', fontWeight: 700, fontSize: '0.88rem' }}>{s.wins}</span>
          <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>{s.losses}</span>
          <span style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>{s.setsWon}–{s.setsLost}</span>
        </div>
      ))}
    </div>
  );
}

function MatchRow({ m, highlight = false }: { m: any; highlight?: boolean }) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/matches/${m.id}`)}
      style={{
        backgroundColor: highlight ? '#1a1600' : '#0d1f3c',
        border: `1px solid ${highlight ? '#f0c61930' : '#1e3a5f'}`,
        borderRadius: '8px', padding: '0.65rem 1.25rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: '1rem', cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = highlight ? '#f0c61970' : '#2e4f7a';
        e.currentTarget.style.backgroundColor = highlight ? '#1f1a00' : '#112040';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = highlight ? '#f0c61930' : '#1e3a5f';
        e.currentTarget.style.backgroundColor = highlight ? '#1a1600' : '#0d1f3c';
      }}
    >
      {/* Winner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
        {m.winner_seed != null && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
            {m.winner_seed}
          </span>
        )}
        <Link href={`/players/${m.winner?.id}`} onClick={e => e.stopPropagation()} style={{
          color: highlight ? '#f0c619' : '#e2e8f0', textDecoration: 'none',
          fontWeight: 600, fontSize: '0.9rem',
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
        {m.loser_seed != null && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
            {m.loser_seed}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ATPFinalsView({ matches }: { matches: any[] }) {
  const rrMatches = matches.filter(m => m.round === 'RR');
  const sfMatches = matches.filter(m => m.round === 'SF');
  const fMatch    = matches.find(m => m.round === 'F');

  // Build player + seed lookup
  const playerMap = new Map<number, any>();
  const seedMap   = new Map<number, number>();
  for (const m of matches) {
    const wid: number = m.winner_id ?? m.winner?.id;
    const lid: number = m.loser_id  ?? m.loser?.id;
    if (wid && m.winner) playerMap.set(wid, m.winner);
    if (lid && m.loser)  playerMap.set(lid, m.loser);
    if (m.winner_seed && wid) seedMap.set(wid, m.winner_seed);
    if (m.loser_seed  && lid) seedMap.set(lid, m.loser_seed);
  }

  const groups = inferGroups(rrMatches);
  const GROUP_NAMES = ['Group A', 'Group B', 'Group C', 'Group D'];

  return (
    <div>
      {/* ── Round-robin groups ── */}
      {groups.length > 0 && groups.map((groupIds, gi) => {
        const standings = computeStandings(groupIds, rrMatches, playerMap, seedMap);
        const groupMatches = rrMatches.filter(m => {
          const wid: number = m.winner_id ?? m.winner?.id;
          return groupIds.includes(wid);
        });
        return (
          <div key={gi}>
            <SectionHeader label={GROUP_NAMES[gi] ?? `Group ${gi + 1}`} color="#a855f7" />
            <GroupTable standings={standings} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
              {groupMatches.map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          </div>
        );
      })}

      {/* ── Semifinals ── */}
      {sfMatches.length > 0 && (
        <>
          <SectionHeader label="Semifinals" count={sfMatches.length} color="#f0c619" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {sfMatches.map(m => <MatchRow key={m.id} m={m} />)}
          </div>
        </>
      )}

      {/* ── Final ── */}
      {fMatch && (
        <>
          <SectionHeader label="Final" color="#f0c619" />
          <div style={{ marginBottom: '1rem' }}>
            <MatchRow m={fMatch} highlight />
          </div>
        </>
      )}

      {/* No data fallback */}
      {matches.length === 0 && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem', backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f' }}>
          No match data available.
        </div>
      )}
    </div>
  );
}
