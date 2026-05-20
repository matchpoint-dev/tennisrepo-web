'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/countryUtils';
import NavBar from '../NavBar';
const SURFACES = ['All', 'Hard', 'Clay', 'Grass', 'Carpet'];
const LEVELS: { value: string; label: string }[] = [
  { value: 'All', label: 'All Levels' },
  { value: 'G', label: 'Grand Slam' },
  { value: 'M', label: 'Masters 1000' },
  { value: 'F', label: 'ATP Finals' },
  { value: 'NG', label: 'Next Gen Finals' },
  { value: '500', label: 'ATP 500' },
  { value: '250', label: 'ATP 250' },
  { value: 'D', label: 'Team Event' },
];

const LEVEL_LABELS: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals', NG: 'Next Gen Finals',
  '500': 'ATP 500', '250': 'ATP 250', D: 'Team Event',
};
const LEVEL_COLORS: Record<string, string> = {
  G: '#f0c619', M: '#60a5fa', F: '#1e3a8a', NG: '#06b6d4',
  '500': '#4b5563', '250': '#9ca3af', A: '#9ca3af',
  D: '#7c3aed', DC: '#7c3aed', E: '#06b6d4', C: '#64748b',
  Olympics: '#0284c7', O: '#0284c7',
};

// Definitive ATP 500 tournament names (as stored in Sackmann CSVs)
// Hamburg was 500 only 2009-2014; everything else on this list is consistently 500
// Year-range rules for ATP 500 events (Sackmann stores all as level='A').
// Each entry: [name, firstYear, lastYear]  — 9999 means still active as 500.
const ATP500_RULES: [string, number, number][] = [
  ['Rotterdam',          2000, 9999],
  ['Dubai',              2000, 9999],
  ['Acapulco',           2000, 9999],
  ['Barcelona',          2000, 9999],
  ['Halle',              2000, 9999],
  ["Queen's Club",       2000, 9999],
  ['Washington',         2000, 9999],
  ['Tokyo',              2000, 9999],
  ['Vienna',             2000, 9999],
  ['Basel',              2000, 9999],
  ['Marseille',          2009, 9999],
  ['Beijing',            2009, 9999],
  ['Stuttgart',          2009, 9999],
  ['Delray Beach',       2009, 2024],  // dropped to 250 in 2025
  ['Memphis',            2009, 2015],
  ['Rio de Janeiro',     2014, 9999],
  ['Rio De Janeiro',     2014, 9999],
  ['ATP Rio de Janeiro', 2014, 9999],
  ['Hamburg',            2009, 2014],  // was 500, dropped to 250...
  ['Hamburg',            2023, 9999],  // ...restored to 500 in 2023
  ['Doha',               2025, 9999],  // elevated to 500 in 2025
  ['Nur-Sultan',         2020, 2021],
  ['Astana',             2022, 9999],
];

// Tournaments starting Dec 26+ are effectively the following year's edition
function displayYear(year: number, startDate: string | null): number {
  if (!startDate) return year;
  const d = new Date(startDate);
  if (d.getMonth() === 11 && d.getDate() >= 26) return year + 1;
  return year;
}

function resolveLevel(level: string, name: string, year: number, _drawSize: number | null): string {
  // Name+year rules always win — DB may have stored wrong level
  for (const [n, from, to] of ATP500_RULES) {
    if (n === name && year >= from && year <= to) return '500';
  }
  // Grand Slams, Masters, Finals etc stay as-is
  if (level !== 'A' && level !== '250' && level !== '500') return level;
  return level === 'A' ? '250' : level;
}
const SURFACE_COLORS: Record<string, string> = {
  Hard: '#3b82f6', Clay: '#ef4444', Grass: '#22c55e', Carpet: '#a855f7',
};

const PER_PAGE = 24;

