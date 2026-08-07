import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AmenityChip, Avatar, Badge, Button, Card, Icon, Select, VerifiedBadge, PriceTag } from '../../ds/index.js'
import { createReport, getListing } from '../../services/index.js'

const REPORT_REASONS = ['spam', 'inappropriate', 'fraud', 'harassment', 'other']

function ReportListingAction({ listingId }) {
  const { t } = useTranslation(['web'])
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // 'success' | 'error' | null

  const submit = () => {
    setSubmitting(true)
    setResult(null)
    createReport({ target_type: 'listing', target_id: String(listingId), reason })
      .then(() => { setResult('success'); setOpen(false) })
      .catch(() => setResult('error'))
      .finally(() => setSubmitting(false))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setResult(null) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
          font: 'var(--fw-medium) 12.5px var(--font-body)', color: 'var(--text-muted)',
        }}
      >
        <Icon name="flag" size={14} strokeWidth={2} />
        {t('web:listing.reportCta')}
      </button>
      {open && (
        <Card padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Select
            label={t('web:listing.reportReasonLabel')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={REPORT_REASONS.map((r) => ({ value: r, label: t(`web:listing.reportReason.${r}`) }))}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="accent" onClick={submit} disabled={submitting}>
              {t('web:listing.reportSubmitCta')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              {t('web:listing.reportCancelCta')}
            </Button>
          </div>
        </Card>
      )}
      {result === 'success' && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--green-700)' }}>
          {t('web:listing.reportSuccess')}
        </div>
      )}
      {result === 'error' && (
        <div style={{ font: 'var(--fw-semibold) 12.5px var(--font-body)', color: 'var(--red-600)' }}>
          {t('web:listing.reportError')}
        </div>
      )}
    </div>
  )
}

const DEFAULT_REGLEMENT = [
  { key: 'guests', ok: true },
  { key: 'cleaning', ok: true },
  { key: 'smoking', ok: false },
  { key: 'pets', ok: false },
]

const DEFAULT_PROXIMITE = [{ label: 'Centre-ville', distance: '1 km' }]

const GALLERY_BG = ['var(--gray-200)', 'var(--gray-150)', 'var(--gray-200)', 'var(--gray-150)', 'var(--gray-200)']

