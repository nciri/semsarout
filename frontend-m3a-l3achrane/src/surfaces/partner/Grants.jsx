import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Input, Select } from '../../ds/index.js'
import { createGrant, listAffilies, listGrants, updateGrant } from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

// Valeurs techniques envoyées à/reçues de l'API — ne JAMAIS traduire, seul le libellé affiché l'est.
const STATUS_TONE = { PLANNED: 'info', PAID: 'verified', CANCELLED: 'danger' }

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const EMPTY_FORM = { program: '', affilie_id: '', amount: '' }

function AddGrantForm({ affiliates, onCreated }) {
  const { t } = useTranslation(['partner', 'common'])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const affiliateOptions = [
    { value: '', label: t('partner:grants.addForm.affiliateNone') },
    ...affiliates.map((a) => ({ value: String(a.id), label: a.full_name ?? a.nom })),
  ]

  const canSubmit = form.program.trim() && Number(form.amount) > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(false)
    try {
      // Le backend force toujours PLANNED à la création (GrantCreateIn n'a pas de champ status) —
      // pas de sélecteur de statut ici, le changement se fait via l'action updateGrant.
      const payload = { program: form.program.trim(), amount: Number(form.amount) }
      if (form.affilie_id) payload.affilie_id = form.affilie_id
      const created = await createGrant(payload)
      onCreated(created)
      setForm(EMPTY_FORM)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PartnerCard title={t('partner:grants.addForm.title')}>
      <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Input
            id="grant-program"
            label={<>{t('partner:grants.addForm.programLabel')}{requiredStar}</>}
            placeholder={t('partner:grants.addForm.programPlaceholder')}
            value={form.program}
            onChange={set('program')}
            required
          />
          <Select
            id="grant-affilie"
            label={t('partner:grants.addForm.affiliateLabel')}
            options={affiliateOptions}
            value={form.affilie_id}
            onChange={set('affilie_id')}
          />
          <Input
            id="grant-amount"
            type="number"
            min="0"
            step="0.01"
            label={<>{t('partner:grants.addForm.amountLabel')}{requiredStar}</>}
            placeholder={t('partner:grants.addForm.amountPlaceholder')}
            value={form.amount}
            onChange={set('amount')}
            required
          />
        </div>
        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:grants.addForm.error')}
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !canSubmit}>
            {submitting ? t('partner:grants.addForm.submitting') : t('partner:grants.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function Grants() {
  const { t } = useTranslation(['partner', 'common'])
  const [grants, setGrants] = useState(undefined) // undefined = loading
  const [affiliates, setAffiliates] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setGrants(undefined)
    setLoadError(false)
    Promise.all([listGrants(), listAffilies()])
      .then(([grnts, affs]) => {
        if (cancelled) return
        setGrants(grnts)
        setAffiliates(affs)
      })
      .catch(() => { if (!cancelled) { setGrants([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleCreated = (created) => setGrants((prev) => [...(prev ?? []), created])

  const setRowStatus = (id, status) => {
    setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, status } : g)))
  }

  const changeStatus = async (id, status) => {
    setActingId(id)
    setActionError(false)
    try {
      const updated = await updateGrant(id, { status })
      setRowStatus(id, updated.status)
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const affiliateName = (row) => {
    if (!row.affilie_id) return '—'
    const affilie = affiliates.find((a) => String(a.id) === String(row.affilie_id))
    return affilie ? (affilie.full_name ?? affilie.nom) : row.affilie_id
  }

  const columns = [
    { key: 'program', label: t('partner:grants.table.program'), render: (row) => row.program },
    { key: 'beneficiary', label: t('partner:grants.table.beneficiary'), render: affiliateName },
    { key: 'amount', label: t('partner:grants.table.amount'), render: (row) => `${Number(row.amount).toLocaleString('fr-MA')} Đh` },
    {
      key: 'status',
      label: t('partner:grants.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{t(`partner:grants.status.${row.status}`)}</Badge>,
    },
    {
      key: 'actions',
      label: t('partner:grants.table.actions'),
      render: (row) => (
        row.status === 'PLANNED' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => changeStatus(row.id, 'PAID')} disabled={actingId === row.id}>
              {t('partner:grants.actions.markPaid')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => changeStatus(row.id, 'CANCELLED')} disabled={actingId === row.id}>
              {t('partner:grants.actions.cancel')}
            </Button>
          </div>
        ) : null
      ),
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:grants.kicker')} heading={t('partner:grants.heading')}>
      <PartnerCard>
        {loadError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:grants.loadError')}
          </div>
        )}
        {actionError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:grants.actions.actionError')}
          </div>
        )}
        {grants === undefined ? (
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        ) : (
          <PartnerTable columns={columns} rows={grants} emptyMessage={t('partner:grants.noResults')} />
        )}
      </PartnerCard>
      {grants !== undefined && <AddGrantForm affiliates={affiliates} onCreated={handleCreated} />}
    </PartnerScreen>
  )
}