export default function TournamentsPage() {
  const [allTournaments, setAllTournaments] = useState<any[]>([]);
  const [winners, setWinners] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState('All');
  const [level, setLevel] = useState('All');
  const [year, setYear] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Fetch all available years once on mount — independent of any filters
  // so the year dropdown always shows every possible year regardless of
  // what surface/level/year is currently selected.
  useEffect(() => {
    const fetchYears = async () => {
      const CHUNK = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('tournaments')
          .select('year, start_date')
          .neq('level', 'DC')
          .range(from, from + CHUNK - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < CHUNK) break;
        from += CHUNK;
      }
      const years = [
        ...new Set(all.map((t: any) => displayYear(t.year, t.start_date)).filter(Boolean))
      ] as number[];
      years.sort((a, b) => b - a);
      setAvailableYears(years);
    };
    fetchYears();
  }, []);

  // Fetch tournaments whenever filters change
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPage(1);

    const CHUNK = 1000;

    const timer = setTimeout(async () => {
      try {
        // Fetch all matching tournaments in chunks (Supabase caps at 1000/request)
        let all: any[] = [];
        let from = 0;
        while (true) {
          let q = supabase
            .from('tournaments')
            .select('id, name, surface, level, year, start_date, draw_size')
            .order('start_date', { ascending: false })
            .neq('level', 'DC')
            .range(from, from + CHUNK - 1);

          if (surface !== 'All') q = q.eq('surface', surface);
          if (level !== 'All') q = q.eq('level', level);
          if (year !== 'All') q = q.eq('year', parseInt(year));
          if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);

          const { data, error: qErr } = await q;
          if (qErr) throw new Error(qErr.message);
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < CHUNK) break;
          from += CHUNK;
        }

        // Deduplicate by (name, displayYear) — keep the highest ID per pair.
        // Using displayYear (not raw DB year) as the key ensures ghost rows that have
        // a wrong DB year (e.g. year=2025 for a Dec 30 2024 start) don't create
        // duplicate cards under the wrong year group.
        const seen = new Map<string, any>();
        for (const t of all) {
          const key = `${t.name}|${displayYear(t.year, t.start_date)}`;
          if (!seen.has(key) || t.id > seen.get(key).id) {
            seen.set(key, t);
          }
        }
        setAllTournaments(Array.from(seen.values()));
      } catch (err: any) {
        setError(err?.message ?? 'Unknown error');
        setAllTournaments([]);
      }
      setLoading(false);
    }, search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [surface, level, year, search]);

  // Pagination
  const totalPages = Math.ceil(allTournaments.length / PER_PAGE);
  const pageTournaments = allTournaments.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Fetch winners for the current page's tournaments
  useEffect(() => {
    if (pageTournaments.length === 0) return;
    const ids = pageTournaments.map((t: any) => t.id);
    supabase
      .from('matches')
      .select('tournament_id, winner:players!matches_winner_id_fkey(id, full_name, country_code)')
      .in('tournament_id', ids)
      .eq('round', 'F')
      .then(({ data }) => {
        const map: Record<number, any> = {};
        (data || []).forEach((m: any) => { if (m.winner) map[m.tournament_id] = m.winner; });
        setWinners(prev => ({ ...prev, ...map }));
      });
  }, [page, allTournaments]);

  // Group current page's tournaments by year
  const grouped: Record<string, any[]> = {};
  for (const t of pageTournaments) {
    const y = String(displayYear(t.year, t.start_date) ?? 'Unknown');
    if (!grouped[y]) grouped[y] = [];
    grouped[y].push(t);
  }
  const sortedYears = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Page number buttons — show up to 7 around current page
  const pageButtons: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageButtons.push(i);
  } else {
    pageButtons.push(1);
    if (page > 3) pageButtons.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pageButtons.push(i);
    if (page < totalPages - 2) pageButtons.push('...');
    pageButtons.push(totalPages);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <NavBar />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0c619', margin: 0 }}>Tournaments</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {loading ? 'Loading…' : error ? 'Error loading tournaments' : `${allTournaments.length.toLocaleString()} tournaments`}
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>🔍</span>
            <input
              type="text"
              placeholder="Search tournaments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f',
                borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <select value={surface} onChange={(e) => setSurface(e.target.value)} style={{ padding: '0.6rem 1rem', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}>
            {SURFACES.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Surfaces' : s}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={{ padding: '0.6rem 1rem', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: '0.6rem 1rem', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}>
            <option value="All">All Years</option>
            {availableYears.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ backgroundColor: '#0d1f3c', borderRadius: '10px', padding: '1rem', height: '100px', border: '1px solid #1e3a5f', opacity: 0.5 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#ef4444', padding: '4rem', backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f' }}>
            Error: {error}
          </div>
        ) : allTournaments.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '4rem' }}>
            No tournaments found for the selected filters.
          </div>
        ) : (
          <>
            {sortedYears.map((yr) => (
              <div key={yr} style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', borderLeft: '3px solid #f0c619', paddingLeft: '0.75rem' }}>
                  {yr}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  {grouped[yr].map((t: any) => (
                    <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: 'none' }}>
                      <div
                        style={{ backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: '10px', padding: '1rem 1.25rem', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#f0c619'; (e.currentTarget as HTMLDivElement).style.backgroundColor = '#142035'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1e3a5f'; (e.currentTarget as HTMLDivElement).style.backgroundColor = '#0d1f3c'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.3 }}>{t.name}</span>
                          {t.level && (() => { const lvl = resolveLevel(t.level, t.name, t.year, t.draw_size); return (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: LEVEL_COLORS[lvl] ?? '#94a3b8', backgroundColor: '#0a1628', border: `1px solid ${LEVEL_COLORS[lvl] ?? '#1e3a5f'}`, borderRadius: '4px', padding: '0.15rem 0.4rem', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                              {LEVEL_LABELS[lvl] ?? lvl}
                            </span>
                          ); })()}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.4rem' }}>
                          {t.surface && (
                            <span style={{ fontSize: '0.78rem', color: SURFACE_COLORS[t.surface] ?? '#94a3b8', fontWeight: 500 }}>
                              ● {t.surface}
                            </span>
                          )}
                          {t.start_date && (
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                              {t.start_date}
                            </span>
                          )}
                        </div>
                        {winners[t.id] && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid #1e3a5f' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>W</span>
                            {getFlagUrl(winners[t.id].country_code) && (
                              <img src={getFlagUrl(winners[t.id].country_code)!} alt={winners[t.id].country_code} style={{ width: 16, height: 12, borderRadius: 1, flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0c619', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {winners[t.id].full_name}
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', marginTop: '2.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '6px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: page === 1 ? '#334155' : '#94a3b8', fontSize: '0.85rem', cursor: page === 1 ? 'default' : 'pointer' }}
                >
                  ← Prev
                </button>

                {pageButtons.map((btn, i) =>
                  btn === '...' ? (
                    <span key={`ellipsis-${i}`} style={{ color: '#334155', padding: '0 0.25rem' }}>…</span>
                  ) : (
                    <button
                      key={btn}
                      onClick={() => goToPage(btn as number)}
                      style={{
                        padding: '0.45rem 0.75rem', borderRadius: '6px',
                        backgroundColor: btn === page ? '#f0c619' : '#0d1f3c',
                        border: `1px solid ${btn === page ? '#f0c619' : '#1e3a5f'}`,
                        color: btn === page ? '#0a1628' : '#94a3b8',
                        fontSize: '0.85rem', fontWeight: btn === page ? 700 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {btn}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '6px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: page === totalPages ? '#334155' : '#94a3b8', fontSize: '0.85rem', cursor: page === totalPages ? 'default' : 'pointer' }}
                >
                  Next →
                </button>

                <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  Page {page} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
