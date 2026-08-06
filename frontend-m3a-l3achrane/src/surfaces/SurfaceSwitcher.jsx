import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Web' },
  { to: '/recherche', label: 'Recherche' },
  { to: '/espace', label: 'Espace' },
  { to: '/partenaire', label: 'Partenaire' },
  { to: '/back-office', label: 'Back-office' },
]

const linkStyle = ({ isActive }) => ({
  padding: '6px 12px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 600,
  color: isActive ? 'var(--text-on-navy)' : 'var(--text-on-navy-muted)',
  background: isActive ? 'var(--brand-accent)' : 'transparent',
})

/**
 * Dev-only surface switcher — jumps between the three surfaces without
 * real auth. Not part of the product UI.
 */
export default function SurfaceSwitcher() {
  return (
    <nav
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-navy)',
        boxShadow: 'var(--shadow-nav)',
        zIndex: 1000,
      }}
      aria-label="Changer de surface (dev)"
    >
      {links.map(({ to, label }) => (
        <NavLink key={to} to={to} end={to === '/'} style={linkStyle}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
