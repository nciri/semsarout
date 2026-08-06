import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AmenityChip, Avatar, Button, Card, Icon, PriceTag, VerifiedBadge } from '../../ds/index.js'
import { getListing } from '../../services/index.js'

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

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100%' }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)', marginBottom: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/recherche') }}>{t('web:listing.breadcrumbSearch')}</a>
          <Icon name="chevron-right" size={14} style={breadcrumbChevronStyle} />
          {listing.ville}
          <Icon name="chevron-right" size={14} style={breadcrumbChevronStyle} />
          <span style={{ color: 'var(--text-strong)' }}>{listing.quartier}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 28 }}>
          <div>
            <div style={{ height: 320, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(150deg,var(--navy-200),var(--navy-400))', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)' }}>
              <Icon name="image" size={40} />
              <div style={{ position: 'absolute', insetInlineEnd: 14, bottom: 14 }}><Button variant="secondary" size="sm" iconLeft="images">{t('web:listing.photosCta', { count: listing.photos.length })}</Button></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {listing.photos.map((photo, i) => <div key={`${i}-${photo}`} style={{ flex: 1, height: 56, borderRadius: 'var(--radius-sm)', background: 'var(--navy-100)' }} />)}
            </div>

            <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ font: 'var(--fw-bold) 26px var(--font-display)', color: 'var(--navy-700)', margin: '0 0 8px' }}>{listing.titre} — {listing.quartier}</h1>
                <PriceTag amount={listing.prixMad} size="lg" />
              </div>
              {listing.verifiee && <VerifiedBadge label={t('web:listing.verifiedLabel')} />}
            </div>
            <div style={{ display: 'flex', gap: 18, margin: '16px 0', flexWrap: 'wrap', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
              {listing.facts.map((fact) => (
                <span key={fact.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="check" size={16} color="var(--gray-500)" />
                  {fact.label} : {fact.value}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {listing.equipements.map((eq) => <AmenityChip key={eq}>{eq}</AmenityChip>)}
            </div>
            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '0 0 8px' }}>{t('web:listing.aboutTitle')}</h3>
            <p style={{ font: 'var(--fw-regular) var(--fs-body)/1.6 var(--font-body)', color: 'var(--text-body)', margin: '0 0 8px' }}>{listing.description}</p>

            <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', margin: '26px 0 12px' }}>{t('web:listing.flatmatesTitle')}</h3>
            <div style={{ display: 'flex', gap: 24 }}>
              {listing.colocataires.map((coloc) => (
                <Avatar key={coloc.nom} name={coloc.nom} src={coloc.avatar} showLabel />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card style={{ position: 'sticky', top: 20 }}>
              <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--navy-700)', marginBottom: 14 }}>{t('web:listing.contactTitle')}</div>
              <Button variant="primary" fullWidth iconLeft="send" style={{ marginBottom: 10 }}>{t('web:listing.sendMessage')}</Button>
              <Button variant="secondary" fullWidth iconLeft="heart">{t('web:listing.addFavorite')}</Button>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '18px 0' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <Icon name="lock" size={20} color="var(--green-600)" />
                <div>
                  <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-display)', color: 'var(--text-strong)' }}>{t('web:listing.securePaymentTitle')}</div>
                  <div style={{ font: 'var(--fw-regular) var(--fs-xs)/1.45 var(--font-body)', color: 'var(--text-muted)', marginTop: 2 }}>{t('web:listing.securePaymentBody')}</div>
                  <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', display: 'inline-block', marginTop: 6 }}>{t('web:listing.learnMore')}</a>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
