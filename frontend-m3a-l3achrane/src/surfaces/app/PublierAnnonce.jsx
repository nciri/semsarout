import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ds/index.js'
import StepBien from './publier/StepBien.jsx'
import StepLogement from './publier/StepLogement.jsx'
import StepPrix from './publier/StepPrix.jsx'
import StepDispoPhotos from './publier/StepDispoPhotos.jsx'
import { publish } from './publier/orchestrate.mjs'
import { createListing, uploadPhoto, addListingMedia, submitListing } from '../../services/index.js'

// Validation bloquante par étape — utilisée par le wizard avant d'autoriser « Suivant ».
// eslint-disable-next-line react-refresh/only-export-components
export function validateStep(step, f) {
  const errs = {}
  if (step === 0) { if (!f.city) errs.city = true; if (!f.property_type) errs.property_type = true }
  if (step === 1) { if (!f.title) errs.title = true; if (!f.bed_type) errs.bed_type = true; if (!f.housing_gender) errs.housing_gender = true }
  if (step === 2) { if (!(Number(f.rent) > 0)) errs.rent = true }
  return errs
}

const STEP_TITLE_KEYS = ['bien', 'logement', 'prix', 'dispoPhotos']
const STEP_COMPONENTS = [StepBien, StepLogement, StepPrix, StepDispoPhotos]

function initialForm() {
  return {
    // Bien
    city: '', neighborhood: '', address: '', property_type: '', floor: '', area_m2: '', amenities: {},
    // Logement
    title: '', description: '', bed_type: '', housing_gender: 'FEMININ', furnished: false, capacity: 1,
    // Prix & charges
    rent: '', currency: 'MAD', charges_included: false, charges_amount: '', deposit: '',
    is_condo: true, condo_fees: '',
    // Disponibilité & photos
    available_from: '', duration_min_months: '', duration_max_months: '',
    photos: [],
  }
}

export default function PublierAnnonce() {
  const { t } = useTranslation(['app'])
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [published, setPublished] = useState(false)

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handlePublish = async () => {
    setPublishing(true)
    setPublishError('')
    try {
      await publish(form, { createListing, uploadPhoto, addListingMedia, submitListing })
      setPublished(true)
    } catch {
      setPublishError(t('app:publier.errors.publishFailed'))
    } finally {
      setPublishing(false)
    }
  }

  const goNext = () => {
    const errs = validateStep(step, form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setErrors({})
    setStep((s) => Math.min(s + 1, STEP_COMPONENTS.length - 1))
  }

  const goBack = () => {
    setErrors({})
    setStep((s) => Math.max(s - 1, 0))
  }

  const StepComponent = STEP_COMPONENTS[step]
  const isLast = step === STEP_COMPONENTS.length - 1

  if (published) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 28px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('app:publier.success.title')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
            {t('app:publier.success.text')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            {t('app:publier.pageTitle')}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
            {t(`app:publier.steps.${STEP_TITLE_KEYS[step]}`)}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
            <span>{t('app:publier.stepIndicator', { current: step + 1, total: STEP_COMPONENTS.length })}</span>
          </div>
          <div style={{ height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--gray-100)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', width: `${((step + 1) / STEP_COMPONENTS.length) * 100}%`,
                background: 'var(--brand-primary)', transition: 'width var(--dur-fast) var(--ease-standard)',
              }}
            />
          </div>
        </div>

        <StepComponent form={form} errors={errors} update={update} />

        {isLast && publishError && (
          <p style={{ margin: 0, font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--red-600)' }}>
            {publishError}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <Button variant="secondary" onClick={goBack} disabled={step === 0 || publishing}>{t('app:publier.actions.back')}</Button>
          {isLast ? (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? t('app:publier.actions.publishing') : t('app:publier.actions.publish')}
            </Button>
          ) : (
            <Button onClick={goNext}>{t('app:publier.actions.next')}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
