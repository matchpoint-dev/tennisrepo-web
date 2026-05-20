'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getCountryFlag } from '../lib/countryUtils';
import NavBar from '../NavBar';
const PAGE_SIZE = 50;

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'elo_rating' | 'name'>('elo_rating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('players')
        .select('id, name, country_code', { count: 'exact' });

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      // Join ELO ratings for overall rating
      let eloQuery = supabase
        .from('elo_ratings')
        .select('player_id, rating')
        .eq('surface', 'Overall')
        .order('rating', { ascending: false });

      const [playersResult, eloResult] = await Promise.all([
        query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
        eloQuery,
      ]);

      if (playersResult.error) throw playersResult.error;

      const eloMap: Record<string, number> = {};
      (eloResult.data || []).forEach((e: any) => {
        eloMap[e.player_id] = Math.round(e.rating);
      });

      let merged = (playersResult.data || []).map((p: any) => ({
        ...p,
        elo: eloMap[p.id] ?? null,
      }));

      // Sort
      merged.sort((a, b) => {
        if (sortField === 'elo_rating') {
          const av = a.elo ?? 0;
          const bv = b.elo ?? 0;
          return sortDir === 'desc' ? bv - av : av - bv;
        } else {
          return sortDir === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        }
      });

      setPlayers(merged);
      setTotal(playersResult.count ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, sortField, sortDir]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const toggleSort = (field: 'elo_rating' | 'name') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'elo_rating' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <NavBar />

      {/* Page content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0c619', margin: 0 }}>Players</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {total > 0 ? `${total.toLocaleString()} players in database` : 'Loading…'}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '1rem' }}>🔍</span>
          <input
            type="text"
            placeholder="Search players by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.75rem',
              backgroundColor: '#0d1f3c',
              border: '1px solid #1e3a5f',
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '0.95rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Table */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e3a5f', backgroundColor: '#0a1628' }}>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px' }}>
                  #
                </th>
                <th
                  style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('name')}
                >
                  Player {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Country
                </th>
                <th
                  style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('elo_rating')}
                >
                  ELO Rating {sortField === 'elo_rating' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #0a1628' }}>
                    {[1, 2, 3, 4].map((c) => (
                      <td key={c} style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ height: '16px', backgroundColor: '#1e3a5f', borderRadius: '4px', opacity: 0.5 + Math.random() * 0.3 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    No players found{debouncedSearch ? ` for "${debouncedSearch}"` : ''}.
                  </td>
                </tr>
              ) : (
                players.map((player, idx) => (
                  <tr
                    key={player.id}
                    style={{ borderBottom: '1px solid #0a1628', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#142035')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.9rem' }}>
                      {page * PAGE_SIZE + idx + 1}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Link
                        href={`/players/${player.id}`}
                        style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, fontSize: '0.95rem' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f0c619')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                      >
                        {getCountryFlag(player.country_code)} {player.name}
                      </Link>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                      {player.country_code || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      {player.elo != null ? (
                        <span style={{
                          backgroundColor: '#1e3a5f',
                          color: '#f0c619',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '20px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {player.elo.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: '#4a5568', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: page === 0 ? '#0a1628' : '#0d1f3c',
                color: page === 0 ? '#4a5568' : '#e2e8f0',
                border: '1px solid #1e3a5f',
                borderRadius: '6px',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              ← Prev
            </button>
            <span style={{ color: '#64748b', fontSize: '0.875rem', padding: '0 0.5rem' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: page === totalPages - 1 ? '#0a1628' : '#0d1f3c',
                color: page === totalPages - 1 ? '#4a5568' : '#e2e8f0',
                border: '1px solid #1e3a5f',
                borderRadius: '6px',
                cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
