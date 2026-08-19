import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Input, Select } from '../../ds/index.js'
import { createReservation, listAffilies, listReservations, releaseReservation } from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

// Valeurs techniques envoyées à/reçues de l'API — ne JAMAIS traduire, seul le libellé affiché l'est.
const STATUS_TONE = { RESERVED: 'info', RELEASED: 'neutral', CONVERTED: 'verified' }

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const EMPTY_FORM = { listing_id: '', affilie_id: '', label: '', start_date: '', end_date: '' }

function AddReservationForm({ affiliates, onCreated }) {
  const { t } = useTranslation(['partner', 'common'])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const affiliateOptions = [
    { value: '', label: t('partner:reservedOffers.addForm.affiliateNone') },
    ...affiliates.map((a) => ({ value: String(a.id), label: a.full_name ?? a.nom })),
  ]

  const canSubmit = form.listing_id.trim() && form.label.trim() && form.start_date && form.end_date

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(false)
    try {
      const payload = {
        listing_id: form.listing_id.trim(),
        label: form.label.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
      }
      if (form.affilie_id) payload.affilie_id = form.affilie_id
      const created = await createReservation(payload)
      onCreated(created)
      setForm(EMPTY_FORM)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PartnerCard title={t('partner:reservedOffers.addForm.title')}>
      <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Input
            id="reservation-listing-id"
            label={<>{t('partner:reservedOffers.addForm.listingLabel')}{requiredStar}</>}
            placeholder={t('partner:reservedOffers.addForm.listingPlaceholder')}
            value={form.listing_id}
            onChange={set('listing_id')}
            required
          />
          <Select
            id="reservation-affilie"
            label={t('partner:reservedOffers.addForm.affiliateLabel')}
            options={affiliateOptions}
            value={form.affilie_id}
            onChange={set('affilie_id')}
          />
          <Input
            id="reservation-label"
            label={<>{t('partner:reservedOffers.addForm.labelLabel')}{requiredStar}</>}
            placeholder={t('partner:reservedOffers.addForm.labelPlaceholder')}
            value={form.label}
            onChange={set('label')}
            required
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Input
            id="reservation-start-date"
            type="date"
            label={<>{t('partner:reservedOffers.addForm.startDateLabel')}{requiredStar}</>}
            value={form.start_date}
            onChange={set('start_date')}
            required
          />
          <Input
            id="reservation-end-date"
            type="date"
            label={<>{t('partner:reservedOffers.addForm.endDateLabel')}{requiredStar}</>}
            value={form.end_date}
            onChange={set('end_date')}
            required
          />
        </div>
        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:reservedOffers.addForm.error')}
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !canSubmit}>
            {submitting ? t('partner:reservedOffers.addForm.submitting') : t('partner:reservedOffers.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function ReservedOffers() {
  const { t } = useTranslation(['partner', 'common'])
  const [reservations, setReservations] = useState(undefined) // undefined = loading
  const [affiliates, setAffiliates] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReservations(undefined)
    setLoadError(false)
    Promise.all([listReservations(), listAffilies()])
      .then(([reservs, affs]) => {
        if (cancelled) return
        setReservations(reservs)
        setAffiliates(affs)
      })
      .catch(() => { if (!cancelled) { setReservations([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleCreated = (created) => setReservations((prev) => [...(prev ?? []), created])

  const setRowStatus = (id, status) => {
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  const release = async (id) => {
    setActingId(id)
    setActionError(false)
    try {
      const updated = await releaseReservation(id)
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
    { key: 'listing', label: t('partner:reservedOffers.table.listing'), render: (row) => row.label },
    { key: 'listingId', label: t('partner:reservedOffers.table.listingId'), render: (row) => row.listing_id },
    { key: 'reservedFor', label: t('partner:reservedOffers.table.reservedFor'), render: affiliateName },
    { key: 'period', label: t('partner:reservedOffers.table.period'), render: (row) => `${row.start_date ?? '—'} → ${row.end_date ?? '—'}` },
    {
      key: 'status',
      label: t('partner:reservedOffers.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{t(`partner:reservedOffers.status.${row.status}`)}</Badge>,
    },
    {
      key: 'actions',
      label: t('partner:reservedOffers.table.actions'),
      render: (row) => (
        row.status === 'RESERVED' ? (
          <Button size="sm" variant="ghost" onClick={() => release(row.id)} disabled={actingId === row.id}>
            {t('partner:reservedOffers.actions.release')}
          </Button>
        ) : null
      ),
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:reservedOffers.kicker')} heading={t('partner:reservedOffers.heading')}>
      <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('partner:reservedOffers.intro')}
      </div>
      <PartnerCard>
        {loadError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:reservedOffers.loadError')}
          </div>
        )}
        {actionError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:reservedOffers.actions.actionError')}
          </div>
        )}
        {reservations === undefined ? (
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        ) : (
          <PartnerTable columns={columns} rows={reservations} emptyMessage={t('partner:reservedOffers.noResults')} />
        )}
      </PartnerCard>
      {reservations !== undefined && <AddReservationForm affiliates={affiliates} onCreated={handleCreated} />}
    </PartnerScreen>
  )
}
