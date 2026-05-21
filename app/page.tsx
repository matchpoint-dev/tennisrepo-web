import NavBar from './NavBar';
import { supabase } from './lib/supabase'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import RankingCard from './RankingCard'
import SearchBar from './SearchBar'
import { getFlagUrl } from './lib/countryUtils'
import { CALENDAR } from './lib/calendarData'
import type { TournamentEntry } from './lib/calendarData'

const inter = Inter({ subsets: ['latin'] })

const LEVEL_LABELS: Record<string, string> = {
  G: 'Grand Slam', M: 'Masters 1000', F: 'ATP Finals',
  '500': 'ATP 500', '250': 'ATP 250', A: 'ATP 250',
  D: 'Team Event', DC: 'Davis Cup', E: 'Exhibition', NG: 'Exhibition',
  Olympics: 'Olympics', O: 'Olympics', C: 'Challenger',
}

const LEVEL_COLORS: Record<string, string> = {
  G: '#f0c619', M: '#60a5fa', F: '#1e3a8a',
  '500': '#4b5563', '250': '#9ca3af', A: '#9ca3af',
  D: '#7c3aed', DC: '#7c3aed', E: '#06b6d4', NG: '#06b6d4',
  Olympics: '#0284c7', O: '#0284c7', C: '#64748b',
}

// ─── Calendar widget helpers ───────────────────────────────────────────────────
const CAL_LEVEL: Record<string, { label: string; color: string }> = {
  'Grand Slam':       { label: 'Grand Slam',   color: '#f0c619' },
  'ATP Masters 1000': { label: 'Masters 1000', color: '#60a5fa' },
  'ATP 500':          { label: 'ATP 500',       color: '#4b5563' },
  'ATP 250':          { label: 'ATP 250',       color: '#94a3b8' },
  'Team Event':       { label: 'Team Event',    color: '#f97316' },
  'Year-End Finals':  { label: 'ATP Finals',    color: '#a855f7' },
}

