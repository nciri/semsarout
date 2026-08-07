import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Icon } from '../../ds/index.js'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/index.js'

const TYPE_ICON = {
  'message.new': 'message-circle',
  'lease.to_sign': 'file-signature',
  'payment.due': 'credit-card',
  'payment.received': 'credit-card',
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Notifications() {
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)

  const load = () => {
    getNotifications()
      .then(setItems)
      .catch(() => setError(true))
  }

  useEffect(load, [])

  const handleRead = async (n) => {
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id)
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)))
      } catch {
        setError(true)
      }
    }
    if (n.link) navigate(n.link)
  }

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead()
      setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? new Date().toISOString() })))
    } catch {
      setError(true)
    }
  }

  const unreadCount = (items ?? []).filter((n) => !n.read_at).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
              {t('app:notifications.title')}
            </h1>
            {unreadCount > 0 && (
              <span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
                {t('app:notifications.unreadCount', { count: unreadCount })}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkAll}>
              {t('app:notifications.markAllRead')}
            </Button>
          )}
        </div>

        {error && (
          <div style={{ padding: 24, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--red-600)' }}>
            {t('app:notifications.loadError')}
          </div>
        )}

        {!error && !items && (
          <div style={{ padding: 32, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        )}

        {!error && items && items.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('app:notifications.empty')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items?.map((n) => (
            <Card key={n.id}>
              <button
                onClick={() => handleRead(n)}
                style={{
                  all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 'var(--radius-pill)', flexShrink: 0,
                  background: n.read_at ? 'var(--surface-sunken)' : 'var(--navy-50)',
                  color: n.read_at ? 'var(--text-muted)' : 'var(--navy-700)',
                }}>
                  <Icon name={TYPE_ICON[n.type] ?? 'bell'} size={17} strokeWidth={2} />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: `var(--fw-${n.read_at ? 'medium' : 'bold'}) var(--fs-sm) var(--font-body)`, color: 'var(--text-strong)' }}>
                    {t(`app:notifications.types.${n.type}`, n.type)}
                  </span>
                  <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
                    {formatDate(n.created_at)}
                  </span>
                </div>
                {!n.read_at && <Badge tone="gold">•</Badge>}
              </button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
