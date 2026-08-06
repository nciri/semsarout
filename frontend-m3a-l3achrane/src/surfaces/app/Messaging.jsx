import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Input } from '../../ds/index.js'
import { listThreads } from '../../services/index.js'

export default function Messaging() {
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-card)', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        Chargement…
      </div>
    )
  }

  const active = threads.find((t) => t.id === activeId) || threads[0]

  const send = () => {
    if (!draft.trim() || !active) return
    const nouveau = { mine: true, texte: draft, heure: 'maintenant' }
    setThreads(threads.map((t) => (t.id === active.id ? { ...t, messages: [...t.messages, nouveau] } : t)))
    setDraft('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'var(--surface-card)' }}>
      {/* liste des conversations */}
      <aside style={{ width: 328, borderInlineEnd: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 18px 12px', font: 'var(--fw-bold) var(--fs-body) var(--font-display)', color: 'var(--text-heading)' }}>
          Messages
        </div>
        {threads.map((t) => {
          const isActive = t.id === active?.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
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
              <Avatar src={t.avatar} name={t.nom} size={38} />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nom}</span>
                  <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)', flex: 'none' }}>{t.heure}</span>
                </div>
                <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.dernier}</div>
                {t.annonce && (
                  <div style={{ font: 'var(--fw-regular) 11.5px var(--font-body)', color: 'var(--text-muted)' }}>{t.annonce}</div>
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
              <Avatar src={active.avatar} name={active.nom} size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>{active.nom}</div>
                {active.annonce && (
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>{active.annonce}</div>
                )}
              </div>
              <div style={{ marginInlineStart: 'auto' }}>
                <Button variant="secondary" size="sm">Voir l’annonce</Button>
              </div>
            </div>
            <div style={{ padding: '10px 20px', background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)', font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-body)' }}>
              🔒 Vos numéros et e-mails restent masqués tant que la mise en relation n’est pas acceptée.
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 20, overflowY: 'auto', minHeight: 360 }}>
              {active.messages.map((m, i) =>
                m.flag ? (
                  <div
                    key={i}
                    style={{ alignSelf: 'center', padding: '8px 14px', borderRadius: 10, background: 'var(--amber-100)', color: 'var(--gold-700)', font: 'var(--fw-bold) var(--fs-xs) var(--font-body)', textAlign: 'center', maxWidth: '80%' }}
                  >
                    ⚠ Numéro de téléphone détecté et masqué — restez sur la messagerie interne jusqu’à la vérification.
                  </div>
                ) : (
                  <div
                    key={i}
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
                ),
              )}
              <div ref={endRef} />
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Écrivez votre message…"
                containerStyle={{ flex: 1 }}
              />
              <Button onClick={send}>Envoyer</Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
