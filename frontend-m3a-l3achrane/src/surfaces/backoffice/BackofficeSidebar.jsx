import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../ds/index.js'
import { ADMIN_PROFILE, BACKOFFICE_NAV, VERIFICATION_QUEUE_NOTE } from '../../data/backofficeAdmin.js'

// Sidebar de navigation partagée par toutes les vues du back-office (BackOffice.jsx
// et écrans routés séparément comme AttributionChambres.jsx). Les items sans `route`
// basculent la vue interne de BackOffice via `onSelect` ; ceux avec `route` sont des
// écrans routés séparément (lien react-router).
export function BackofficeSidebar({ active, onSelect }) {
  const { t } = useTranslation(['backoffice'])
  return (
    <aside
      style={{
        background: 'var(--surface-navy-deep)',
        color: 'var(--text-on-navy)',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        padding: '22px 16px',
        position: 'sticky',
        insetBlockStart: 0,
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        <div style={{ font: 'var(--fw-extrabold) 17px var(--font-display)', letterSpacing: '-0.02em' }}>{t('backoffice:sidebar.brand')}</div>
        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.14em', color: 'var(--gold-500)', textTransform: 'uppercase' }}>
          {t('backoffice:sidebar.brandTag')}
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {BACKOFFICE_NAV.map((item) => {
          const on = item.id === active
          const itemStyle = {
            display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'start',
            padding: '10px 12px', border: 0, borderRadius: 9, cursor: 'pointer',
            background: on ? 'var(--navy-600)' : 'transparent',
            color: on ? '#fff' : 'var(--text-on-navy-muted)',
            font: `var(--fw-${on ? 'bold' : 'semibold'}) var(--fs-sm) var(--font-display)`,
            transition: 'background var(--dur-fast) var(--ease-standard)',
            textDecoration: 'none', boxSizing: 'border-box',
          }
          const hoverHandlers = {
            onMouseEnter: (e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.07)' },
            onMouseLeave: (e) => { if (!on) e.currentTarget.style.background = 'transparent' },
          }
          const content = (
            <>
              <Icon name={item.icon} size={16} strokeWidth={2.2} />
              <span style={{ flex: 1 }}>{t(`backoffice:sidebar.nav.${item.id}.label`, { defaultValue: item.label })}</span>
              {item.count != null && (
                <span
                  style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                    background: on ? 'var(--gold-500)' : 'rgba(255,255,255,.13)',
                    color: on ? 'var(--navy-900)' : '#fff',
                  }}
                >
                  {item.count}
                </span>
              )}
            </>
          )
          // Écrans routés séparément (hors bascule interne `view`) : lien react-router.
          if (item.route) {
            return (
              <Link key={item.id} to={item.route} style={itemStyle} {...hoverHandlers}>
                {content}
              </Link>
            )
          }
          return (
            <button key={item.id} onClick={() => onSelect(item.id)} style={itemStyle} {...hoverHandlers}>
              {content}
            </button>
          )
        })}
      </nav>

      <div style={{ marginBlockStart: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ font: 'var(--fw-extrabold) 12.5px var(--font-body)', color: 'var(--gold-400)' }}>
            {t('backoffice:sidebar.queueNote.title', { defaultValue: VERIFICATION_QUEUE_NOTE.title })}
          </div>
          <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-on-navy-muted)' }}>
            {t('backoffice:sidebar.queueNote.body', { defaultValue: VERIFICATION_QUEUE_NOTE.body })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--navy-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flex: 'none' }}>
            {ADMIN_PROFILE.initials}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--fw-bold) 13px var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ADMIN_PROFILE.name}</div>
            <div style={{ font: 'var(--fw-regular) 11.5px var(--font-body)', color: 'var(--text-on-navy-muted)' }}>{ADMIN_PROFILE.role}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
