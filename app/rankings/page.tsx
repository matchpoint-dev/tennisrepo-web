'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/countryUtils';
import NavBar from '../NavBar';
const PAGE_SIZE = 100;

function formatDate(dateStr: string) {
  // dateStr is YYYY-MM-DD — parse without timezone shift
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function RankingsPage() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRankings = async () => {
      setLoading(true);
      setError(null);
      try {
        // Step 1: get the most recent ranking week (cache after first load)
        let rankingDate = latestDate;
        if (!rankingDate) {
          const { data: dateRow, error: dateErr } = await supabase
            .from('rankings')
            .select('ranking_date')
            .order('ranking_date', { ascending: false })
            .limit(1)
            .single();
          if (dateErr) throw new Error(`Date fetch failed: ${dateErr.message}`);
          if (!dateRow) throw new Error('No ranking data found');
          rankingDate = dateRow.ranking_date;
          setLatestDate(rankingDate);
        }

        // Step 2: fetch this week's rankings, paginated
        const { data: rankRows, error: rankErr, count } = await supabase
          .from('rankings')
          .select('rank, points, player_id', { count: 'exact' })
          .eq('ranking_date', rankingDate)
          .order('rank', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (rankErr) throw new Error(`Rankings fetch failed: ${rankErr.message}`);
        if (!rankRows || rankRows.length === 0) {
          setRankings([]);
          setTotal(0);
          return;
        }

        // Step 3: fetch player names + countries
        const playerIds = rankRows.map((r: any) => r.player_id);
        const { data: playerRows, error: playerErr } = await supabase
          .from('players')
          .select('id, full_name, country_code')
          .in('id', playerIds);

        if (playerErr) throw new Error(`Players fetch failed: ${playerErr.message}`);

        const playerMap: Record<number, { name: string; country_code: string }> = {};
        (playerRows || []).forEach((p: any) => {
          playerMap[p.id] = { name: p.full_name, country_code: p.country_code ?? '' };
        });

        const rows = rankRows.map((row: any) => ({
          rank: row.rank,
          playerId: row.player_id,
          playerName: playerMap[row.player_id]?.name ?? 'Unknown',
          countryCode: playerMap[row.player_id]?.country_code ?? '',
          points: row.points ?? 0,
        }));

        setRankings(rows);
        setTotal(count ?? 0);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <NavBar />

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0c619', margin: 0 }}>ATP Rankings</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {latestDate ? `Week of ${formatDate(latestDate)}` : 'Current week'}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ backgroundColor: '#2d1a1a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.875rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Rankings Table */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: '12px', border: '1px solid #1e3a5f', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e3a5f', backgroundColor: '#0a1628' }}>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', width: '64px' }}>
                  Rank
                </th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Player
                </th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px' }}>
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #0a1628' }}>
                    {[1, 2, 3].map((c) => (
                      <td key={c} style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ height: '16px', backgroundColor: '#1e3a5f', borderRadius: '4px', opacity: 0.4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                rankings.map((row) => {
                  const isTop3 = row.rank <= 3;
                  const rankColors = ['#f0c619', '#94a3b8', '#cd7c44'];
                  const flagUrl = getFlagUrl(row.countryCode);
                  return (
                    <tr
                      key={row.playerId}
                      style={{ borderBottom: '1px solid #0a1628' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#142035')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Rank */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: isTop3 ? rankColors[row.rank - 1] + '22' : 'transparent',
                          color: isTop3 ? rankColors[row.rank - 1] : '#64748b',
                          fontSize: '0.9rem',
                          fontWeight: isTop3 ? 700 : 400,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {row.rank}
                        </span>
                      </td>

                      {/* Player name + flag */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <Link
                          href={`/players/${row.playerId}`}
                          style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#f0c619')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                        >
                          {flagUrl ? (
                            <img
                              src={flagUrl}
                              alt={row.countryCode}
                              style={{ width: '24px', height: '18px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: '24px', display: 'inline-block', color: '#64748b', fontSize: '0.8rem' }}>
                              {row.countryCode || '—'}
                            </span>
                          )}
                          {row.playerName}
                        </Link>
                      </td>

                      {/* Points */}
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                        <span style={{
                          color: '#f0c619',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {row.points.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })
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
            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
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
