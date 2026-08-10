import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Icon, Input, Select } from '../../ds/index.js'
import { createInvoice, listInvoices, updateInvoice } from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

// Valeurs techniques envoyées à/reçues de l'API — ne JAMAIS traduire, seul le libellé affiché l'est.
const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE']
const STATUS_TONE = { DRAFT: 'neutral', SENT: 'info', PAID: 'verified', OVERDUE: 'danger' }

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const EMPTY_FORM = { number: '', period: '', amount: '', status: INVOICE_STATUSES[0] }

function AddInvoiceForm({ onCreated }) {
  const { t } = useTranslation(['partner', 'common'])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const statusOptions = INVOICE_STATUSES.map((key) => ({ value: key, label: t(`partner:billing.status.${key}`) }))

  const canSubmit = form.number.trim() && form.period.trim() && Number(form.amount) > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(false)
    try {
      const payload = {
        number: form.number.trim(),
        period: form.period.trim(),
        amount: Number(form.amount),
        status: form.status,
      }
      const created = await createInvoice(payload)
      onCreated(created)
      setForm(EMPTY_FORM)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PartnerCard title={t('partner:billing.addForm.title')}>
      <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Input
            id="invoice-number"
            label={<>{t('partner:billing.addForm.numberLabel')}{requiredStar}</>}
            placeholder={t('partner:billing.addForm.numberPlaceholder')}
            value={form.number}
            onChange={set('number')}
            required
          />
          <Input
            id="invoice-period"
            label={<>{t('partner:billing.addForm.periodLabel')}{requiredStar}</>}
            placeholder={t('partner:billing.addForm.periodPlaceholder')}
            value={form.period}
            onChange={set('period')}
            required
          />
          <Input
            id="invoice-amount"
            type="number"
            min="0"
            step="0.01"
            label={<>{t('partner:billing.addForm.amountLabel')}{requiredStar}</>}
            placeholder={t('partner:billing.addForm.amountPlaceholder')}
            value={form.amount}
            onChange={set('amount')}
            required
          />
          <Select
            id="invoice-status"
            label={t('partner:billing.addForm.statusLabel')}
            options={statusOptions}
            value={form.status}
            onChange={set('status')}
          />
        </div>
        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:billing.addForm.error')}
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !canSubmit}>
            {submitting ? t('partner:billing.addForm.submitting') : t('partner:billing.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function Billing() {
  const { t } = useTranslation(['partner', 'common'])
  const [invoices, setInvoices] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setInvoices(undefined)
    setLoadError(false)
    listInvoices()
      .then((rows) => { if (!cancelled) setInvoices(rows) })
      .catch(() => { if (!cancelled) { setInvoices([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleCreated = (created) => setInvoices((prev) => [...(prev ?? []), created])

  const setRowStatus = (id, status) => {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  const changeStatus = async (id, status) => {
    setActingId(id)
    setActionError(false)
    try {
      const updated = await updateInvoice(id, { status })
      setRowStatus(id, updated.status)
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const columns = [
    { key: 'number', label: t('partner:billing.table.number'), render: (row) => row.number },
    { key: 'period', label: t('partner:billing.table.period'), render: (row) => row.period },
    { key: 'amount', label: t('partner:billing.table.amount'), render: (row) => `${Number(row.amount).toLocaleString('fr-MA')} Đh` },
    {
      key: 'status',
      label: t('partner:billing.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{t(`partner:billing.status.${row.status}`)}</Badge>,
    },
    {
      key: 'actions',
      label: t('partner:billing.table.actions'),
      render: (row) => {
        if (row.status === 'DRAFT') {
          return (
            <Button size="sm" onClick={() => changeStatus(row.id, 'SENT')} disabled={actingId === row.id}>
              {t('partner:billing.actions.send')}
            </Button>
          )
        }
        if (row.status === 'SENT') {
          return (
            <Button size="sm" onClick={() => changeStatus(row.id, 'PAID')} disabled={actingId === row.id}>
              {t('partner:billing.actions.markPaid')}
            </Button>
          )
        }
        return null
      },
    },
    {
      key: 'download',
      label: '',
      render: () => (
        <Button variant="ghost" size="sm" iconLeft="download">
          {t('partner:billing.download')}
        </Button>
      ),
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:billing.kicker')} heading={t('partner:billing.heading')}>
      <PartnerCard>
        {loadError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:billing.loadError')}
          </div>
        )}
        {actionError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:billing.actions.actionError')}
          </div>
        )}
        {invoices === undefined ? (
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <Icon name="file-text" size={28} color="var(--text-muted)" />
            <div style={{ font: 'var(--fw-bold) 14.5px var(--font-display)', color: 'var(--text-heading)' }}>
              {t('partner:billing.empty.title')}
            </div>
            <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)', maxWidth: 380 }}>
              {t('partner:billing.empty.hint')}
            </div>
          </div>
        ) : (
          <PartnerTable columns={columns} rows={invoices} emptyMessage={t('partner:billing.empty.title')} />
        )}
      </PartnerCard>
      {invoices !== undefined && <AddInvoiceForm onCreated={handleCreated} />}
    </PartnerScreen>
  )
}
