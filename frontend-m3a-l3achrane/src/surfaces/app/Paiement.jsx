import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Icon, Input, PriceTag } from '../../ds/index.js'
import { paiementSequestre } from '../../data/paiementSequestre.js'
import { getListing, getMyLease } from '../../services/index.js'

// Dérive les 4 étapes du design (fonds déposés / contrat / état des lieux / fonds libérés)
// depuis l'état réel du bail. Le domaine bail/paiement ne modélise que la caution/le loyer
// (statuts pending→escrowed→released|refunded) : « contrat signé » est déduit du statut du
// bail (`active`), « état des lieux » n'a pas de backing data et sert de palier intermédiaire
// entre caution déposée et fonds libérés.
function deriveEtapes(lease) {
  const depositStatus = lease.payments?.find((p) => p.type === 'deposit')?.status ?? 'pending'
  const depotFait = ['escrowed', 'released', 'refunded'].includes(depositStatus)
  const liberationFait = depositStatus === 'released'
  const contratFait = depotFait && lease.status === 'active'
  let currentIndex = 0
  if (liberationFait) currentIndex = 4
  else if (contratFait) currentIndex = 2
  else if (depotFait) currentIndex = 1
  return ['depot', 'contrat', 'etat_lieux', 'liberation'].map((id, i) => ({
    id,
    statut: i < currentIndex ? 'fait' : i === currentIndex ? 'en_cours' : 'attente',
    mark: i < currentIndex ? '✓' : String(i + 1),
  }))
}

function buildLignes(lease) {
  return [
    { id: 'loyer', montant: Math.round(lease.rent_amount) },
    { id: 'charges', montant: 0 },
    { id: 'caution', montant: Math.round(lease.deposit_amount) },
  ]
}

function fmtEntree(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

const STATUT_STYLE = {
  fait: { background: 'var(--green-500)', color: '#fff' },
  en_cours: { background: 'var(--navy-700)', color: '#fff' },
  attente: { background: 'var(--gray-150)', color: 'var(--text-muted)' },
}

function EtapeSequestre({ etape, isLast }) {
  const { t } = useTranslation(['app', 'common'])
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: isLast ? 'none' : 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: 'var(--fw-extrabold) var(--fs-sm) var(--font-display)',
            ...STATUT_STYLE[etape.statut],
          }}
        >
          {etape.mark}
        </div>
        <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', color: 'var(--text-heading)', textAlign: 'center', maxWidth: 90 }}>
          {t(`app:paiement.steps.${etape.id}`)}
        </div>
      </div>
      {!isLast && (
        <div
          style={{
            flex: 1,
            height: 2,
            background: etape.statut === 'fait' ? 'var(--green-500)' : 'var(--gray-200)',
            margin: '0 6px 22px',
          }}
        />
      )}
    </div>
  )
}

