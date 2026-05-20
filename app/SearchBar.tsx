'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase';
import { getFlagUrl } from './lib/countryUtils';

const LEVEL_LABELS: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals',
  '500': 'ATP 500', '250': 'ATP 250', A: 'ATP 250',
  D: 'Team Event', DC: 'Davis Cup', E: 'Exhibition', NG: 'Exhibition',
  C: 'Challenger', Olympics: 'Olympics', O: 'Olympics',
};
const LEVEL_COLORS: Record<string, string> = {
  G: '#f0c619', M: '#60a5fa', F: '#1e3a8a',
  '500': '#4b5563', '250': '#9ca3af', A: '#9ca3af',
  D: '#7c3aed', DC: '#7c3aed', E: '#06b6d4', NG: '#06b6d4',
  C: '#64748b', Olympics: '#0284c7', O: '#0284c7',
};

// All known ATP Finals name variants — used to detect ATP Finals queries
const ATP_FINALS_ALIASES = [
  'atp finals', 'tour finals', 'masters cup', 'tennis masters cup',
  'atp world tour finals', 'atp tour world championships',
  'grand prix masters', 'masters grand prix',
];

function queryMatchesAtpFinals(q: string): boolean {
  const lower = q.toLowerCase().trim();
  if (lower.length < 2) return false;
  return ATP_FINALS_ALIASES.some(alias => alias.includes(lower));
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlayers([]);
      setTournaments([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // Build fetches — always players + name-matched tournaments
        // Also fetch level=F if query looks like an ATP Finals search
        const fetches: Promise<any>[] = [
          supabase
            .from('players')
            .select('id, full_name, country_code')
            .ilike('full_name', `%${q}%`)
            .limit(6),
          supabase
            .from('tournaments')
            .select('id, name, year, level, start_date')
            .ilike('name', `%${q}%`)
            .neq('level', 'DC')  // Davis Cup excluded from search
            .order('year', { ascending: false })
            .order('id', { ascending: false })
            .limit(300),
        ];

        if (queryMatchesAtpFinals(q)) {
          fetches.push(
            supabase
              .from('tournaments')
              .select('id, name, year, level, start_date')
              .eq('level', 'F')
              .order('year', { ascending: false })
              .order('id', { ascending: false })
              .limit(10)
          );
        }

        const responses = await Promise.all(fetches);
        const playerData: any[] = responses[0].data || [];
        const tourData: any[] = [
          ...(responses[1].data || []),
          ...(responses[2]?.data || []),
        ];

        // Deduplicate tournaments by canonical name.
        // All level=F tournaments → canonical name "ATP Finals".
        // For all others, canonical name = tournament name.
        // Ordered by year desc + id desc, so the first entry per canonical name
        // is automatically the latest edition with the highest (match-bearing) ID.
        const seen = new Map<string, any>();
        for (const t of tourData) {
          const canonicalName = t.level === 'F' ? 'ATP Finals' : t.name;
          const canonicalLevel = t.level === 'F' ? 'F' : t.level;
          if (!seen.has(canonicalName)) {
            seen.set(canonicalName, { ...t, canonicalName, canonicalLevel });
          }
        }

        // Filter: canonical name must include query, OR it's an ATP Finals match
        const lower = q.toLowerCase();
        const deduped = Array.from(seen.values())
          .filter(t => {
            if (t.canonicalLevel === 'F') {
              return queryMatchesAtpFinals(q) || t.canonicalName.toLowerCase().includes(lower);
            }
            return t.canonicalName.toLowerCase().includes(lower);
          })
          .slice(0, 5);

        setPlayers(playerData);
        setTournaments(deduped);
        setOpen(true);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasResults = players.length > 0 || tournaments.length > 0;
  const isOpen = open && hasResults;

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} style={{ position: 'relative', maxWidth: 600, margin: '0 auto' }}>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search players or tournaments…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          style={{
            width: '100%',
            padding: '14px 20px 14px 48px',
            fontSize: 16,
            backgroundColor: '#0a1628',
            border: `2px solid ${isOpen ? '#f0c619' : '#1e3a5f'}`,
            borderRadius: isOpen ? '8px 8px 0 0' : 8,
            color: 'white',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />
        <span style={{
          position: 'absolute', left: 16, top: '50%',
          transform: 'translateY(-50%)', color: '#64748b', fontSize: 18,
        }}>
          🔍
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          backgroundColor: '#0d1f3c',
          border: '2px solid #f0c619',
          borderTop: '1px solid #1e3a5f',
          borderRadius: '0 0 10px 10px',
          zIndex: 200,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>

          {/* Players section */}
          {players.length > 0 && (
            <>
              <div style={{
                padding: '7px 16px',
                color: '#64748b', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                backgroundColor: '#0a1628',
              }}>
                Players
              </div>
              {players.map((p: any) => {
                const flagUrl = getFlagUrl(p.country_code);
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/players/${p.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', cursor: 'pointer',
                      borderBottom: '1px solid #0f2744',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#142035')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {flagUrl
                      ? <img src={flagUrl} alt={p.country_code} style={{ width: 20, height: 15, borderRadius: 2, flexShrink: 0 }} />
                      : <span style={{ width: 20, display: 'inline-block' }} />
                    }
                    <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>
                      {p.full_name}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {/* Tournaments section */}
          {tournaments.length > 0 && (
            <>
              <div style={{
                padding: '7px 16px',
                color: '#64748b', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                backgroundColor: '#0a1628',
                borderTop: players.length > 0 ? '1px solid #1e3a5f' : 'none',
              }}>
                Tournaments
              </div>
              {tournaments.map((t: any) => {
                const lvl = t.canonicalLevel || t.level;
                const color = LEVEL_COLORS[lvl] ?? '#94a3b8';
                const label = LEVEL_LABELS[lvl] ?? lvl;
                return (
                  <div
                    key={t.id}
                    onClick={() => navigate(`/tournaments/${t.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 10,
                      padding: '10px 16px', cursor: 'pointer',
                      borderBottom: '1px solid #0f2744',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#142035')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>
                      {t.canonicalName}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color, border: `1px solid ${color}`,
                      borderRadius: 4, padding: '2px 6px',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
