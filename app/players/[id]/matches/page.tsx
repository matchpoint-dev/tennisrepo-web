import NavBar from '../../../NavBar';
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { supabase } from '../../../lib/supabase'
import PlayerTabNav from '../PlayerTabNav'
import { getFlagUrl } from '../../../lib/countryUtils'

const inter = Inter({ subsets: ['latin'] })

const ROUND_ORDER = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128', 'RR', 'BR']
const ROUND_LABELS: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal',
  R16: 'Round of 16', R32: 'Round of 32', R64: 'Round of 64',
  R128: 'Round of 128', RR: 'Round Robin', BR: 'Bronze',
}
const LEVEL_LABELS: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals',
  '500': 'ATP 500', '250': 'ATP 250', A: 'ATP 250',
  D: 'Team Event', DC: 'Davis Cup', E: 'Exhibition', C: 'Challenger', NG: 'Exhibition',
  Olympics: 'Olympics', O: 'Olympics',
}
const LEVEL_COLORS: Record<string, string> = {
  G: '#f0c619', M: '#60a5fa', F: '#1e3a8a',
  '500': '#4b5563', '250': '#9ca3af', A: '#9ca3af',
  D: '#7c3aed', DC: '#7c3aed', E: '#06b6d4', C: '#64748b', NG: '#06b6d4',
  Olympics: '#0284c7', O: '#0284c7',
}
const SURFACE_COLORS: Record<string, string> = {
  Clay: '#8B4513', Grass: '#2d5a1b', Hard: '#1e3a5f', Carpet: '#4a1d96',
}

const GROUPS_PER_PAGE = 20

function resolveLevel(level: string): string {
  if (level === 'A') return '250'
  if (level === 'NG') return 'E'
  if (level === 'O') return 'Olympics'
  return level
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return ''
  return `${MONTHS[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`
}


async function fetchAllMatches(playerId: string) {
  const CHUNK = 1000
  let all: any[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('matches')
      .select('*, tournaments(id, name, surface, level, year, start_date), winner:players!matches_winner_id_fkey(id, full_name), loser:players!matches_loser_id_fkey(id, full_name)')
      .or(`winner_id.eq.${playerId},loser_id.eq.${playerId}`)
      .order('match_date', { ascending: false })
      .range(from, from + CHUNK - 1)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < CHUNK) break
    from += CHUNK
  }
  return all
}

