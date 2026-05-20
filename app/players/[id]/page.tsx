import NavBar from '../../NavBar';
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import PlayerTabNav from './PlayerTabNav'
import { getFlagUrl } from '../../lib/countryUtils'

const inter = Inter({ subsets: ['latin'] })

const ROUND_LABELS: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal',
  R16: 'R16', R32: 'R32', R64: 'R64', R128: 'R128', RR: 'RR',
}

// Exclude these from title counts — everything else counts
const EXCLUDED_TITLE_LEVELS = new Set(['D', 'DC', 'E', 'NG'])

async function getPlayer(id) {
  const { data } = await supabase.from('players').select('*').eq('id', id).single()
  return data
}

async function getPlayerStats(id) {
  const { data } = await supabase.from('player_stats').select('*').eq('player_id', id)
  return data || []
}

async function getRecentMatches(id) {
  const { data } = await supabase
    .from('matches')
    .select(`
      *,
      tournaments(name, surface, year, level),
      winner:players!matches_winner_id_fkey(id, full_name),
      loser:players!matches_loser_id_fkey(id, full_name)
    `)
    .or(`winner_id.eq.${id},loser_id.eq.${id}`)
    .order('match_date', { ascending: false })
    .limit(20)
  return data || []
}

async function getElo(id) {
  const { data: myRatings } = await supabase
    .from('elo_ratings')
    .select('*')
    .eq('player_id', id)

  if (!myRatings || myRatings.length === 0) return []

  // For each surface, count players with a higher rating to compute rank
  const withRanks = await Promise.all(
    myRatings.map(async (e) => {
      const { count } = await supabase
        .from('elo_ratings')
        .select('*', { count: 'exact', head: true })
        .eq('surface', e.surface)
        .gt('rating', e.rating)
      return { ...e, eloRank: (count ?? 0) + 1 }
    })
  )
  return withRanks
}

async function getRankings(id) {
  try {
    const pid = parseInt(id, 10)
    const [{ data: current, error: e1 }, { data: best, error: e2 }, { data: latestGlobal }] =
      await Promise.all([
        supabase.from('rankings').select('rank, ranking_date').eq('player_id', pid)
          .order('ranking_date', { ascending: false }).limit(1),
        supabase.from('rankings').select('rank, ranking_date').eq('player_id', pid)
          .order('rank', { ascending: true }).limit(1),
        // Most recent week in the entire rankings table
        supabase.from('rankings').select('ranking_date')
          .order('ranking_date', { ascending: false }).limit(1),
      ])
    if (e1) console.error('Rankings current error:', e1.message)
    if (e2) console.error('Rankings best error:', e2.message)

    const latestWeek = latestGlobal?.[0]?.ranking_date
    const playerLatest = current?.[0]?.ranking_date
    // Only show current ranking if the player appears in the most recent week
    const isCurrentlyRanked = latestWeek && playerLatest && playerLatest === latestWeek

    return {
      current: isCurrentlyRanked ? current![0] : null,
      best: best?.[0] ?? null,
    }
  } catch (err) {
    console.error('getRankings failed:', err)
    return { current: null, best: null }
  }
}

async function getTitles(id) {
  const { data } = await supabase
    .from('matches')
    .select('*, tournaments(name, surface, level, year)')
    .eq('winner_id', id)
    .eq('round', 'F')
  return data || []
}

