import { useState } from 'react'
import { Avatar, Badge, Button, Card, Icon, Input, Tabs, VerifiedBadge } from '../../ds/index.js'
import {
  ACTIVITY_LOG,
  ADMIN_PROFILE,
  BACKOFFICE_NAV,
  CONTRACTS,
  CONTRACTS_MONEY,
  LISTINGS,
  LISTINGS_TOTAL,
  MATCHES_CHART,
  MATCHING_RULES,
  OVERVIEW_KPIS,
  REPORTS,
  TEAM,
  TODAY_TODO,
  USERS,
  USER_STATS,
  VERIFICATIONS,
  VERIFICATION_QUEUE_NOTE,
  VERIF_TABS,
} from '../../data/backofficeAdmin.js'

const ACTIVITY_STATUS = {
  validated: { label: 'Validé', tone: 'verified' },
  rejected: { label: 'Refusé', tone: 'danger' },
  in_progress: { label: 'En cours', tone: 'warning' },
}

const LISTING_STATUS = {
  published: { label: 'Publiée', tone: 'verified' },
  review: { label: 'En revue', tone: 'warning' },
  unpublished: { label: 'Dépubliée', tone: 'danger' },
}

const USER_VERIFICATION = {
  verified: { label: 'Vérifié', level: 'full' },
  pending: { label: 'En attente', level: 'partial' },
  suspended: { label: 'Suspendu', level: 'none' },
}

const CONTRACT_STATUS = {
  active: { label: 'Actif', tone: 'verified' },
  signature: { label: 'Signature', tone: 'warning' },
  litigation: { label: 'Litige', tone: 'danger' },
  closed: { label: 'Clôturé', tone: 'verified' },
}

const REPORT_PRIORITY = {
  urgent: { label: 'Prioritaire', tone: 'danger' },
  normal: { label: 'Standard', tone: 'warning' },
}

const CHECK_STATUS = {
  ok: { label: 'Conforme', color: 'var(--green-600)' },
  warn: { label: 'À vérifier', color: 'var(--gold-700)' },
}

function sectionTitle(children) {
  return <h2 style={{ margin: 0, font: 'var(--fw-extrabold) 15.5px var(--font-display)', color: 'var(--text-heading)' }}>{children}</h2>
}

function Sidebar({ active, onSelect }) {
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
        <div style={{ font: 'var(--fw-extrabold) 17px var(--font-display)', letterSpacing: '-0.02em' }}>M3a-L3chrane</div>
        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.14em', color: 'var(--gold-500)', textTransform: 'uppercase' }}>
          Back-office
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {BACKOFFICE_NAV.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'start',
                padding: '10px 12px', border: 0, borderRadius: 9, cursor: 'pointer',
                background: on ? 'var(--navy-600)' : 'transparent',
                color: on ? '#fff' : 'var(--text-on-navy-muted)',
                font: `var(--fw-${on ? 'bold' : 'semibold'}) var(--fs-sm) var(--font-display)`,
                transition: 'background var(--dur-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon name={item.icon} size={16} strokeWidth={2.2} />
              <span style={{ flex: 1 }}>{item.label}</span>
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
            </button>
          )
        })}
      </nav>

      <div style={{ marginBlockStart: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ font: 'var(--fw-extrabold) 12.5px var(--font-body)', color: 'var(--gold-400)' }}>{VERIFICATION_QUEUE_NOTE.title}</div>
          <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-on-navy-muted)' }}>{VERIFICATION_QUEUE_NOTE.body}</div>
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

function TopHeader({ title, subtitle }) {
  const [query, setQuery] = useState('')
  return (
    <header
      style={{
        background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)',
        padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20,
        position: 'sticky', insetBlockStart: 0, zIndex: 4,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 20px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>{title}</h1>
        <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 320 }}>
          <Input
            icon="search"
            placeholder="Rechercher un profil, une annonce, un contrat…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ font: 'var(--fw-regular) 13.5px var(--font-body)' }}
          />
        </div>
        <Button variant="secondary" size="sm">Exporter</Button>
        <Button variant="primary" size="sm">Nouvelle action</Button>
      </div>
    </header>
  )
}

