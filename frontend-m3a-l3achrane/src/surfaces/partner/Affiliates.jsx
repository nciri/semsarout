import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Input } from '../../ds/index.js'
import { createAffilie, listAffilies } from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { ACTIVE: 'verified', INACTIVE: 'danger', PENDING: 'warning' }

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const EMPTY_FORM = { full_name: '', email: '', external_ref: '' }

function AddAffilieForm({ onCreated }) {
  const { t } = useTranslation(['partner', 'common'])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return
    setSubmitting(true)
    setError(false)
    try {
      const payload = { full_name: form.full_name.trim(), email: form.email.trim() }
      if (form.external_ref.trim()) payload.external_ref = form.external_ref.trim()
      const created = await createAffilie(payload)
      onCreated(created)
      setForm(EMPTY_FORM)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PartnerCard title={t('partner:affiliates.addForm.title')}>
      <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Input
            id="affilie-full-name"
            label={<>{t('partner:affiliates.addForm.fullNameLabel')}{requiredStar}</>}
            placeholder={t('partner:affiliates.addForm.fullNamePlaceholder')}
            value={form.full_name}
            onChange={set('full_name')}
            required
          />
          <Input
            id="affilie-email"
            label={<>{t('partner:affiliates.addForm.emailLabel')}{requiredStar}</>}
            type="email"
            placeholder={t('partner:affiliates.addForm.emailPlaceholder')}
            value={form.email}
            onChange={set('email')}
            required
          />
          <Input
            id="affilie-external-ref"
            label={t('partner:affiliates.addForm.externalRefLabel')}
            placeholder={t('partner:affiliates.addForm.externalRefPlaceholder')}
            value={form.external_ref}
            onChange={set('external_ref')}
          />
        </div>
        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:affiliates.addForm.error')}
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !form.full_name.trim() || !form.email.trim()}>
            {submitting ? t('partner:affiliates.addForm.submitting') : t('partner:affiliates.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function Affiliates() {
  const { t } = useTranslation(['partner', 'common'])
  const [affiliates, setAffiliates] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAffiliates(undefined)
    setLoadError(false)
    listAffilies()
      .then((rows) => { if (!cancelled) setAffiliates(rows) })
      .catch(() => { if (!cancelled) { setAffiliates([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleCreated = (created) => setAffiliates((prev) => [...(prev ?? []), created])

  const columns = [
    { key: 'name', label: t('partner:affiliates.table.name'), render: (row) => row.full_name },
    { key: 'email', label: t('partner:affiliates.table.email'), render: (row) => row.email ?? '—' },
    { key: 'externalRef', label: t('partner:affiliates.table.externalRef'), render: (row) => row.external_ref ?? '—' },
    {
      key: 'status',
      label: t('partner:affiliates.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{t(`partner:affiliates.status.${row.status}`)}</Badge>,
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:affiliates.kicker')} heading={t('partner:affiliates.heading')}>
      <PartnerCard>
        {loadError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:affiliates.loadError')}
          </div>
        )}
        {affiliates === undefined ? (
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        ) : (
          <PartnerTable columns={columns} rows={affiliates} emptyMessage={t('partner:affiliates.noResults')} />
        )}
      </PartnerCard>
      <AddAffilieForm onCreated={handleCreated} />
    </PartnerScreen>
  )
}
