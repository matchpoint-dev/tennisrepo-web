'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/h2h', label: 'H2H' },
  { href: '/stats', label: 'Stats' },
];

function TennisRacket() {
  return (
    <svg width="22" height="30" viewBox="0 0 22 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Horizontal strings (clipped to ellipse by pre-calculated intersections) */}
      <line x1="3.1" y1="5.5"  x2="18.9" y2="5.5"  stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      <line x1="2"   y1="10"   x2="20"   y2="10"    stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      <line x1="3.1" y1="14.5" x2="18.9" y2="14.5"  stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      {/* Vertical strings */}
      <line x1="5.5"  y1="2.5"  x2="5.5"  y2="17.5" stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      <line x1="11"   y1="0.5"  x2="11"   y2="19.5" stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      <line x1="16.5" y1="2.5"  x2="16.5" y2="17.5" stroke="#f0c619" strokeWidth="0.7" opacity="0.6"/>
      {/* Frame */}
      <ellipse cx="11" cy="10" rx="9" ry="9.5" stroke="#f0c619" strokeWidth="2" fill="none"/>
      {/* Throat */}
      <path d="M7 19.5 L9 22 L13 22 L15 19.5" stroke="#f0c619" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
      {/* Handle */}
      <rect x="9.5" y="22" width="3" height="7.5" rx="1.5" fill="#f0c619"/>
    </svg>
  );
}

export default function NavBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav style={{ backgroundColor: '#0d1f3c', borderBottom: '1px solid #1e3a5f', padding: '0 2rem', flexShrink: 0 }}>
      <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '2rem' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TennisRacket />
          <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em' }}>
            <span style={{ color: '#f0c619' }}>TENNIS</span>
            <span style={{ color: '#e2e8f0' }}>REPO</span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: '1.5rem', marginLeft: 'auto' }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={{
              color:        isActive(l.href) ? '#f0c619' : '#94a3b8',
              textDecoration: 'none',
              fontSize:     '0.9rem',
              fontWeight:   isActive(l.href) ? 600 : 400,
              borderBottom: isActive(l.href) ? '2px solid #f0c619' : '2px solid transparent',
              paddingBottom: '2px',
              whiteSpace:   'nowrap',
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