export default function MatchesPage() {
  const params = useParams()
  const id = params.id as string
  const searchParams = useSearchParams()
  const router = useRouter()

  const [player, setPlayer] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState('Loading matches...')

  const [surfaceFilter, setSurfaceFilter] = useState(searchParams.get('surface') || 'All')
  const [levelFilter, setLevelFilter] = useState(searchParams.get('level') || 'All')
  const [resultFilter, setResultFilter] = useState(searchParams.get('result') || 'All')
  const [yearFilter, setYearFilter] = useState(searchParams.get('year') || 'All')
  const [roundFilter, setRoundFilter] = useState(searchParams.get('round') || 'All')
  const [currentPage, setCurrentPage] = useState(1)

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [surfaceFilter, levelFilter, resultFilter, yearFilter, roundFilter])

  useEffect(() => {
    async function fetchData() {
      setLoadingStatus('Fetching player info...')
      const { data: playerData } = await supabase.from('players').select('*').eq('id', id).single()
      setPlayer(playerData)

      setLoadingStatus('Fetching matches...')
      const matchData = await fetchAllMatches(id)
      setMatches(matchData)
      setLoading(false)
    }
    fetchData()
  }, [id])

  const years = useMemo(() =>
    [...new Set(matches.map((m: any) => m.tournaments?.year).filter(Boolean))].sort((a: number, b: number) => b - a),
    [matches]
  )

  const filteredMatches = useMemo(() => {
    return matches.filter((m: any) => {
      if (surfaceFilter !== 'All' && m.tournaments?.surface !== surfaceFilter) return false
      if (levelFilter !== 'All' && resolveLevel(m.tournaments?.level || '') !== levelFilter) return false
      const won = m.winner_id === parseInt(id)
      if (resultFilter === 'Won' && !won) return false
      if (resultFilter === 'Lost' && won) return false
      if (yearFilter !== 'All' && String(m.tournaments?.year) !== yearFilter) return false
      if (roundFilter !== 'All' && m.round !== roundFilter) return false
      return true
    })
  }, [matches, surfaceFilter, levelFilter, resultFilter, yearFilter, roundFilter, id])

  // Group by (name, year) — dedup duplicates, sort by date desc
  const allGroups = useMemo(() => {
    const grouped = new Map<string, { tid: number; tournament: any; matches: any[] }>()
    for (const m of filteredMatches) {
      const key = `${m.tournaments?.name}|${m.tournaments?.year}`
      if (!grouped.has(key)) grouped.set(key, { tid: m.tournament_id, tournament: m.tournaments, matches: [] })
      grouped.get(key)!.matches.push(m)
    }
    return Array.from(grouped.values()).sort((a, b) => {
      const da = a.tournament?.start_date || '0000'
      const db = b.tournament?.start_date || '0000'
      return db > da ? 1 : -1
    })
  }, [filteredMatches])

  const totalPages = Math.max(1, Math.ceil(allGroups.length / GROUPS_PER_PAGE))
  const pagedGroups = allGroups.slice((currentPage - 1) * GROUPS_PER_PAGE, currentPage * GROUPS_PER_PAGE)

  const flagUrl = getFlagUrl(player?.country_code)

  const selectStyle = {
    padding: '7px 12px', fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: '1px solid #1e3a5f',
    backgroundColor: '#0a1628', color: 'white', cursor: 'pointer',
  }

  const pageBtnStyle = (active: boolean, disabled = false) => ({
    padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6,
    border: active ? '1px solid #f0c619' : '1px solid #1e3a5f',
    backgroundColor: active ? '#1a1200' : '#0d1f3c',
    color: active ? '#f0c619' : disabled ? '#374151' : '#94a3b8',
    cursor: disabled ? 'default' : 'pointer',
  })

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 8 }}>{loadingStatus}</div>
          <div style={{ fontSize: 13, color: '#374151' }}>This may take a moment for players with long careers</div>
        </div>
      </main>
    )
  }

  if (!player) return <div style={{ color: 'white', padding: 40 }}>Player not found</div>

  return (
    <main className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white' }}>

      {/* Nav */}
      <NavBar />

      {/* Player Header */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '32px 24px 20px', borderBottom: '1px solid #1e3a5f' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="8" r="4" fill="#4a6fa5"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#4a6fa5" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <Link href={`/players/${id}`} style={{ textDecoration: 'none' }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 10 }}>
                {flagUrl && <img src={flagUrl} alt={player.country_code} style={{ height: 18, borderRadius: 2 }} />}
                {player.full_name}
              </h1>
            </Link>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              {player.country_code}{player.hand ? ` · ${player.hand === 'R' ? 'Right-handed' : player.hand === 'L' ? 'Left-handed' : player.hand}` : ''}
            </div>
          </div>
        </div>
      </div>

      <PlayerTabNav id={id} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Filters */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>

            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Surface</div>
              <select value={surfaceFilter} onChange={e => setSurfaceFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Surfaces</option>
                <option value="Hard">Hard</option>
                <option value="Clay">Clay</option>
                <option value="Grass">Grass</option>
                <option value="Carpet">Carpet</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Level</div>
              <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Levels</option>
                <option value="G">Grand Slam</option>
                <option value="M">Masters 1000</option>
                <option value="F">ATP Finals</option>
                <option value="500">ATP 500</option>
                <option value="250">ATP 250</option>
                <option value="D">Team Event</option>
                <option value="DC">Davis Cup</option>
                <option value="E">Exhibition</option>
                <option value="Olympics">Olympics</option>
                <option value="C">Challenger</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Result</div>
              <select value={resultFilter} onChange={e => setResultFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Results</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Round</div>
              <select value={roundFilter} onChange={e => setRoundFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Rounds</option>
                <option value="F">Final</option>
                <option value="SF">Semifinal</option>
                <option value="QF">Quarterfinal</option>
                <option value="R16">Round of 16</option>
                <option value="R32">Round of 32</option>
                <option value="R64">Round of 64</option>
                <option value="R128">Round of 128</option>
                <option value="RR">Round Robin</option>
                <option value="BR">Bronze Match</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Year</div>
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Years</option>
                {years.map((y: number) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              <strong style={{ color: 'white' }}>{filteredMatches.length}</strong> matches ·{' '}
              <strong style={{ color: 'white' }}>{allGroups.length}</strong> tournaments
              {totalPages > 1 && <span> · page <strong style={{ color: 'white' }}>{currentPage}</strong> of <strong style={{ color: 'white' }}>{totalPages}</strong></span>}
            </span>
            {(surfaceFilter !== 'All' || levelFilter !== 'All' || resultFilter !== 'All' || yearFilter !== 'All' || roundFilter !== 'All') && (
              <button onClick={() => { setSurfaceFilter('All'); setLevelFilter('All'); setResultFilter('All'); setYearFilter('All'); setRoundFilter('All') }}
                style={{ padding: '2px 10px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid #374151', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Match Groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pagedGroups.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 16 }}>
              No matches found for the selected filters.
            </div>
          )}
          {pagedGroups.map(({ tid, tournament, matches: groupMatches }) => {
            const level = tournament?.level || ''
            const levelColor = LEVEL_COLORS[level] || LEVEL_COLORS[resolveLevel(level)] || '#374151'
            const surfaceColor = SURFACE_COLORS[tournament?.surface] || '#1e3a5f'
            const sortedGroup = [...groupMatches].sort((a, b) => {
              const ri = ROUND_ORDER.indexOf(a.round)
              const rj = ROUND_ORDER.indexOf(b.round)
              return (ri === -1 ? 99 : ri) - (rj === -1 ? 99 : rj)
            })
            const wins = groupMatches.filter((m: any) => m.winner_id === parseInt(id)).length
            const losses = groupMatches.length - wins

            return (
              <div key={`${tournament?.name}|${tournament?.year}`} style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#0a1e38', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Link href={`/tournaments/${tid}`} style={{ textDecoration: 'none', flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{tournament?.name}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 12 }}>{tournament?.year}</span>
                    {tournament?.start_date && (
                      <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>· {formatDate(tournament.start_date)}</span>
                    )}
                  </Link>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: levelColor, color: 'white' }}>
                      {LEVEL_LABELS[level] || LEVEL_LABELS[resolveLevel(level)] || resolveLevel(level)}
                    </span>
                    {tournament?.surface && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: surfaceColor, color: 'white' }}>
                        {tournament.surface}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{wins}W–{losses}L</span>
                  </div>
                </div>

                {sortedGroup.map((m: any) => {
                  const won = m.winner_id === parseInt(id)
                  const opponentId   = won ? m.loser?.id        : m.winner?.id
                  const opponentName = won ? m.loser?.full_name  : m.winner?.full_name
                  const oppSeed  = won ? m.loser_seed  : m.winner_seed
                  const oppEntry = won ? m.loser_entry : m.winner_entry
                  const oppRank  = won ? m.loser_rank  : m.winner_rank
                  return (
                    <div key={m.id}
                      onClick={() => router.push(`/matches/${m.id}`)}
                      style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #152a47', gap: 10, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0f2a47')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, minWidth: 28, textAlign: 'center', backgroundColor: won ? '#1a3a1a' : '#3a1a1a', color: won ? '#4ade80' : '#f87171' }}>
                        {won ? 'W' : 'L'}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b', minWidth: 100 }}>{ROUND_LABELS[m.round] || m.round}</span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: '#cbd5e1' }}>vs</span>
                        {oppSeed ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 3, padding: '1px 5px' }}>
                            {oppSeed}
                          </span>
                        ) : oppEntry ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', backgroundColor: '#1e3a5f', borderRadius: 3, padding: '1px 5px' }}>
                            {oppEntry}
                          </span>
                        ) : null}
                        {opponentId ? (
                          <Link href={`/players/${opponentId}`} onClick={e => e.stopPropagation()} style={{ fontSize: 13, fontWeight: 600, color: 'white', textDecoration: 'none' }}>
                            {opponentName || 'Unknown'}
                          </Link>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{opponentName || 'Unknown'}</span>
                        )}
                        {oppRank && (
                          <span style={{ fontSize: 11, color: '#475569' }}>#{oppRank}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>{m.score || '–'}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 32 }}>
            <button
              onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
              disabled={currentPage === 1}
              style={pageBtnStyle(false, currentPage === 1)}
            >
              ← Prev
            </button>

            {/* Page number buttons — show up to 7 around current */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e${i}`} style={{ color: '#374151', padding: '0 4px' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => { setCurrentPage(p as number); window.scrollTo(0, 0) }}
                    style={pageBtnStyle(currentPage === p)}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0) }}
              disabled={currentPage === totalPages}
              style={pageBtnStyle(false, currentPage === totalPages)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