export default function Paiement() {
  const { t, i18n } = useTranslation(['app', 'common'])
  const [lease, setLease] = useState(null)
  const [listingTitre, setListingTitre] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [mode, setMode] = useState('carte')
  const [confirmeEspeces, setConfirmeEspeces] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getMyLease()
      .then(async (data) => {
        if (cancelled) return
        setLease(data)
        if (data?.listing_id) {
          try {
            const listing = await getListing(data.listing_id)
            if (!cancelled) setListingTitre(listing?.titre ?? '')
          } catch {
            // titre optionnel : le bail reste affichable sans lui
          }
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: '34px 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-muted)' }}>
          {t('app:paiement.loading')}
        </div>
      </div>
    )
  }

  // Pas de bail réel (utilisateur de démo sans bail, ou service indisponible) : repli mock
  // pour garder l'écran illustratif plutôt que vide.
  const usingMock = loadError || !lease
  const { annonce, etapes, lignes, total } = usingMock
    ? paiementSequestre
    : {
        annonce: { titre: listingTitre || t('app:paiement.leaseFallbackTitle', { id: lease.listing_id }),
                  entree: fmtEntree(lease.start_date, i18n.language) },
        etapes: deriveEtapes(lease),
        lignes: buildLignes(lease),
        total: Math.round(lease.rent_amount) + Math.round(lease.deposit_amount),
      }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '34px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {t('app:paiement.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
            {t('app:paiement.subtitle', { titre: annonce.titre, entree: annonce.entree })}
          </p>
        </div>

        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px',
            background: 'var(--navy-50)', border: '1px solid var(--navy-100)', borderRadius: 10,
          }}
        >
          <Icon name="info" size={16} strokeWidth={2.4} style={{ color: 'var(--navy-700)', flex: 'none', marginTop: 1 }} />
          <div style={{ font: 'var(--fw-regular) 12.5px var(--font-body)', color: 'var(--text-body)', lineHeight: 1.5 }}>
            {t('app:paiement.demoBanner')}
          </div>
        </div>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
            {t('app:paiement.escrowStatusTitle')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {etapes.map((etape, i) => (
              <EtapeSequestre key={etape.id} etape={etape} isLast={i === etapes.length - 1} />
            ))}
          </div>
          <div
            style={{
              background: 'var(--navy-50)',
              border: '1px solid var(--navy-100)',
              borderRadius: 10,
              padding: '14px 16px',
              font: 'var(--fw-regular) var(--fs-sm) var(--font-body)',
              color: 'var(--text-body)',
              lineHeight: 1.55,
            }}
          >
            {t('app:paiement.escrowNotice')}
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
              {t('app:paiement.amountDetailTitle')}
            </div>
            {lignes.map((ligne) => (
              <div key={ligne.id} style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-regular) var(--fs-body) var(--font-body)', color: 'var(--text-body)' }}>
                <span>{t(`app:paiement.lines.${ligne.id}`)}</span>
                <PriceTag amount={ligne.montant} period={null} size="sm" />
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
                {t('app:paiement.totalLabel')}
              </span>
              <PriceTag amount={total} period={null} size="md" />
            </div>
          </Card>

          <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ font: 'var(--fw-extrabold) var(--fs-body-lg) var(--font-display)', color: 'var(--text-heading)' }}>
              {t('app:paiement.paymentMethodTitle')}
            </div>
            <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 9, padding: 4, gap: 4 }}>
              <button
                onClick={() => setMode('carte')}
                style={{
                  flex: 1,
                  padding: 9,
                  border: 0,
                  borderRadius: 6,
                  background: mode === 'carte' ? 'var(--white)' : 'transparent',
                  color: mode === 'carte' ? 'var(--text-heading)' : 'var(--text-muted)',
                  font: `${mode === 'carte' ? 'var(--fw-bold)' : 'var(--fw-semibold)'} 13.5px var(--font-body)`,
                  boxShadow: mode === 'carte' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {t('app:paiement.cardTab')}
              </button>
              <button
                onClick={() => setMode('especes')}
                style={{
                  flex: 1,
                  padding: 9,
                  border: 0,
                  borderRadius: 6,
                  background: mode === 'especes' ? 'var(--white)' : 'transparent',
                  color: mode === 'especes' ? 'var(--text-heading)' : 'var(--text-muted)',
                  font: `${mode === 'especes' ? 'var(--fw-bold)' : 'var(--fw-semibold)'} 13.5px var(--font-body)`,
                  boxShadow: mode === 'especes' ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {t('app:paiement.cashTab')}
              </button>
            </div>

            {mode === 'carte' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input placeholder={t('app:paiement.cardNumberPlaceholder')} icon="credit-card" autoComplete="off" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Input placeholder={t('app:paiement.expiryPlaceholder')} containerStyle={{ flex: 1 }} autoComplete="off" />
                  <Input placeholder={t('app:paiement.cvcPlaceholder')} containerStyle={{ flex: 1 }} autoComplete="off" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
                  <Icon name="shield-check" size={14} />
                  {t('app:paiement.securePaymentNotice')}
                </div>
                <Button variant="accent" fullWidth>
                  {t('app:paiement.payButton', { amount: new Intl.NumberFormat('fr-MA').format(total).replace(/[\u202f,]/g, ' ') })}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)', lineHeight: 1.55 }}>
                  {t('app:paiement.cashNotice')}
                </p>
                {confirmeEspeces && (
                  <Badge tone="verified" icon="check">{t('app:paiement.cashConfirmedBadge')}</Badge>
                )}
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={confirmeEspeces}
                  onClick={() => setConfirmeEspeces(true)}
                  style={{ borderColor: 'var(--navy-700)', background: 'var(--navy-50)', color: 'var(--navy-700)' }}
                >
                  {confirmeEspeces ? t('app:paiement.cashReceiptConfirmed') : t('app:paiement.confirmCashReceipt')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