const CAL_SURFACE: Record<string, { label: string; color: string; bg: string }> = {
  'Hard (outdoor)': { label: 'Hard',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  'Hard (indoor)':  { label: 'Hard (i)', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)'  },
  'Clay':           { label: 'Clay',     color: '#c2521a', bg: 'rgba(194,82,26,0.12)'   },
  'Grass':          { label: 'Grass',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
}

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseTournamentDates(dates: string): { start: Date; end: Date } {
  const YEAR = 2026
  const [startRaw, endRaw] = dates.split('\u2013') // en-dash
  const startTokens = startRaw.trim().split(' ')
  const startMonth = MONTH_MAP[startTokens[0]]
  const startDay = parseInt(startTokens[1])

  const endTokens = endRaw.trim().split(' ')
  let endMonth: number, endDay: number
  if (endTokens.length === 2) {
    endMonth = MONTH_MAP[endTokens[0]]
    endDay = parseInt(endTokens[1])
  } else {
    endMonth = startMonth
    endDay = parseInt(endTokens[0])
  }

  return {
    start: new Date(YEAR, startMonth, startDay),
    end:   new Date(endMonth < startMonth ? YEAR + 1 : YEAR, endMonth, endDay),
  }
}

interface ActiveTournament extends TournamentEntry {
  status: 'live' | 'upcoming'
  start: Date
  end: Date
}

function getActiveAndUpcoming(): ActiveTournament[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const live: ActiveTournament[] = []
  const upcoming: ActiveTournament[] = []

  for (const section of CALENDAR) {
    for (const t of section.tournaments) {
      const { start, end } = parseTournamentDates(t.dates)
      if (start <= today && today <= end) {
        live.push({ ...t, status: 'live', start, end })
      } else if (start > today) {
        upcoming.push({ ...t, status: 'upcoming', start, end })
      }
    }
  }

  upcoming.sort((a, b) => a.start.getTime() - b.start.getTime())

  // Show all live + upcoming within 21 days; if none in 21 days, show next wave
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() + 21)
  const soon = upcoming.filter(t => t.start <= cutoff)
  const upcomingToShow = soon.length > 0
    ? soon
    : upcoming.slice(0, upcoming.findIndex((t, i, arr) => i > 0 && t.start > arr[0].start) + 1 || 4)

  return [...live, ...upcomingToShow]
}

async function getLatestRankingDate(): Promise<string | null> {
  const { data } = await supabase
    .from('rankings')
    .select('ranking_date')
    .order('ranking_date', { ascending: false })
    .limit(1)
    .single()
  return data?.ranking_date ?? null
}

async function getATPRankings() {
  const rankingDate = await getLatestRankingDate()
  if (!rankingDate) return []

  const { data: rankRows } = await supabase
    .from('rankings')
    .select('rank, points, player_id')
    .eq('ranking_date', rankingDate)
    .order('rank', { ascending: true })
    .limit(10)

  if (!rankRows?.length) return []

  const ids = rankRows.map((r: any) => r.player_id)
  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, country_code')
    .in('id', ids)

  const playerMap: Record<number, any> = {}
  ;(players || []).forEach((p: any) => { playerMap[p.id] = p })

  return rankRows.map((r: any) => ({
    rank: r.rank,
    playerId: r.player_id,
    name: playerMap[r.player_id]?.full_name ?? 'Unknown',
    country: playerMap[r.player_id]?.country_code ?? '',
    points: r.points ?? 0,
  }))
}

async function getELORankings() {
  // Fetch active player IDs (all players in current ATP rankings week)
  // This excludes retired players who no longer appear in the rankings
  const rankingDate = await getLatestRankingDate()
  if (!rankingDate) return []

  const { data: activeRanks } = await supabase
    .from('rankings')
    .select('player_id')
    .eq('ranking_date', rankingDate)
    .limit(1500)

  const activeIds = (activeRanks || []).map((r: any) => r.player_id)
  if (!activeIds.length) return []

  const { data: eloRows } = await supabase
    .from('elo_ratings')
    .select('player_id, rating')
    .eq('surface', 'Overall')
    .in('player_id', activeIds)
    .order('rating', { ascending: false })
    .limit(10)

  if (!eloRows?.length) return []

  const ids = eloRows.map((r: any) => r.player_id)
  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, country_code')
    .in('id', ids)

  const playerMap: Record<number, any> = {}
  ;(players || []).forEach((p: any) => { playerMap[p.id] = p })

  return eloRows.map((r: any, i: number) => ({
    rank: i + 1,
    playerId: r.player_id,
    name: playerMap[r.player_id]?.full_name ?? 'Unknown',
    country: playerMap[r.player_id]?.country_code ?? '',
    rating: Math.round(r.rating),
  }))
}

async function getTournaments() {
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .gte('year', 2024)
    .not('name', 'ilike', '%Davis Cup%')
    .order('start_date', { ascending: false })
    .limit(8)
  if (!data || data.length === 0) return []

  // Fetch the Final match winner for each tournament
  const ids = data.map((t: any) => t.id)
  const { data: finals } = await supabase
    .from('matches')
    .select('tournament_id, winner:players!matches_winner_id_fkey(id, full_name, country_code)')
    .in('tournament_id', ids)
    .eq('round', 'F')

  const winnerMap: Record<number, any> = {}
  ;(finals || []).forEach((m: any) => {
    if (m.winner) winnerMap[m.tournament_id] = m.winner
  })

  return data.map((t: any) => ({ ...t, winner: winnerMap[t.id] ?? null }))
}


export default async function Home() {
  const [atpRankings, eloRankings, tournaments] = await Promise.all([
    getATPRankings(),
    getELORankings(),
    getTournaments(),
  ])

  return (
    <main className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white' }}>

      {/* Top Nav */}
      <NavBar />

      {/* Hero */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '48px 24px', textAlign: 'center', borderBottom: '1px solid #1e3a5f' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>ATP Tennis Statistics</h2>
        <p style={{ color: '#94a3b8', marginBottom: 28, fontSize: 16 }}>
          Historical match data · ELO ratings · Head to head records
        </p>
        <SearchBar />
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>

        {/* Left — Recent Tournaments */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>Recent Tournaments</h3>
            <Link href="/tournaments" style={{
              fontSize: 12, fontWeight: 600, color: '#f0c619',
              textDecoration: 'none', border: '1px solid #f0c61940',
              borderRadius: 6, padding: '4px 12px',
              backgroundColor: '#1a1200',
            }}>
              All Tournaments →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {tournaments.map((t: any) => {
              const surfaceBg = t.surface === 'Clay' ? '#8B4513' : t.surface === 'Grass' ? '#2d5a1b' : '#1e3a5f'
              const level = t.level as string
              const levelLabel = LEVEL_LABELS[level] ?? level ?? ''
              const levelColor = LEVEL_COLORS[level] ?? '#475569'
              return (
                <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: '1px solid #1e3a5f', cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#e2e8f0' }}>{t.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Level badge */}
                      {levelLabel && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          backgroundColor: levelColor + '33',
                          color: levelColor === '#b8860b' ? '#f0c619' : levelColor,
                          border: `1px solid ${levelColor}55`,
                          textTransform: 'uppercase', letterSpacing: 0.4,
                        }}>
                          {levelLabel}
                        </span>
                      )}
                      {/* Surface badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        backgroundColor: surfaceBg,
                        color: 'white', textTransform: 'uppercase', letterSpacing: 0.5
                      }}>
                        {t.surface || 'Hard'}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{t.year}</span>
                    </div>
                    {t.winner && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e3a5f' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>W</span>
                        {getFlagUrl(t.winner.country_code) && (
                          <img src={getFlagUrl(t.winner.country_code)!} alt={t.winner.country_code} style={{ width: 16, height: 12, borderRadius: 1, flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#f0c619', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.winner.full_name}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Current & Upcoming Tournaments */}
          {(() => {
            const active = getActiveAndUpcoming()
            if (!active.length) return null
            return (
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Current &amp; Upcoming
                  </h3>
                  <Link href="/calendar" style={{
                    fontSize: 12, fontWeight: 600, color: '#60a5fa',
                    textDecoration: 'none', border: '1px solid #60a5fa40',
                    borderRadius: 6, padding: '4px 12px',
                    backgroundColor: '#001a33',
                  }}>
                    Full Calendar →
                  </Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {active.map((t) => {
                    const lvl = CAL_LEVEL[t.level] ?? { label: t.level, color: '#94a3b8' }
                    const srf = CAL_SURFACE[t.surface] ?? { label: t.surface, color: '#94a3b8', bg: 'transparent' }
                    const isLive = t.status === 'live'
                    return (
                      <div key={t.name + t.dates} style={{
                        backgroundColor: '#0d1f3c',
                        borderRadius: 10,
                        padding: 16,
                        border: isLive ? '1px solid #22c55e30' : '1px solid #1e3a5f',
                        boxSizing: 'border-box',
                      }}>
                        {/* Status row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          {isLive ? (
                            <span style={{
                              fontSize: 10, fontWeight: 800, color: '#22c55e',
                              backgroundColor: '#22c55e18', border: '1px solid #22c55e40',
                              borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.6,
                            }}>
                              ● Now
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              {t.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: '#475569' }}>{t.dates}</span>
                        </div>
                        {/* Name */}
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{t.name}</div>
                        {/* Location */}
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{t.location}</div>
                        {/* Badges */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            backgroundColor: lvl.color + '20', color: lvl.color,
                            border: '1px solid ' + lvl.color + '40',
                            textTransform: 'uppercase', letterSpacing: 0.4,
                          }}>{lvl.label}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            backgroundColor: srf.bg, color: srf.color,
                            border: '1px solid ' + srf.color + '40',
                            textTransform: 'uppercase', letterSpacing: 0.4,
                          }}>{srf.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

        </div>

        {/* Right sidebar — ATP Rankings + ELO Rankings */}
        <div>
          <RankingCard
            title="ATP Rankings"
            href="/rankings"
            rows={atpRankings}
            valueKey="points"
            accentColor="#f0c619"
          />
          <RankingCard
            title="ELO Rankings"
            href="/rankings"
            rows={eloRankings}
            valueKey="rating"
            accentColor="#60a5fa"
            showViewAll={false}
          />
        </div>

      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e3a5f', marginTop: 'auto', padding: '24px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
        <p style={{ margin: 0 }}>
          Data sourced from{' '}
          <a href="https://github.com/JeffSackmann/tennis_atp" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', textDecoration: 'none', borderBottom: '1px solid #334155' }}>
            Jeff Sackmann&apos;s tennis_atp
          </a>{' '}
          and{' '}
          <a href="https://www.ultimatetennisstatistics.com" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', textDecoration: 'none', borderBottom: '1px solid #334155' }}>
            Mileta Čeković&apos;s Ultimate Tennis Statistics
          </a>.
          {' '}Built for educational and statistical purposes only.
        </p>
      </footer>
    </main>
  )
}
