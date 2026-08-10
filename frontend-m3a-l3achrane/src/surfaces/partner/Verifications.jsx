import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Select } from '../../ds/index.js'
import { approveVerification, createVerification, listAffilies, listVerifications, rejectVerification } from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'verified', REJECTED: 'danger' }

// Statut backend prioritaire (Verification.to_dict), fallback vers l'ancien champ mock
// français — pour ne pas casser un jeu de données mock non encore migré.
const rowStatus = (row) => row.status ?? row.statut

// Valeurs techniques envoyées à l'API — ne JAMAIS traduire, seul le libellé affiché l'est.
const DOC_TYPES = ['CIN', 'CARTE_ETUDIANT', 'ATTESTATION_EMPLOYEUR', 'AUTRE']

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

function AddVerificationForm({ affiliates, onCreated }) {
  const { t } = useTranslation(['partner', 'common'])
  const [affilieId, setAffilieId] = useState(affiliates[0]?.id ?? '')
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  const affiliateOptions = affiliates.map((a) => ({ value: String(a.id), label: a.full_name ?? a.nom }))
  const docTypeOptions = DOC_TYPES.map((key) => ({ value: key, label: t(`partner:verifications.docTypes.${key}`) }))

  const submit = async (e) => {
    e.preventDefault()
    if (!affilieId || !docType) return
    setSubmitting(true)
    setError(false)
    try {
      const created = await createVerification({ affilie_id: affilieId, doc_type: docType })
      onCreated(created)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (affiliates.length === 0) {
    return (
      <PartnerCard title={t('partner:verifications.addForm.title')}>
        <div style={{ padding: '16px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
          {t('partner:verifications.addForm.noAffiliates')}
        </div>
      </PartnerCard>
    )
  }

  return (
    <PartnerCard title={t('partner:verifications.addForm.title')}>
      <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Select
            id="verification-affilie"
            label={<>{t('partner:verifications.addForm.affiliateLabel')}{requiredStar}</>}
            options={affiliateOptions}
            value={affilieId}
            onChange={(e) => setAffilieId(e.target.value)}
            required
          />
          <Select
            id="verification-doc-type"
            label={<>{t('partner:verifications.addForm.docTypeLabel')}{requiredStar}</>}
            options={docTypeOptions}
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            required
          />
        </div>
        {error && (
          <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:verifications.addForm.error')}
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !affilieId || !docType}>
            {submitting ? t('partner:verifications.addForm.submitting') : t('partner:verifications.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function Verifications() {
  const { t } = useTranslation(['partner', 'common'])
  const [verifications, setVerifications] = useState(undefined) // undefined = loading
  const [affiliates, setAffiliates] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setVerifications(undefined)
    setLoadError(false)
    Promise.all([listVerifications(), listAffilies()])
      .then(([verifs, affs]) => {
        if (cancelled) return
        setVerifications(verifs)
        setAffiliates(affs)
      })
      .catch(() => { if (!cancelled) { setVerifications([]); setLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleCreated = (created) => setVerifications((prev) => [...(prev ?? []), created])

  const setRowStatus = (id, status) => {
    setVerifications((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)))
  }

  const runAction = async (id, action) => {
    setActingId(id)
    setActionError(false)
    try {
      const updated = await action(id)
      setRowStatus(id, rowStatus(updated))
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const affiliateName = (row) => {
    if (row.etudiant) return row.etudiant
    const affilie = affiliates.find((a) => String(a.id) === String(row.affilie_id))
    return affilie ? (affilie.full_name ?? affilie.nom) : row.affilie_id
  }

  const documentLabel = (row) => {
    if (row.document) return row.document
    return row.doc_type ? t(`partner:verifications.docTypes.${row.doc_type}`) : '—'
  }

  const dateLabel = (row) => {
    const iso = row.submitted_at ?? row.created_at
    return iso ? iso.slice(0, 10) : (row.date ?? '—')
  }

  const columns = [
    { key: 'affiliate', label: t('partner:verifications.table.affiliate'), render: affiliateName },
    { key: 'document', label: t('partner:verifications.table.document'), render: documentLabel },
    {
      key: 'status',
      label: t('partner:verifications.table.status'),
      render: (row) => <Badge tone={STATUS_TONE[rowStatus(row)]}>{t(`partner:verifications.status.${rowStatus(row)}`)}</Badge>,
    },
    { key: 'date', label: t('partner:verifications.table.date'), render: dateLabel },
    {
      key: 'actions',
      label: t('partner:verifications.table.actions'),
      render: (row) => (
        rowStatus(row) === 'PENDING' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => runAction(row.id, approveVerification)} disabled={actingId === row.id}>
              {t('partner:verifications.actions.approve')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => runAction(row.id, rejectVerification)} disabled={actingId === row.id}>
              {t('partner:verifications.actions.reject')}
            </Button>
          </div>
        ) : null
      ),
    },
  ]

  return (
    <PartnerScreen kicker={t('partner:verifications.kicker')} heading={t('partner:verifications.heading')}>
      <PartnerCard>
        {loadError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:verifications.loadError')}
          </div>
        )}
        {actionError && (
          <div style={{ padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
            {t('partner:verifications.actions.actionError')}
          </div>
        )}
        {verifications === undefined ? (
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        ) : (
          <PartnerTable columns={columns} rows={verifications} emptyMessage={t('partner:verifications.noResults')} />
        )}
      </PartnerCard>
      {verifications !== undefined && <AddVerificationForm affiliates={affiliates} onCreated={handleCreated} />}
    </PartnerScreen>
  )
}
