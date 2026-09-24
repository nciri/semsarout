import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Avatar, Icon } from '../../ds/index.js'
import { createReview, getCurrentProfile, getListing, getMyLeases, listReceivedReviews, listWrittenReviewLeases } from '../../services/index.js'

// Critères notés, mêmes clés que le service trust-safety ; les libellés vivent en i18n.
const CRITERIA = ['respect', 'proprete', 'communication', 'conformite']
// Délai de publication en double aveugle, aligné sur REVIEW_BLIND_DAYS côté service.
const BLIND_DAYS = 14

// L'autre partie du bail : le bailleur si je suis locataire, le locataire sinon.
const counterpartOf = (lease, me) => (lease.tenant_user_id === me ? lease.owner_id : lease.tenant_user_id)

function StarPicker({ value, onChange }) {
  const { t } = useTranslation(['web', 'common'])
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={t('web:reviews.starAriaLabel', { count: n })}
          style={{
            width: 34, height: 34, border: 0, background: 'transparent',
            fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
            color: n <= value ? 'var(--gold-500)' : 'var(--gray-200)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function Avis() {
  const { t, i18n } = useTranslation(['web', 'common'])
  const [scores, setScores] = useState(() => Object.fromEntries(CRITERIA.map((k) => [k, 5])))
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [me, setMe] = useState(null)
  const [leases, setLeases] = useState([])
  const [writtenLeaseIds, setWrittenLeaseIds] = useState([])
  const [received, setReceived] = useState([])
  const [listingTitle, setListingTitle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getCurrentProfile(), getMyLeases(), listWrittenReviewLeases(), listReceivedReviews()])
      .then(([profile, myLeases, written, reviews]) => {
        if (cancelled) return
        setMe(profile?.id ?? null)
        setLeases(Array.isArray(myLeases) ? myLeases : (myLeases?.leases ?? []))
        setWrittenLeaseIds(written)
        setReceived(reviews)
      })
      .catch(() => { if (!cancelled) setError(t('web:reviews.loadError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t])

  // Séjours terminés que je n'ai pas encore évalués ; on note le plus récent d'abord.
  const pending = useMemo(() => leases
    .filter((l) => l.status === 'ended' && !writtenLeaseIds.includes(String(l.id)))
    .sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? ''))),
  [leases, writtenLeaseIds])
  const lease = pending[0] ?? null

  useEffect(() => {
    let cancelled = false
    if (!lease?.listing_id) { setListingTitle(null); return undefined }
    getListing(lease.listing_id)
      .then((l) => { if (!cancelled) setListingTitle(l?.titre ?? l?.title ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [lease])

  const submit = async () => {
    if (!lease || me == null) return
    setSending(true)
    setError(null)
    try {
      await createReview({
        leaseId: lease.id,
        subjectId: counterpartOf(lease, me),
        criteria: scores,
        comment,
      })
      setSubmitted(true)
      setComment('')
      setWrittenLeaseIds((ids) => [...ids, String(lease.id)])
      setReceived(await listReceivedReviews())
    } catch {
      setError(t('web:reviews.submitError'))
    } finally {
      setSending(false)
    }
  }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }) : '')

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, font: 'var(--fw-bold) 26px/1.2 var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
          {t('web:reviews.title')}
        </h1>
        <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
          {lease
            ? t('web:reviews.subtitle', {
                partner: t('web:reviews.counterpart', { id: me != null ? counterpartOf(lease, me) : '—' }),
                listing: listingTitle ?? t('web:reviews.listingFallback', { id: lease.listing_id }),
                date: fmtDate(lease.end_date),
              })
            : t('web:reviews.noStayToReview')}
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--navy-50)',
        border: '1px solid var(--navy-100)', borderRadius: 12, padding: '14px 16px',
        font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)',
      }}>
        <Icon name="info" size={16} color="var(--navy-600)" style={{ marginTop: 2, flex: 'none' }} />
        <span>
          {t('web:reviews.publishNotice')}
        </span>
      </div>

      <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {CRITERIA.map((key) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>{t(`web:reviews.criteria.${key}`)}</div>
            <StarPicker
              value={scores[key]}
              onChange={(n) => setScores((s) => ({ ...s, [key]: n }))}
            />
          </div>
        ))}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
            {t('web:reviews.commentLabel')}
          </span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('web:reviews.commentPlaceholder')}
            style={{
              padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8,
              font: 'var(--fw-regular) var(--fs-body) var(--font-body)', outline: 'none', resize: 'vertical',
            }}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="accent" onClick={submit} disabled={!lease || sending} style={{ alignSelf: 'flex-start' }}>
            {submitted ? t('web:reviews.submittedCta') : t('web:reviews.submitCta')}
          </Button>
          {error && <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>{error}</span>}
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ font: 'var(--fw-bold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
          {t('web:reviews.receivedTitle')}
        </div>

        {!loading && received.length === 0 && (
          <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('web:reviews.receivedEmpty')}
          </div>
        )}
        {received.map((r) => {
          const author = r.author_name ?? t('web:reviews.counterpart', { id: r.author_id })
          return (
          <Card key={r.id} padding={0} style={{ padding: '16px 18px', display: 'flex', gap: 14 }}>
            <Avatar name={author} size={38} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-display)', color: 'var(--text-heading)' }}>{author}</span>
                <span style={{ color: 'var(--gold-500)', font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', flex: 'none' }}>
                  {'★'.repeat(r.stars)}
                </span>
              </div>
              <div style={{ font: 'var(--fw-regular) var(--fs-sm)/1.55 var(--font-body)', color: 'var(--text-body)' }}>{r.comment}</div>
              <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
                {t('web:reviews.publishedOn', { date: fmtDate(r.created_at) })}
              </div>
            </div>
          </Card>
          )
        })}

        {pending.length > 0 && (
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px',
            border: '1px dashed var(--border-default)', borderRadius: 12,
            font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)',
          }}>
            <Icon name="clock" size={16} style={{ flex: 'none' }} />
            {t('web:reviews.pendingNotice', { count: pending.length, days: BLIND_DAYS })}
          </div>
        )}
      </div>
    </div>
  )
}
