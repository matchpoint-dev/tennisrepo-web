'use client';

import Link from 'next/link';
import { getFlagUrl } from './lib/countryUtils';

const podiumColors = ['#f0c619', '#94a3b8', '#cd7c44'];

function FlagImg({ country }: { country: string }) {
  const url = getFlagUrl(country);
  if (!url) return <span style={{ width: 20, display: 'inline-block' }} />;
  return (
    <img
      src={url}
      alt={country}
      style={{ width: 20, height: 15, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
    />
  );
}

function RankingRow({ r, i, total, valueKey, accentColor }: {
  r: any;
  i: number;
  total: number;
  valueKey: 'points' | 'rating';
  accentColor: string;
}) {
  return (
    <Link href={`/players/${r.playerId}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', padding: '9px 14px', gap: 10,
          borderBottom: i < total - 1 ? '1px solid #0f2744' : 'none',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#142035')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <span style={{
          width: 22, fontSize: 13, fontWeight: 700, textAlign: 'center', flexShrink: 0,
          color: i < 3 ? podiumColors[i] : '#475569',
        }}>
          {r.rank}
        </span>
        <FlagImg country={r.country} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.name}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accentColor, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {r[valueKey].toLocaleString()}
        </span>
      </div>
    </Link>
  );
}

export default function RankingCard({
  title,
  href,
  rows,
  valueKey,
  accentColor,
}: {
  title: string;
  href: string;
  rows: any[];
  valueKey: 'points' | 'rating';
  accentColor: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: accentColor, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </h3>
      <div style={{ backgroundColor: '#0d1f3c', borderRadius: 10, border: '1px solid #1e3a5f', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <RankingRow key={r.playerId} r={r} i={i} total={rows.length} valueKey={valueKey} accentColor={accentColor} />
        ))}
        <Link href={href} style={{ textDecoration: 'none' }}>
          <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#64748b', fontWeight: 600, borderTop: '1px solid #0f2744' }}>
            View all →
          </div>
        </Link>
      </div>
    </div>
  );
}
