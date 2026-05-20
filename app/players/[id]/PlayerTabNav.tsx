'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function PlayerTabNav({ id }: { id: string }) {
  const pathname = usePathname()
  const base = `/players/${id}`

  const tabs = [
    { label: 'Overview',           href: base },
    { label: 'Matches',            href: `${base}/matches` },
    { label: 'Tournaments',        href: `${base}/tournaments` },
    { label: 'Career',             href: `${base}/career` },
    { label: 'Ranking History',    href: `${base}/rankings` },
    { label: 'Ranking Breakdown',  href: `${base}/ranking-breakdown` },
  ]

  return (
    <div style={{ backgroundColor: '#0d1f3c', borderBottom: '1px solid #1e3a5f' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex' }}>
        {tabs.map(tab => {
          const isActive = tab.href === base
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(tab.href)
          return (
            <Link key={tab.label} href={tab.href} style={{
              padding: '14px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: isActive ? '#f0c619' : '#94a3b8',
              textDecoration: 'none',
              borderBottom: isActive ? '3px solid #f0c619' : '3px solid transparent',
              marginBottom: -1,
              display: 'block',
              transition: 'color 0.15s',
            }}>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