function KpiCard({ label, value, delta, trend }) {
  const trendColor = trend === 'up' ? 'var(--green-600)' : 'var(--red-600)'
  const arrow = trend === 'up' ? '▲' : '▼'
  return (
    <Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.01em' }}>{label}</div>
      <div style={{ font: 'var(--fw-extrabold) 30px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: trendColor }}>
        {arrow} {delta} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>vs. 30 j</span>
      </div>
    </Card>
  )
}

function OverviewView() {
  const maxValue = Math.max(...MATCHES_CHART.map((b) => b.value))
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {OVERVIEW_KPIS.map((k) => <KpiCard key={k.id} {...k} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            {sectionTitle('Mises en relation confirmées')}
            <span style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>12 dernières semaines</span>
            <span style={{ marginInlineStart: 'auto', font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--green-600)' }}>+18,4 %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 190 }}>
            {MATCHES_CHART.map((b) => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'flex-end', height: '100%' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${(b.value / maxValue) * 100}%`,
                    borderRadius: '6px 6px 0 0',
                    background: b.value / maxValue > 0.85 ? 'var(--navy-700)' : 'var(--navy-500)',
                  }}
                />
                <div style={{ font: 'var(--fw-semibold) 11px var(--font-body)', color: 'var(--text-muted)' }}>{b.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('À traiter aujourd’hui')}
          {TODAY_TODO.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 11, background: 'var(--surface-sunken)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-500)', marginBlockStart: 6, flex: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ font: 'var(--fw-bold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{t.title}</div>
                <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-muted)' }}>{t.meta}</div>
              </div>
              <Button variant="secondary" size="sm" style={{ marginInlineStart: 'auto', flex: 'none' }}>Ouvrir</Button>
            </div>
          ))}
        </Card>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {sectionTitle('Journal d’activité')}
          <span style={{ marginInlineStart: 'auto', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>Horodatage UTC+1 — Casablanca</span>
        </div>
        {ACTIVITY_LOG.map((a) => {
          const status = ACTIVITY_STATUS[a.status]
          return (
            <div
              key={a.id}
              style={{
                display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 180px 130px', gap: 16, alignItems: 'center',
                padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.time}</div>
              <div style={{ color: 'var(--text-body)' }}>{a.text}</div>
              <div style={{ color: 'var(--text-muted)' }}>{a.actor}</div>
              <div style={{ justifySelf: 'start' }}><Badge tone={status.tone}>{status.label}</Badge></div>
            </div>
          )
        })}
      </Card>
    </>
  )
}

function VerifView() {
  const [tab, setTab] = useState(VERIF_TABS[0].id)
  const [selectedId, setSelectedId] = useState(VERIFICATIONS[0].id)
  const [note, setNote] = useState('')
  const selected = VERIFICATIONS.find((v) => v.id === selectedId) || VERIFICATIONS[0]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 372px', gap: 16, alignItems: 'start' }}>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tabs tabs={VERIF_TABS.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} style={{ borderBottom: 'none' }} />
          <span style={{ marginInlineStart: 'auto', font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
            {VERIFICATIONS.length} dossiers en attente
          </span>
        </div>
        {VERIFICATIONS.map((v) => (
          <div
            key={v.id}
            onClick={() => setSelectedId(v.id)}
            style={{
              display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 150px 120px 96px', gap: 14, alignItems: 'center',
              padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
              background: v.id === selectedId ? 'var(--gray-50)' : 'transparent',
            }}
          >
            <Avatar name={v.name} size={40} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ font: 'var(--fw-bold) 14px var(--font-display)', color: 'var(--text-heading)' }}>{v.name}</div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{v.meta}</div>
            </div>
            <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-body)' }}>{v.doc}</div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{v.age}</div>
            <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
              <button style={{ padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--green-100)', color: 'var(--green-700)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>✓</button>
              <button style={{ padding: '6px 10px', border: 0, borderRadius: 7, background: 'var(--red-100)', color: 'var(--red-600)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        ))}
      </Card>

      <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', insetBlockStart: 96 }}>
        <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
          <Avatar name={selected.name} size={52} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ font: 'var(--fw-extrabold) 16px var(--font-display)', color: 'var(--text-heading)' }}>{selected.name}</div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{selected.meta}</div>
          </div>
        </div>
        <div
          style={{
            height: 186, borderRadius: 12, background: 'var(--gray-150)', border: '1px dashed var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
            fontSize: 12.5, textAlign: 'center', padding: 16, boxSizing: 'border-box',
          }}
        >
          Aperçu du document — {selected.doc}<br />(pièce chiffrée, visible 15 min)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selected.checks.map((c) => {
            const status = CHECK_STATUS[c.status]
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, paddingBottom: 9, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-body)' }}>{c.label}</span>
                <span style={{ fontWeight: 800, color: status.color }}>{status.label}</span>
              </div>
            )
          })}
        </div>
        <textarea
          placeholder="Note interne (visible par l'équipe conformité uniquement)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            minHeight: 78, padding: 11, border: '1px solid var(--border-subtle)', borderRadius: 10,
            font: '13px/1.5 var(--font-body)', color: 'var(--text-heading)', resize: 'vertical', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" fullWidth style={{ background: 'var(--green-600)', border: '1px solid var(--green-600)' }}>Valider le profil</Button>
          <Button variant="danger" fullWidth style={{ background: 'var(--white)', color: 'var(--red-600)', border: '1px solid var(--red-500)' }}>Refuser</Button>
        </div>
      </Card>
    </div>
  )
}

function ListingsView() {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 120px 140px 120px 92px', gap: 16,
          padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)',
          font: 'var(--fw-extrabold) 12px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase',
        }}
      >
        <div>Annonce</div><div>Ville</div><div>Loyer</div><div>Hôte</div><div>Statut</div><div style={{ justifySelf: 'end' }}>Action</div>
      </div>
      {LISTINGS.map((l) => {
        const status = LISTING_STATUS[l.status]
        return (
          <div
            key={l.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 120px 140px 120px 92px', gap: 16, alignItems: 'center',
              padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 46, height: 38, borderRadius: 8, background: 'var(--gray-150)', flex: 'none' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.id}</div>
              </div>
            </div>
            <div style={{ color: 'var(--text-body)' }}>{l.city}</div>
            <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.rent}</div>
            <div style={{ color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.host}</div>
            <div><Badge tone={status.tone}>{status.label}</Badge></div>
            <Button variant="secondary" size="sm" style={{ justifySelf: 'end' }}>Examiner</Button>
          </div>
        )
      })}
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-muted)' }}>
        1 – {LISTINGS.length} sur {LISTINGS_TOTAL.toLocaleString('fr-FR')} annonces
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm">Précédent</Button>
          <Button variant="secondary" size="sm">Suivant</Button>
        </div>
      </div>
    </Card>
  )
}

function UsersView() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {USER_STATS.map((u) => (
          <Card key={u.id} padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{u.label}</div>
            <div style={{ font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em', lineHeight: 1 }}>{u.value}</div>
          </Card>
        ))}
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 130px 120px 110px 92px', gap: 16,
            padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)',
            font: 'var(--fw-extrabold) 12px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase',
          }}
        >
          <div>Utilisateur</div><div>Rôle</div><div>Inscription</div><div>Vérification</div><div>Signalements</div><div style={{ justifySelf: 'end' }}>Action</div>
        </div>
        {USERS.map((u) => {
          const verification = USER_VERIFICATION[u.verification]
          return (
            <div
              key={u.id}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 130px 120px 110px 92px', gap: 16, alignItems: 'center',
                padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
              }}
            >
              <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
                <Avatar name={u.name} size={34} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                </div>
              </div>
              <div style={{ color: 'var(--text-body)' }}>{u.role}</div>
              <div style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{u.joined}</div>
              <div><VerifiedBadge label={verification.label} level={verification.level} size="sm" /></div>
              <div style={{ color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}>{u.flags}</div>
              <Button variant="secondary" size="sm" style={{ justifySelf: 'end' }}>Fiche</Button>
            </div>
          )
        })}
      </Card>
    </>
  )
}

function ContractsView() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        {CONTRACTS_MONEY.map((m) => (
          <Card key={m.id} padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{m.label}</div>
            <div style={{ font: 'var(--fw-extrabold) 28px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em', lineHeight: 1 }}>{m.value}</div>
            <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{m.note}</div>
          </Card>
        ))}
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr) 150px 120px 130px 96px', gap: 16,
            padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)',
            font: 'var(--fw-extrabold) 12px var(--font-body)', color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase',
          }}
        >
          <div>Contrat</div><div>Parties</div><div>Période</div><div>Dépôt</div><div>Statut</div><div style={{ justifySelf: 'end' }}>Action</div>
        </div>
        {CONTRACTS.map((c) => {
          const status = CONTRACT_STATUS[c.status]
          return (
            <div
              key={c.id}
              style={{
                display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr) 150px 120px 130px 96px', gap: 16, alignItems: 'center',
                padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5,
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--text-heading)', fontVariantNumeric: 'tabular-nums' }}>{c.id}</div>
              <div style={{ color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.parties}</div>
              <div style={{ color: 'var(--text-muted)' }}>{c.period}</div>
              <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.deposit}</div>
              <div><Badge tone={status.tone}>{status.label}</Badge></div>
              <Button variant="secondary" size="sm" style={{ justifySelf: 'end' }}>Détail</Button>
            </div>
          )
        })}
      </Card>
    </>
  )
}

function ReportsView() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
      {REPORTS.map((r) => {
        const priority = REPORT_PRIORITY[r.priority]
        return (
          <Card key={r.id} padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge tone={priority.tone}>{priority.label}</Badge>
              <span style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.id} · {r.age}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ margin: 0, font: 'var(--fw-extrabold) 15.5px var(--font-display)', color: 'var(--text-heading)' }}>{r.title}</h3>
              <p style={{ margin: 0, font: 'var(--fw-regular) 13.5px/1.6 var(--font-body)', color: 'var(--text-body)' }}>{r.body}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBlockStart: 4, borderBlockStart: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBlockStart: 10 }}>
                <Avatar name={r.by} size={28} />
                <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>Signalé par {r.by}</div>
              </div>
              <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, paddingBlockStart: 10 }}>
                <Button variant="secondary" size="sm">Classer</Button>
                <Button variant="primary" size="sm">Traiter</Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function SettingsView() {
  const [rules, setRules] = useState(MATCHING_RULES)
  const toggleRule = (id) => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sectionTitle('Règles de mise en relation')}
        {rules.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingBlockEnd: 16, borderBlockEnd: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ font: 'var(--fw-bold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{r.label}</div>
              <div style={{ font: 'var(--fw-regular) 12.5px/1.5 var(--font-body)', color: 'var(--text-muted)' }}>{r.desc}</div>
            </div>
            <button
              onClick={() => toggleRule(r.id)}
              aria-pressed={r.enabled}
              aria-label={r.label}
              style={{
                marginInlineStart: 'auto', flex: 'none', width: 44, height: 25, borderRadius: 999, border: 0,
                background: r.enabled ? 'var(--green-500)' : 'var(--gray-300)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: r.enabled ? 'flex-end' : 'flex-start',
                padding: 3, boxSizing: 'border-box',
              }}
            >
              <span style={{ width: 19, height: 19, borderRadius: '50%', background: '#fff', display: 'block' }} />
            </button>
          </div>
        ))}
      </Card>

      <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sectionTitle('Équipe & rôles')}
        {TEAM.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBlockEnd: 12, borderBlockEnd: '1px solid var(--border-subtle)' }}>
            <Avatar name={t.name} size={36} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ font: 'var(--fw-bold) 13.5px var(--font-display)', color: 'var(--text-heading)' }}>{t.name}</div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{t.email}</div>
            </div>
            <span style={{ marginInlineStart: 'auto' }}><Badge tone="navy">{t.role}</Badge></span>
          </div>
        ))}
        <Button variant="secondary" size="sm" iconLeft="plus" style={{ alignSelf: 'flex-start', border: '1px dashed var(--border-default)' }}>
          Inviter un membre
        </Button>
      </Card>
    </div>
  )
}

const VIEWS = {
  overview: OverviewView,
  verif: VerifView,
  listings: ListingsView,
  users: UsersView,
  contracts: ContractsView,
  reports: ReportsView,
  settings: SettingsView,
}

export default function BackOffice() {
  const [view, setView] = useState('overview')
  const meta = BACKOFFICE_NAV.find((n) => n.id === view) || BACKOFFICE_NAV[0]
  const ViewComponent = VIEWS[view]

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', background: 'var(--bg-page)' }}>
      <Sidebar active={view} onSelect={setView} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopHeader title={meta.title} subtitle={meta.subtitle} />
        <div style={{ padding: '24px 28px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <ViewComponent />
        </div>
      </main>
    </div>
  )
}
