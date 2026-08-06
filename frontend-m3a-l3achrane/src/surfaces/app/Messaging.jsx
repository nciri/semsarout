import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, IconButton, Input } from '../../ds/index.js'
import { listThreads } from '../../services/index.js'

export default function Messaging() {
  const { t } = useTranslation(['app', 'common'])
  const [threads, setThreads] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    listThreads().then((list) => {
      setThreads(list)
      setActiveId(list[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    endRef.current?.parentElement?.scrollTo(0, 99999)
  })

  if (!threads) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('common:loading')}
      </div>
    )
  }

  const active = threads.find((th) => th.id === activeId) || threads[0]

  const send = () => {
    if (!draft.trim() || !active) return
    const nouveau = { mine: true, texte: draft, heure: t('app:messaging.now') }
    setThreads(threads.map((th) => (th.id === active.id ? { ...th, messages: [...th.messages, nouveau] } : th)))
    setDraft('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: '#fff' }}>
      {/* liste des conversations */}
      <div style={{ width: 320, borderInlineEnd: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ font: 'var(--fw-bold) var(--fs-h2) var(--font-display)', color: 'var(--navy-700)', marginBottom: 12 }}>{t('app:messaging.title')}</div>
          <Input icon="search" placeholder={t('app:messaging.searchPlaceholder')} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {threads.map((th) => (
            <button
              key={th.id}
              onClick={() => setActiveId(th.id)}
              style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '12px 20px', background: th.id === active?.id ? 'var(--navy-50)' : 'transparent', border: 'none', borderBottom: '1px solid var(--gray-100)', cursor: 'pointer', textAlign: 'start' }}
            >
              <Avatar src={th.avatar} name={th.nom} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-display)', color: 'var(--text-strong)' }}>{th.nom}</span>
                  <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>{th.heure}</span>
                </div>
                <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.dernier}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* fil de discussion */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {active && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
              <Avatar src={active.avatar} name={active.nom} showLabel size={40} />
              <div style={{ display: 'flex', gap: 8 }}>
                <IconButton icon="phone" label={t('app:messaging.call')} variant="ghost" round />
                <IconButton icon="video" label={t('app:messaging.video')} variant="ghost" round />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-page)' }}>
              {active.messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '68%', padding: '10px 14px', borderRadius: m.mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: m.mine ? 'var(--navy-700)' : '#fff', color: m.mine ? '#fff' : 'var(--text-body)', border: m.mine ? 'none' : '1px solid var(--border-subtle)', font: 'var(--fw-regular) var(--fs-body)/1.45 var(--font-body)', boxShadow: 'var(--shadow-xs)' }}>
                    {m.texte}
                    <div style={{ font: 'var(--fw-regular) 10px var(--font-body)', color: m.mine ? 'rgba(255,255,255,.6)' : 'var(--text-muted)', textAlign: 'end', marginTop: 4 }}>{m.heure}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border-subtle)' }}>
              <IconButton icon="plus" label={t('app:messaging.attach')} variant="soft" round />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={t('app:messaging.inputPlaceholder')}
                style={{ flex: 1, height: 44, padding: '0 16px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', outline: 'none', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-strong)' }}
              />
              <IconButton icon="send" label={t('app:messaging.send')} variant="navy" round onClick={send} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
