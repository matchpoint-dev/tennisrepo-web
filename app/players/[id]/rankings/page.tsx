'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Inter } from 'next/font/google';
import { supabase } from '../../../lib/supabase';
import PlayerTabNav from '../PlayerTabNav';
import NavBar from '../../../NavBar';

const inter = Inter({ subsets: ['latin'] });

// ── Chart geometry ────────────────────────────────────────────────────────────

const PAD  = { top: 28, right: 24, bottom: 52, left: 52 };
const VW   = 1140;
const VH   = 380;
const IW   = VW - PAD.left - PAD.right;   // inner width
const IH   = VH - PAD.top  - PAD.bottom;  // inner height

/** Logarithmic Y mapping: rank 1 → VPAD (near top), maxRank → IH−VPAD (near bottom).
 *  The vertical padding prevents rank #1 from butting flush against the clip boundary. */
const VPAD = 12; // px of breathing room at top and bottom of inner chart
function logY(rank: number, maxRank: number): number {
  const lo = 0;
  const hi = Math.log(Math.max(maxRank, 2));
  return VPAD + (Math.log(Math.max(rank, 1)) - lo) / (hi - lo) * (IH - VPAD * 2);
}

/** Smooth cubic-bezier path through a series of [x,y] points. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const mx = ((px + cx) / 2).toFixed(1);
    d += ` C${mx},${py.toFixed(1)} ${mx},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  return d;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtShortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

// ── Rank badge colours ────────────────────────────────────────────────────────

function rankColor(rank: number): string {
  if (rank === 1)  return '#f0c619';
  if (rank <= 3)   return '#e2b84a';
  if (rank <= 10)  return '#60a5fa';
  if (rank <= 50)  return '#94a3b8';
  return '#475569';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RankingHistoryPage() {
  const { id } = useParams() as { id: string };

  const [rawRankings, setRawRankings] = useState<any[]>([]);
  const [player,      setPlayer]      = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [hoverIdx,    setHoverIdx]    = useState<number | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: rk }] = await Promise.all([
        supabase.from('players').select('id, full_name, country_code').eq('id', id).single(),
        supabase.from('rankings')
          .select('rank, ranking_date, points')
          .eq('player_id', id)
          .order('ranking_date', { ascending: true }),
      ]);
      setPlayer(p);
      setRawRankings(rk ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const data = useMemo(() => {
    if (!rawRankings.length) return null;

    const currentYear = new Date().getFullYear();

    // De-duplicate: keep the best (lowest) rank per date
    const byDate = new Map<string, any>();
    for (const r of rawRankings) {
      const ex = byDate.get(r.ranking_date);
      if (!ex || r.rank < ex.rank) byDate.set(r.ranking_date, r);
    }
    const pts = Array.from(byDate.values()).sort((a, b) =>
      a.ranking_date.localeCompare(b.ranking_date));

    // Career stats — count weeks by spanning intervals to handle data gaps.
    // If a player is ranked #1 on week W and the next entry is 3 weeks later,
    // those 3 weeks all count (the rank persists until the next update).
    function countWeeksAtRankN(n: number): number {
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i].rank <= n) {
          const d1 = new Date(pts[i].ranking_date).getTime();
          const d2 = new Date(pts[i + 1].ranking_date).getTime();
          total += Math.max(1, Math.round((d2 - d1) / (7 * 24 * 3600 * 1000)));
        }
      }
      if (pts[pts.length - 1].rank <= n) total += 1;
      return total;
    }

    const careerHigh  = pts.reduce((b, r) => r.rank < b.rank ? r : b, pts[0]);
    const maxRank     = pts.reduce((m, r) => Math.max(m, r.rank), 1);
    const chartMax    = Math.min(maxRank, 1200);

    const weeksNo1    = countWeeksAtRankN(1);
    const weeksTop5   = countWeeksAtRankN(5);
    const weeksTop10  = countWeeksAtRankN(10);
    const weeksTop50  = countWeeksAtRankN(50);
    const weeksTop100 = countWeeksAtRankN(100);

    // Year-end rankings (last entry per calendar year).
    // Current year is shown in the grid but excluded from the YE#1 count —
    // the year hasn't ended yet so it's not a confirmed year-end finish.
    const yearEndMap = new Map<number, any>();
    for (const r of pts) {
      const yr = Number(r.ranking_date.slice(0, 4));
      yearEndMap.set(yr, r);
    }
    const yearEnds = Array.from(yearEndMap.entries())
      .map(([year, r]) => ({ year, rank: r.rank, points: r.points, isCurrent: year === currentYear }))
      .sort((a, b) => a.year - b.year);

    const yearNo1Finishes = yearEnds.filter(ye => ye.rank === 1 && !ye.isCurrent).length;
    const peakPoints = pts.reduce((m, r) => Math.max(m, r.points ?? 0), 0);

    // ── Chart coordinates ──────────────────────────────────────────────────────

    const dates   = pts.map(r => new Date(r.ranking_date + 'T00:00:00').getTime());
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const span    = maxDate - minDate || 1;

    const xOf = (ts: number) => ((ts - minDate) / span) * IW;
    const yOf = (rank: number) => logY(Math.min(rank, chartMax), chartMax);

    const chartPts: [number, number][] = pts.map((r, i) => [xOf(dates[i]), yOf(r.rank)]);
    const linePath  = smoothPath(chartPts);
    const areaPath  = linePath
      + ` L${chartPts[chartPts.length - 1][0].toFixed(1)},${IH}`
      + ` L${chartPts[0][0].toFixed(1)},${IH} Z`;

    // Y-axis reference levels
    const allTicks  = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
    const yTicks    = allTicks.filter(r => r <= chartMax * 1.05);

    // X-axis year ticks
    const startYr = Number(pts[0].ranking_date.slice(0, 4));
    const endYr   = Number(pts[pts.length - 1].ranking_date.slice(0, 4));
    const totalYrs = endYr - startYr + 1;
    const step     = totalYrs <= 15 ? 1 : totalYrs <= 30 ? 2 : 5;
    const xYears   = Array.from({ length: endYr - startYr + 1 }, (_, i) => startYr + i)
      .filter(yr => (yr - startYr) % step === 0);

    return {
      pts, chartPts, linePath, areaPath,
      careerHigh, maxRank, chartMax, weeksNo1, weeksTop5, weeksTop10, weeksTop50,
      weeksTop100, yearEnds, yearNo1Finishes, peakPoints,
      yTicks, xYears, xOf, yOf, dates, minDate, maxDate,
    };
  }, [rawRankings]);

  // ── Mouse tracking ────────────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !data) return;
    const rect  = svgRef.current.getBoundingClientRect();
    const rawX  = (e.clientX - rect.left) / rect.width * VW - PAD.left;
    let best = 0, bestDist = Infinity;
    data.chartPts.forEach(([px], i) => {
      const d = Math.abs(px - rawX);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHoverIdx(best);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function StatCard({ label, value, sub, accent = false }: {
    label: string; value: string | number; sub?: string; accent?: boolean;
  }) {
    return (
      <div style={{
        backgroundColor: '#0d1f3c', border: `1px solid ${accent ? '#f0c61940' : '#1e3a5f'}`,
        borderRadius: 10, padding: '16px 20px', flex: '1 1 140px', minWidth: 130,
        background: accent
          ? 'linear-gradient(135deg, #0d1f3c 60%, #1a2800 100%)'
          : '#0d1f3c',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.55rem', fontWeight: 800, color: accent ? '#f0c619' : '#e2e8f0', lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 6 }}>{sub}</div>
        )}
      </div>
    );
  }

  // ── Loading / empty ────────────────────────────────────────────────────────────

  if (loading) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      {player && <PlayerTabNav id={id} />}
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>Loading ranking history…</div>
    </div>
  );

  if (!data || !player) return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628' }}>
      <NavBar />
      <PlayerTabNav id={id} />
      <div style={{ textAlign: 'center', padding: '6rem', color: '#64748b' }}>No ranking data found for this player.</div>
    </div>
  );

  const {
    pts, chartPts, linePath, areaPath, careerHigh, chartMax, weeksNo1, weeksTop5,
    weeksTop10, weeksTop50, weeksTop100, yearEnds, yearNo1Finishes, peakPoints,
    yTicks, xYears, xOf, yOf, dates, minDate, maxDate,
  } = data;

  const hovered   = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoveredPt = hoverIdx !== null ? chartPts[hoverIdx] : null;

  // Gradient stop positions based on rank thresholds
  const g5   = (yOf(5)   / IH * 100).toFixed(1);
  const g10  = (yOf(10)  / IH * 100).toFixed(1);
  const g50  = (yOf(50)  / IH * 100).toFixed(1);
  const g100 = (yOf(100) / IH * 100).toFixed(1);

  return (
    <div className={inter.className} style={{ minHeight: '100vh', backgroundColor: '#0a1628', color: '#e2e8f0' }}>
      <NavBar />

      {/* Player header */}
      <div style={{ backgroundColor: '#0d1f3c', padding: '20px 24px 0' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Link href={`/players/${id}`} style={{ textDecoration: 'none' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', margin: 0, marginBottom: 12 }}>
              {player.full_name}
            </h1>
          </Link>
        </div>
      </div>

      <PlayerTabNav id={id} />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#f0c619', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.2rem' }}>
          Ranking History
        </h2>

        {/* ── Stat cards ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          <StatCard
            label="Career High"
            value={`#${careerHigh.rank}`}
            sub={fmtDate(careerHigh.ranking_date)}
            accent={careerHigh.rank === 1}
          />
          {weeksNo1 > 0 && <StatCard label="Weeks at No. 1" value={weeksNo1} />}
          {weeksTop5 > 0 && <StatCard label="Weeks in Top 5" value={weeksTop5} />}
          <StatCard label="Weeks in Top 10" value={weeksTop10} />
          <StatCard label="Weeks in Top 50" value={weeksTop50} />
          {yearNo1Finishes > 0 && (
            <StatCard label="Year-End No. 1" value={yearNo1Finishes} sub={yearEnds.filter(y => y.rank === 1).map(y => y.year).join(', ')} />
          )}
          {peakPoints > 0 && (
            <StatCard label="Peak Points" value={peakPoints.toLocaleString()} />
          )}
        </div>

        {/* ── Chart ───────────────────────────────────────────────────────────── */}
        <div style={{
          backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f',
          borderRadius: 12, padding: '16px 0 0', marginBottom: 36, overflow: 'hidden',
        }}>
          {/* Chart title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 20px 12px' }}>
            <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ATP Ranking over time
            </span>
            <span style={{ fontSize: '0.7rem', color: '#334155' }}>
              {pts.length.toLocaleString()} data points · {new Date(minDate).getFullYear()}–{new Date(maxDate).getFullYear()}
            </span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${VW} ${VH}`}
            style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              {/* Vertical gradient for the line: gold → blue → dark blue */}
              <linearGradient id="rh-lineGrad" x1="0" y1="0" x2="0" y2={IH}
                gradientUnits="userSpaceOnUse" gradientTransform={`translate(0,${PAD.top})`}>
                <stop offset="0%"       stopColor="#f0c619" />
                <stop offset={`${g5}%`}  stopColor="#fbbf24" />
                <stop offset={`${g10}%`} stopColor="#60a5fa" />
                <stop offset={`${g50}%`} stopColor="#3b82f6" />
                <stop offset="100%"     stopColor="#1e3a8a" />
              </linearGradient>

              {/* Area fill gradient */}
              <linearGradient id="rh-areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
              </linearGradient>

              {/* Clip to inner chart area — coordinates are LOCAL to the translated group,
                  so (0,0) = top-left of the inner chart, not global SVG origin. */}
              <clipPath id="rh-clip">
                <rect x={0} y={0} width={IW} height={IH} />
              </clipPath>

              {/* Glow filter for career high dot */}
              <filter id="rh-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <g transform={`translate(${PAD.left},${PAD.top})`}>

              {/* ── Zone backgrounds ── */}
              {yTicks.map((r, i) => {
                const y1 = yOf(r);
                const y2 = i < yTicks.length - 1 ? yOf(yTicks[i + 1]) : IH;
                const fills: Record<number, string> = {
                  1:   'rgba(240,198,25,0.07)',
                  5:   'rgba(240,198,25,0.04)',
                  10:  'rgba(59,130,246,0.05)',
                  25:  'rgba(59,130,246,0.03)',
                  50:  'rgba(59,130,246,0.015)',
                  100: 'rgba(100,116,139,0.01)',
                  200: 'transparent',
                  500: 'transparent',
                  1000:'transparent',
                };
                return <rect key={r} x={0} y={y1} width={IW} height={Math.max(0, y2 - y1)} fill={fills[r] ?? 'transparent'} />;
              })}

              {/* ── Horizontal grid lines + Y labels ── */}
              {yTicks.map(r => {
                const y = yOf(r);
                const isOne = r === 1;
                return (
                  <g key={r}>
                    <line
                      x1={0} y1={y} x2={IW} y2={y}
                      stroke={isOne ? '#f0c619' : '#1e3a5f'}
                      strokeWidth={isOne ? 1 : 0.5}
                      strokeDasharray={isOne ? '5 4' : undefined}
                      opacity={isOne ? 0.45 : 0.7}
                    />
                    <text
                      x={-7} y={y + 4}
                      textAnchor="end"
                      fill={isOne ? '#f0c619' : r <= 10 ? '#60a5fa' : '#475569'}
                      fontSize={isOne ? 11 : 10}
                      fontWeight={isOne ? 700 : 400}
                    >
                      {isOne ? '#1' : r}
                    </text>
                  </g>
                );
              })}

              {/* ── X-axis year markers ── */}
              {xYears.map(yr => {
                const ts = new Date(`${yr}-01-01T00:00:00`).getTime();
                if (ts < minDate - 86400000 * 180 || ts > maxDate + 86400000 * 180) return null;
                const x = xOf(ts);
                if (x < 0 || x > IW) return null;
                return (
                  <g key={yr}>
                    <line x1={x} y1={0} x2={x} y2={IH} stroke="#1e3a5f" strokeWidth={0.5} opacity={0.45} />
                    <text x={x} y={IH + 20} textAnchor="middle" fill="#475569" fontSize={11}>{yr}</text>
                  </g>
                );
              })}

              {/* ── Area fill ── */}
              <path d={areaPath} fill="url(#rh-areaGrad)" clipPath="url(#rh-clip)" />

              {/* ── Rank line ── */}
              <path
                d={linePath}
                fill="none"
                stroke="url(#rh-lineGrad)"
                strokeWidth={2}
                clipPath="url(#rh-clip)"
                strokeLinejoin="round"
              />

              {/* ── Career high marker ── */}
              {(() => {
                const hiIdx = pts.findIndex(r => r.ranking_date === careerHigh.ranking_date);
                if (hiIdx < 0) return null;
                const [x, y] = chartPts[hiIdx];
                const labelRight = x < IW * 0.8;
                return (
                  <g filter="url(#rh-glow)">
                    <circle cx={x} cy={y} r={6} fill="#f0c619" stroke="#0a1628" strokeWidth={2.5} />
                    <text
                      x={labelRight ? x + 10 : x - 10}
                      y={y - 10}
                      textAnchor={labelRight ? 'start' : 'end'}
                      fill="#f0c619"
                      fontSize={11}
                      fontWeight={700}
                    >
                      #{careerHigh.rank} · {fmtShortDate(careerHigh.ranking_date)}
                    </text>
                  </g>
                );
              })()}

              {/* ── Hover crosshair ── */}
              {hoveredPt && hoverIdx !== null && (
                <g>
                  <line
                    x1={hoveredPt[0]} y1={0} x2={hoveredPt[0]} y2={IH}
                    stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 3" opacity={0.3}
                  />
                  <circle
                    cx={hoveredPt[0]} cy={hoveredPt[1]} r={4.5}
                    fill={rankColor(hovered?.rank ?? 999)}
                    stroke="#0a1628" strokeWidth={2}
                  />
                </g>
              )}

            </g>{/* end translate group */}

            {/* ── Hover tooltip (positioned in full SVG space) ── */}
            {hovered && hoveredPt && hoverIdx !== null && (() => {
              const ax  = hoveredPt[0] + PAD.left;
              const ay  = hoveredPt[1] + PAD.top;
              const ttW = 164;
              const ttH = hovered.points ? 84 : 68;
              const onR = ax > VW / 2;
              const ttX = onR ? ax - ttW - 14 : ax + 14;
              const ttY = Math.max(PAD.top + 4, Math.min(ay - ttH / 2, VH - PAD.bottom - ttH - 4));
              const col = rankColor(hovered.rank);
              return (
                <g>
                  {/* shadow */}
                  <rect x={ttX + 2} y={ttY + 2} width={ttW} height={ttH} rx={7} fill="#000" opacity={0.3} />
                  {/* box */}
                  <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={7}
                    fill="#0d1f3c" stroke="#1e3a5f" strokeWidth={1} />
                  {/* accent line */}
                  <rect x={ttX} y={ttY} width={4} height={ttH} rx={3} fill={col} opacity={0.9} />
                  {/* date */}
                  <text x={ttX + 14} y={ttY + 20} fill="#64748b" fontSize={10.5}
                    fontFamily="inherit">
                    {fmtDate(hovered.ranking_date)}
                  </text>
                  {/* rank */}
                  <text x={ttX + 14} y={ttY + 50} fill={col} fontSize={26}
                    fontWeight={800} fontFamily="inherit">
                    #{hovered.rank}
                  </text>
                  {/* points */}
                  {hovered.points > 0 && (
                    <text x={ttX + 14} y={ttY + 70} fill="#475569" fontSize={10.5}
                      fontFamily="inherit">
                      {hovered.points.toLocaleString()} pts
                    </text>
                  )}
                </g>
              );
            })()}
          </svg>
        </div>

        {/* ── Year-End Rankings ────────────────────────────────────────────────── */}
        {yearEnds.length > 0 && (
          <section>
            <h3 style={{
              fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
            }}>
              Year-End Rankings
            </h3>

            <div style={{
              border: '1px solid #1e3a5f', borderRadius: 10, overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            }}>
              {yearEnds.map((ye, i) => {
                const isNo1   = ye.rank === 1;
                const isTop3  = ye.rank <= 3;
                const isTop10 = ye.rank <= 10;
                const col     = rankColor(ye.rank);
                const isHov   = hoveredYear === ye.year;
                return (
                  <div
                    key={ye.year}
                    onMouseEnter={() => setHoveredYear(ye.year)}
                    onMouseLeave={() => setHoveredYear(null)}
                    style={{
                      padding: '14px 16px',
                      borderRight: '1px solid #1e3a5f',
                      borderBottom: '1px solid #1e3a5f',
                      backgroundColor: isHov ? '#112240' : (isNo1 && !ye.isCurrent) ? '#0f1a00' : (i % 2 === 0 ? '#0d1f3c' : '#0a1628'),
                      transition: 'background-color 0.1s',
                      cursor: 'default',
                    }}>
                    <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                      {ye.year}
                    </div>
                    <div style={{
                      fontSize: '1.3rem', fontWeight: 800, color: col,
                      display: 'flex', alignItems: 'baseline', gap: 6,
                    }}>
                      <span>#{ye.rank}</span>
                      {isNo1 && !ye.isCurrent && <span style={{ fontSize: '0.65rem', color: '#f0c619', fontWeight: 700, letterSpacing: '0.06em' }}>YE#1</span>}
                      {ye.isCurrent && <span style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 600, letterSpacing: '0.04em' }}>ongoing</span>}
                    </div>
                    {ye.points > 0 && (
                      <div style={{ fontSize: '0.68rem', color: '#334155', marginTop: 4, fontFamily: 'monospace' }}>
                        {ye.points.toLocaleString()} pts
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
