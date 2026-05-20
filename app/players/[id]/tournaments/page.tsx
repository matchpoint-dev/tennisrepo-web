'use client'
import NavBar from '../../../NavBar';

import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { supabase } from '../../../lib/supabase'
import PlayerTabNav from '../PlayerTabNav'
import { getFlagUrl } from '../../../lib/countryUtils'

const inter = Inter({ subsets: ['latin'] })

const ROUND_ORDER = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128', 'RR', 'BR']
const ROUND_LABELS: Record<string, string> = {
  F: 'Winner', SF: 'Semifinal', QF: 'Quarterfinal',
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


interface TournamentEntry {
  key: string
  tid: number
  tournament: any
  bestRound: string
  won: boolean
  wonBronze: boolean
  matchCount: number
}

export default function TournamentsPage() {
  const params = useParams()
  const id = params.id as string
  const searchParams = useSearchParams()

  const [player, setPlayer] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state from URL
  const [levelFilter, setLevelFilter] = useState(searchParams.get('level') || 'All')
  const [resultFilter, setResultFilter] = useState(searchParams.get('result') || 'All')
  const [surfaceFilter, setSurfaceFilter] = useState(searchParams.get('surface') || 'All')
  const [yearFilter, setYearFilter] = useState(searchParams.get('year') || 'All')

  useEffect(() => {
    async function fetchAllMatches(playerId: string) {
      const CHUNK = 1000
      let all: any[] = []
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('matches')
          .select('*, tournaments(id, name, surface, level, year, start_date)')
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

    async function fetchData() {
      const [{ data: playerData }, matchData] = await Promise.all([
        supabase.from('players').select('*').eq('id', id).single(),
        fetchAllMatches(id),
      ])
      setPlayer(playerData)
      setMatches(matchData)
      setLoading(false)
    }
    fetchData()
  }, [id])

  const years = useMemo(() =>
    [...new Set(matches.map(m => m.tournaments?.year).filter(Boolean))].sort((a, b) => b - a),
    [matches]
  )

  // Build tournament entries grouped by (name, year)
  const allEntries = useMemo<TournamentEntry[]>(() => {
    const grouped = new Map<string, { tid: number; tournament: any; rounds: string[]; wins: Set<string> }>()

    for (const m of matches) {
      const key = `${m.tournaments?.name}|${m.tournaments?.year}`
      if (!grouped.has(key)) {
        grouped.set(key, { tid: m.tournament_id, tournament: m.tournaments, rounds: [], wins: new Set() })
      }
      const g = grouped.get(key)!
      if (m.round) g.rounds.push(m.round)
      if (m.winner_id === parseInt(id)) g.wins.add(m.round)
    }

    return Array.from(grouped.entries()).map(([key, { tid, tournament, rounds, wins }]) => {
      // Best round = the one closest to F in ROUND_ORDER
      const bestRound = rounds.reduce((best, round) => {
        const bi = ROUND_ORDER.indexOf(best)
        const ri = ROUND_ORDER.indexOf(round)
        return ri !== -1 && (bi === -1 || ri < bi) ? round : best
      }, '')

      const won = wins.has('F')
      const wonBronze = wins.has('BR')
      return { key, tid, tournament, bestRound, won, wonBronze, matchCount: rounds.length }
    }).sort((a, b) => {
      const da = a.tournament?.start_date || '0000'
      const db = b.tournament?.start_date || '0000'
      return db > da ? 1 : -1
    })
  }, [matches, id])

  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      if (levelFilter !== 'All') {
        const el = resolveLevel(entry.tournament?.level || '')
        if (el !== levelFilter) return false
      }
      if (resultFilter !== 'All') {
        if (resultFilter === 'Winner' && !entry.won) return false
        if (resultFilter === 'Final' && !(entry.bestRound === 'F' && !entry.won)) return false
        if (resultFilter === 'SF' && entry.bestRound !== 'SF') return false
        if (resultFilter === 'QF' && entry.bestRound !== 'QF') return false
        if (resultFilter === 'R16' && entry.bestRound !== 'R16') return false
        if (resultFilter === 'R32' && entry.bestRound !== 'R32') return false
        if (resultFilter === 'R64' && entry.bestRound !== 'R64') return false
        if (resultFilter === 'R128' && entry.bestRound !== 'R128') return false
        if (resultFilter === 'RR' && entry.bestRound !== 'RR') return false
      }
      if (surfaceFilter !== 'All' && entry.tournament?.surface !== surfaceFilter) return false
      if (yearFilter !== 'All' && String(entry.tournament?.year) !== yearFilter) return false
      return true
    })
  }, [allEntries, levelFilter, resultFilter, surfaceFilter, yearFilter])

  const flagUrl = getFlagUrl(player?.country_code)

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, color: '#94a3b8' }}>Loading tournaments...</div>
      </main>
    )
  }

  if (!player) return <div style={{ color: 'white', padding: 40 }}>Player not found</div>

  const selectStyle = {
    padding: '7px 12px', fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: '1px solid #1e3a5f',
    backgroundColor: '#0a1628', color: 'white', cursor: 'pointer',
  }

  const isOlympics = (entry: TournamentEntry) =>
    entry.tournament?.level === 'Olympics' || entry.tournament?.level === 'O'

  const resultsLabel = (entry: TournamentEntry) => {
    if (!entry.bestRound) return '–'
    if (isOlympics(entry)) {
      if (entry.won) return 'Gold Medal'
      if (entry.bestRound === 'F') return 'Silver Medal'
      if (entry.wonBronze) return 'Bronze Medal'
      if (entry.bestRound === 'SF') return '4th Place'
    }
    if (entry.won) return 'Winner'
    if (entry.bestRound === 'F') return 'Final'
    return ROUND_LABELS[entry.bestRound] || entry.bestRound
  }

  const resultColor = (entry: TournamentEntry) => {
    if (isOlympics(entry)) {
      if (entry.won) return '#f0c619'          // Gold
      if (entry.bestRound === 'F') return '#cbd5e1'   // Silver
      if (entry.wonBronze) return '#c2784b'    // Bronze
      if (entry.bestRound === 'SF') return '#94a3b8'  // 4th place
    }
    if (entry.won) return '#f0c619'
    if (entry.bestRound === 'F') return '#a78bfa'
    if (entry.bestRound === 'SF') return '#60a5fa'
    if (entry.bestRound === 'QF') return '#34d399'
    return '#94a3b8'
  }

  return (
    <main className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white' }}>

      {/* Nav */}
      <NavBar />

      {/* Player Header */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '32px 24px 20px', borderBottom: '1px solid #1e3a5f' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
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
                {player.country_code} {player.hand ? `· ${player.hand === 'R' ? 'Right-handed' : player.hand === 'L' ? 'Left-handed' : player.hand}` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <PlayerTabNav id={id} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Filters */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>

            {/* Level */}
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

            {/* Result */}
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Result</div>
              <select value={resultFilter} onChange={e => setResultFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Results</option>
                <option value="Winner">Winner</option>
                <option value="Final">Final (Runner-up)</option>
                <option value="SF">Semifinal</option>
                <option value="QF">Quarterfinal</option>
                <option value="R16">Round of 16</option>
                <option value="R32">Round of 32</option>
                <option value="R64">Round of 64</option>
                <option value="R128">Round of 128</option>
                <option value="RR">Round Robin</option>
              </select>
            </div>

            {/* Surface */}
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

            {/* Year */}
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Year</div>
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={selectStyle}>
                <option value="All">All Years</option>
                {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              Showing <strong style={{ color: 'white' }}>{filteredEntries.length}</strong> tournaments
              {resultFilter === 'Winner' && <span style={{ color: '#f0c619' }}> · {filteredEntries.length} title{filteredEntries.length !== 1 ? 's' : ''}</span>}
            </span>
            {(levelFilter !== 'All' || resultFilter !== 'All' || surfaceFilter !== 'All' || yearFilter !== 'All') && (
              <button
                onClick={() => { setLevelFilter('All'); setResultFilter('All'); setSurfaceFilter('All'); setYearFilter('All') }}
                style={{ padding: '2px 10px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: '1px solid #374151', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Tournament list */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 140px', gap: 12, padding: '10px 16px', backgroundColor: '#0a1e38', borderBottom: '1px solid #1e3a5f' }}>
            {['Tournament', 'Year', 'Surface', 'Level', 'Result'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
            ))}
          </div>

          {filteredEntries.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 16 }}>
              No tournaments found for the selected filters.
            </div>
          )}

          {filteredEntries.map(entry => {
            const level = entry.tournament?.level || ''
            const resolvedLevel = resolveLevel(level)
            const levelColor = LEVEL_COLORS[level] || LEVEL_COLORS[resolvedLevel] || '#374151'
            const surfaceBg = SURFACE_COLORS[entry.tournament?.surface] || '#1e3a5f'

            return (
              <div
                key={entry.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 130px 100px 100px 140px',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid #152a47',
                  alignItems: 'center',
                  backgroundColor: entry.won ? '#0f1a0a' : 'transparent',
                }}
              >
                {/* Name */}
                <Link href={`/tournaments/${entry.tid}`} style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{entry.tournament?.name}</span>
                </Link>

                {/* Year */}
                <span style={{ fontSize: 14, color: '#94a3b8' }}>
                  {entry.tournament?.year}
                  {entry.tournament?.start_date && (
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>· {formatDate(entry.tournament.start_date)}</span>
                  )}
                </span>

                {/* Surface */}
                <span>
                  {entry.tournament?.surface && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: surfaceBg, color: 'white' }}>
                      {entry.tournament.surface}
                    </span>
                  )}
                </span>

                {/* Level */}
                <span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: levelColor, color: 'white' }}>
                    {LEVEL_LABELS[level] || LEVEL_LABELS[resolvedLevel] || resolvedLevel}
                  </span>
                </span>

                {/* Result */}
                <span style={{ fontSize: 13, fontWeight: 700, color: resultColor(entry) }}>
                  {resultsLabel(entry)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