export default async function PlayerPage({ params }) {
  const { id } = await params
  const player = await getPlayer(id)
  const [stats, matches, elo, titles, rankingData] = await Promise.all([
    getPlayerStats(id),
    getRecentMatches(id),
    getElo(id),
    getTitles(id),
    getRankings(id),
  ])

  if (!player) return <div style={{ color: 'white', padding: 40 }}>Player not found</div>

  // Deduplicate titles by (tournament name, year)
  const seenTitles = new Set<string>()
  const dedupedTitles = titles.filter(t => {
    const key = `${t.tournaments?.name}|${t.tournaments?.year}`
    if (seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  // Count all titles except team events and exhibitions
  const competitiveTitles = dedupedTitles.filter(t => {
    const level = t.tournaments?.level
    return level && !EXCLUDED_TITLE_LEVELS.has(level)
  })

  const ROUND_ORDER = ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128', 'RR', 'BR']
  const sortedMatches = [...matches].sort((a, b) => {
    const dateA = a.match_date || '0000'
    const dateB = b.match_date || '0000'
    if (dateB > dateA) return 1
    if (dateA > dateB) return -1
    if (a.tournaments?.name !== b.tournaments?.name) return 0
    const ri = ROUND_ORDER.indexOf(a.round)
    const rj = ROUND_ORDER.indexOf(b.round)
    return (ri === -1 ? 99 : ri) - (rj === -1 ? 99 : rj)
  })

  // Win/loss: use Overall row if it exists to avoid double-counting surface rows
  const overallRow = stats.find(s => s.surface === 'Overall')
  const overallStats = overallRow
    ? { wins: overallRow.wins, losses: overallRow.losses }
    : stats
        .filter(s => s.surface !== 'Overall')
        .reduce((acc, s) => ({ wins: acc.wins + s.wins, losses: acc.losses + s.losses }), { wins: 0, losses: 0 })

  const overallElo = elo.find(e => e.surface === 'Overall')
  const clayElo   = elo.find(e => e.surface === 'Clay')
  const hardElo   = elo.find(e => e.surface === 'Hard')
  const grassElo  = elo.find(e => e.surface === 'Grass')

  const grandSlams = competitiveTitles.filter(t => t.tournaments?.level === 'G').length
  const masters    = competitiveTitles.filter(t => t.tournaments?.level === 'M').length
  const atpFinals  = competitiveTitles.filter(t => t.tournaments?.level === 'F').length
  const atp500     = competitiveTitles.filter(t => t.tournaments?.level === '500').length
  const atp250     = competitiveTitles.filter(t =>
    t.tournaments?.level === '250' || t.tournaments?.level === 'A'
  ).length

  const titlesBySurface = {
    Clay:   competitiveTitles.filter(t => t.tournaments?.surface === 'Clay').length,
    Hard:   competitiveTitles.filter(t => t.tournaments?.surface === 'Hard').length,
    Grass:  competitiveTitles.filter(t => t.tournaments?.surface === 'Grass').length,
    Carpet: competitiveTitles.filter(t => t.tournaments?.surface === 'Carpet').length,
  }

  // ATP Finals: use level 'F' (now correctly set in DB)
  const atpFinalsCheck = competitiveTitles.filter(t => t.tournaments?.level === 'F').length

  const surfaces = ['Clay', 'Hard', 'Grass', 'Carpet']

  const surfaceColor = (surface) => ({
    Clay:   { border: '#8B4513', accent: '#c2521a' },
    Grass:  { border: '#2d5a1b', accent: '#22c55e' },
    Carpet: { border: '#4a1d96', accent: '#a855f7' },
    Hard:   { border: '#1e3a5f', accent: '#3b82f6' },
  }[surface] || { border: '#1e3a5f', accent: '#3b82f6' })

  const flagUrl = getFlagUrl(player.country_code)

  // Title-by-level cards: use result=Winner (the current filter param)
  const titleLevelCards = [
    { label: 'Grand Slams',  value: grandSlams, href: `/players/${id}/tournaments?level=G&result=Winner`,   color: '#f0c619' },
    { label: 'Masters 1000', value: masters,    href: `/players/${id}/tournaments?level=M&result=Winner`,   color: '#60a5fa' },
    { label: 'ATP Finals',   value: atpFinals,  href: `/players/${id}/tournaments?level=F&result=Winner`,   color: '#1e3a8a' },
    { label: 'ATP 500',      value: atp500,     href: `/players/${id}/tournaments?level=500&result=Winner`, color: '#4b5563' },
    { label: 'ATP 250',      value: atp250,     href: `/players/${id}/tournaments?level=250&result=Winner`, color: '#9ca3af' },
  ]

  return (
    <main className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: 'white' }}>

      {/* Nav */}
      <NavBar />

      {/* Player Header */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '40px 24px 24px', borderBottom: '1px solid #1e3a5f' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" fill="#4a6fa5"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#4a6fa5" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                {flagUrl && <img src={flagUrl} alt={player.country_code} style={{ height: 22, borderRadius: 2, verticalAlign: 'middle' }} />}
                {player.full_name}
              </h1>
              <div style={{ display: 'flex', gap: 24, color: '#94a3b8', fontSize: 14 }}>
                {player.country_code && <span>{player.country_code}</span>}
                {player.date_of_birth && <span>Born: {player.date_of_birth}</span>}
                {player.hand && <span>Hand: {player.hand === 'R' ? 'Right' : player.hand === 'L' ? 'Left' : player.hand}</span>}
                {player.height_cm && <span>Height: {player.height_cm} cm</span>}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', gap: 32 }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#f0c619' }}>
                  {rankingData.current ? `#${rankingData.current.rank}` : '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Current Ranking</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#f0c619' }}>
                  {rankingData.best ? `#${rankingData.best.rank}` : '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Best Ranking</div>
                {rankingData.best?.ranking_date && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {(() => {
                      const [y, m] = rankingData.best.ranking_date.split('-')
                      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                      return `${months[parseInt(m) - 1]} ${y}`
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <PlayerTabNav id={id} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32 }}>

        <div>
          {/* Career Record */}
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>Career Record</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            {/* Wins — not clickable */}
            <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: '1px solid #1e3a5f', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f0c619' }}>{overallStats.wins}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Total Wins</div>
            </div>
            {/* Losses — not clickable */}
            <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: '1px solid #1e3a5f', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f0c619' }}>{overallStats.losses}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Total Losses</div>
            </div>
            {/* Win Rate — not clickable */}
            <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: '1px solid #1e3a5f', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f0c619' }}>
                {overallStats.wins + overallStats.losses > 0
                  ? `${Math.round(overallStats.wins / (overallStats.wins + overallStats.losses) * 100)}%`
                  : 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Win Rate</div>
            </div>
            {/* Total Titles — clickable */}
            <Link href={`/players/${id}/tournaments?result=Winner`} style={{ textDecoration: 'none' }}>
              <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: '1px solid #1e3a5f', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#f0c619' }}>{competitiveTitles.length}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Total Titles</div>
              </div>
            </Link>
          </div>

          {/* Titles by Level */}
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>Titles by Level</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
            {titleLevelCards.map(s => (
              <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
                <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16, border: `1px solid ${s.color}`, textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{s.label}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Surface Stats */}
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>By Surface</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
            {surfaces.map(surface => {
              const s = stats.find(x => x.surface === surface)
              if (!s) return null
              const winRate = s.wins + s.losses > 0 ? Math.round(s.wins / (s.wins + s.losses) * 100) : 0
              const colors = surfaceColor(surface)
              return (
                <Link key={surface} href={`/players/${id}/matches?surface=${surface}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    backgroundColor: '#0d1f3c', borderRadius: 10, padding: 16,
                    border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.accent}`, cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{surface}</span>
                      <span style={{ fontSize: 14, color: colors.accent, fontWeight: 700 }}>{winRate}%</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>{s.wins}W - {s.losses}L</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{titlesBySurface[surface]} titles</div>
                    <div style={{ marginTop: 8, height: 4, backgroundColor: '#1e3a5f', borderRadius: 2 }}>
                      <div style={{ width: `${winRate}%`, height: '100%', backgroundColor: colors.accent, borderRadius: 2 }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Recent Matches */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>Recent Matches</h3>
            <Link href={`/players/${id}/matches`} style={{ fontSize: 12, fontWeight: 600, color: '#f0c619', textDecoration: 'none', border: '1px solid #f0c61940', borderRadius: 6, padding: '4px 12px', backgroundColor: '#1a1200' }}>
              All Matches →
            </Link>
          </div>
          <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', overflow: 'hidden' }}>
            {sortedMatches.map(m => {
              const won = m.winner_id === parseInt(id)
              const opponent     = won ? m.loser  : m.winner
              const opponentId   = opponent?.id
              const opponentName = opponent?.full_name
              const opponentRank = won ? m.loser_rank  : m.winner_rank
              const opponentSeed = won ? m.loser_seed  : m.winner_seed
              const opponentEntry = won ? m.loser_entry : m.winner_entry
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e3a5f', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: won ? '#1a3a1a' : '#3a1a1a', color: won ? '#4ade80' : '#f87171' }}>
                    {won ? 'W' : 'L'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#94a3b8' }}>vs</span>
                      {opponentId ? (
                        <Link href={`/players/${opponentId}`} style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                          {opponentName || 'Unknown'}
                        </Link>
                      ) : (
                        <span>{opponentName || 'Unknown'}</span>
                      )}
                      {opponentSeed && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>[{opponentSeed}]</span>
                      )}
                      {opponentEntry && !opponentSeed && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>({opponentEntry})</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {opponentRank && <span style={{ color: '#94a3b8' }}>#{opponentRank}</span>}
                      {opponentRank && <span>·</span>}
                      <Link href={`/tournaments/${m.tournament_id}`} style={{ color: '#64748b', textDecoration: 'underline' }}>
                        {m.tournaments?.name}
                      </Link>
                      <span>·</span>
                      <span>{ROUND_LABELS[m.round] || m.round}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>{m.score}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{m.match_date}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: ELO Rank by Surface */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#f0c619', textTransform: 'uppercase', letterSpacing: 1 }}>ELO Rank by Surface</h3>
          <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', overflow: 'hidden' }}>
            {[
              { label: 'Overall', elo: overallElo },
              { label: 'Hard',    elo: hardElo },
              { label: 'Clay',    elo: clayElo },
              { label: 'Grass',   elo: grassElo },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #1e3a5f' }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>{item.label}</span>
                {item.elo ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#f0c619' }}>#{item.elo.eloRank}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{Math.round(item.elo.rating)} pts</div>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, color: '#374151' }}>N/A</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
