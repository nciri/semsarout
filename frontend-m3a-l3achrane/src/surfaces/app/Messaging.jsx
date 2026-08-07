import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Input } from '../../ds/index.js'
import { getConversations, getConversationThread, sendConversationMessage } from '../../services/index.js'

function conversationLabel(conv, t) {
  if (conv._mockNom) return conv._mockNom
  return t(conv.isRequester ? 'app:messaging.role.owner' : 'app:messaging.role.candidate', { id: conv.otherUserId })
}

export default function Messaging() {
  const { t } = useTranslation(['app', 'common'])
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState(null)
  const [error, setError] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [thread, setThread] = useState(null)
  const [threadError, setThreadError] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getConversations()
      .then((list) => {
        if (cancelled) return
        setConversations(list)
        const wanted = searchParams.get('conversation')
        const preselect = wanted && list.some((c) => String(c.id) === wanted) ? wanted : list[0]?.id
        setActiveId(preselect != null ? (list.find((c) => String(c.id) === String(preselect))?.id ?? null) : null)
      })
      .catch(() => !cancelled && setError(true))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeId == null) { setThread(null); return }
    let cancelled = false
    setThreadError(false)
    getConversationThread(activeId)
      .then((data) => !cancelled && setThread(data))
      .catch(() => !cancelled && setThreadError(true))
    return () => { cancelled = true }
  }, [activeId])

  useEffect(() => {
    endRef.current?.parentElement?.scrollTo(0, 99999)
  }, [thread])

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-card)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--red-600)' }}>
        {t('app:messaging.loadError')}
      </div>
    )
  }

  if (!conversations) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-card)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('common:loading')}
      </div>
    )
  }

  const active = conversations.find((c) => c.id === activeId) || null

  const send = async () => {
    if (!draft.trim() || !active || sending) return
    setSending(true)
    const body = draft.trim()
    try {
      const message = await sendConversationMessage(active.id, body)
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev))
      setDraft('')
    } catch {
      setThreadError(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'var(--surface-card)' }}>
      {/* liste des conversations */}
      <aside style={{ width: 328, borderInlineEnd: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 18px 12px', font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-heading)' }}>
          {t('common:nav.messages')}
        </div>
        {conversations.length === 0 && (
          <div style={{ padding: '24px 18px', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('app:messaging.empty')}
          </div>
        )}
        {conversations.map((c) => {
          const isActive = c.id === active?.id
          const label = conversationLabel(c, t)
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                textAlign: 'start',
                border: 0,
                borderInlineStart: isActive ? '3px solid var(--navy-700)' : '3px solid transparent',
                background: isActive ? 'var(--navy-50)' : 'transparent',
                padding: '12px 16px',
                display: 'flex',
                gap: 11,
                cursor: 'pointer',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <Avatar src={c._mockAvatar} name={label} size={38} />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                  <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)', flex: 'none' }}>{c.updatedAtLabel}</span>
                </div>
                {c._mockDernier && (
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c._mockDernier}</div>
                )}
              </div>
            </button>
          )
        })}
      </aside>
      {/* fil de discussion */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {active && (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar src={active._mockAvatar} name={conversationLabel(active, t)} size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>{conversationLabel(active, t)}</div>
              </div>
              {active.listingId && (
                <div style={{ marginInlineStart: 'auto' }}>
                  <Button variant="secondary" size="sm" onClick={() => window.open(`/annonce/${active.listingId}`, '_blank')}>
                    {t('app:messaging.viewListing')}
                  </Button>
                </div>
              )}
            </div>
            <div style={{ padding: '10px 20px', background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)', font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-body)' }}>
              🔒 {t('app:messaging.privacyBanner')}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 20, overflowY: 'auto', minHeight: 360 }}>
              {threadError && (
                <div style={{ alignSelf: 'center', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>
                  {t('app:messaging.loadError')}
                </div>
              )}
              {thread?.messages.length === 0 && !threadError && (
                <div style={{ alignSelf: 'center', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
                  {t('app:messaging.emptyThread')}
                </div>
              )}
              {thread?.messages.map((m, i) => (
                <div
                  key={m.id ?? i}
                  style={{
                    alignSelf: m.mine ? 'flex-end' : 'flex-start',
                    maxWidth: '62%',
                    padding: '11px 14px',
                    borderRadius: m.mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.mine ? 'var(--navy-700)' : 'var(--surface-sunken)',
                    color: m.mine ? '#fff' : 'var(--text-heading)',
                    font: 'var(--fw-regular) var(--fs-body)/1.5 var(--font-body)',
                  }}
                >
                  {m.texte}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={t('app:messaging.inputPlaceholder')}
                containerStyle={{ flex: 1 }}
              />
              <Button onClick={send} disabled={sending || !draft.trim()}>{t('app:messaging.send')}</Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