export default function ListingDetail() {
  const { t, i18n } = useTranslation(['web', 'common'])
  const { id } = useParams()
  const navigate = useNavigate()
  const [listing, setListing] = useState(undefined)
  const isRtl = i18n.dir() === 'rtl'
  const breadcrumbChevronStyle = isRtl ? { transform: 'scaleX(-1)' } : undefined

  useEffect(() => {
    setListing(undefined)
    getListing(id).then(setListing)
  }, [id])

  if (listing === undefined) {
    return (
      <div style={{ padding: 48, maxWidth: 'var(--container-max)', margin: '0 auto', font: 'var(--fw-medium) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
        {t('common:loading')}
      </div>
    )
  }

  if (listing === null) {
    return (
      <div style={{ padding: 48, maxWidth: 'var(--container-max)', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ font: 'var(--fw-bold) 24px var(--font-display)', color: 'var(--navy-700)', margin: '0 0 12px' }}>{t('web:listing.notFoundTitle')}</h1>
        <Link to="/recherche" style={{ font: 'var(--fw-semibold) var(--fs-body) var(--font-body)', color: 'var(--navy-700)' }}>{t('web:listing.backToSearch')}</Link>
      </div>
    )
  }

  const reglement = listing.reglement?.length ? listing.reglement : DEFAULT_REGLEMENT
  const proximite = listing.proximite?.length ? listing.proximite : DEFAULT_PROXIMITE
  const extraPhotos = Math.max(0, (listing.photos?.length ?? 0) - 5)
  const proximityConnector = proximite[0] ? t('web:listing.proximityConnector', { distance: proximite[0].distance, label: proximite[0].label }) : ''

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '20px 40px 64px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/recherche') }}>{t('web:listing.breadcrumbSearch')}</a>
          <Icon name="chevron-right" size={14} style={breadcrumbChevronStyle} />
          {listing.ville}
          <Icon name="chevron-right" size={14} style={breadcrumbChevronStyle} />
          <span style={{ color: 'var(--text-strong)' }}>{listing.quartier}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, height: 360, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {GALLERY_BG.map((bg, i) => {
            const photo = listing.photos?.[i]
            const isLast = i === GALLERY_BG.length - 1
            return (
              <div
                key={`${i}-${photo ?? 'placeholder'}`}
                style={{
                  position: 'relative',
                  background: photo ? `var(--navy-100) url(${photo}) center/cover no-repeat` : bg,
                }}
              >
                {isLast && extraPhotos > 0 && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,26,56,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: 'var(--fw-bold) var(--fs-sm) var(--font-body)' }}>
                    {t('web:listing.morePhotosOverlay', { count: extraPhotos })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 28, alignItems: 'start' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {listing.verifiee && <VerifiedBadge label={t('web:listing.verifiedLabel')} />}
                {listing.logementGenre && <Badge tone="navy">{listing.logementGenre}</Badge>}
              </div>
              <h1 style={{ margin: 0, font: 'var(--fw-bold) 27px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                {listing.titre} — {listing.quartier}
              </h1>
              <div style={{ font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
                {listing.ville}, {listing.quartier}
                {proximityConnector}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, padding: 18, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              {listing.facts.map((fact) => (
                <div key={fact.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{fact.label}</div>
                  <div style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-body)', color: 'var(--text-strong)' }}>{fact.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.aboutTitle')}</div>
              <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-body)/1.7 var(--font-body)', color: 'var(--text-body)' }}>{listing.description}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.amenitiesTitle')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {listing.equipements.map((eq) => <AmenityChip key={eq}>{eq}</AmenityChip>)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.houseRulesTitle')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {reglement.map((r) => {
                  const label = r.key ? t(`web:listing.houseRules.${r.key}`) : r.label
                  return (
                  <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                    <Icon name={r.ok ? 'check' : 'x'} size={16} strokeWidth={2.6} color={r.ok ? 'var(--green-600)' : 'var(--red-600)'} />
                    {label}
                  </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.flatmatesTitle')}</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {listing.colocataires.map((coloc) => (
                  <div key={coloc.nom} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)' }}>
                    <Avatar name={coloc.nom} src={coloc.avatar} size={38} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--text-strong)' }}>{coloc.nom}</div>
                      {coloc.depuis && <div style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>{t('web:listing.sinceLabel')} {coloc.depuis}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.proximityTitle')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proximite.map((p) => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                    <Icon name="map-pin" size={15} color="var(--gray-500)" />
                    {p.label}
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{p.distance}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.locationTitle')}</div>
              <div style={{ height: 220, borderRadius: 'var(--radius-md)', background: 'var(--gray-150)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 130, height: 130, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'rgba(27,42,82,.14)', border: '1px dashed var(--navy-300)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 14, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'var(--navy-700)', border: '3px solid #fff', boxShadow: 'var(--shadow-sm)' }} />
              </div>
              <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
                {t('web:listing.locationApproxNote')}
              </div>
            </div>
          </section>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 20 }}>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <PriceTag amount={listing.prixMad} period={t('web:listing.priceUnitPeriod')} size="lg" />
                {listing.matchPct != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--green-50)' }}>
                    <div style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-body)', color: 'var(--green-700)' }}>{t('web:listing.matchPercentLabel', { pct: listing.matchPct })}</div>
                    <div style={{ font: 'var(--fw-regular) var(--fs-xs)/1.5 var(--font-body)', color: 'var(--text-body)' }}>
                      {t('web:listing.matchDetailsBase')}{proximityConnector}
                    </div>
                  </div>
                )}
                <Button variant="accent" fullWidth onClick={() => navigate(`/espace/candidature?listingId=${id}`)}>{t('web:listing.applyCta')}</Button>
                <Button variant="secondary" fullWidth>{t('web:listing.contactRoommateCta')}</Button>
                <div style={{ font: 'var(--fw-regular) var(--fs-xs)/1.55 var(--font-body)', color: 'var(--text-muted)' }}>
                  {t('web:listing.applicationRequirementNote')}
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Avatar name="Hajar B." size={40} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ font: 'var(--fw-bold) var(--fs-body) var(--font-body)', color: 'var(--text-strong)' }}>Hajar B. — {t('web:listing.ownerRoleLabel')}</div>
                  <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>{t('web:listing.ownerTrustNote')}</div>
                </div>
              </div>
            </Card>
            <ReportListingAction listingId={id} />
          </aside>
        </div>
      </div>
    </div>
  )
}
