import { useState } from 'react'
import { Button } from '../../ds/index.js'
import StepBien from './publier/StepBien.jsx'
import StepLogement from './publier/StepLogement.jsx'
import StepPrix from './publier/StepPrix.jsx'
import StepDispoPhotos from './publier/StepDispoPhotos.jsx'

// Validation bloquante par étape — utilisée par le wizard avant d'autoriser « Suivant ».
// eslint-disable-next-line react-refresh/only-export-components
export function validateStep(step, f) {
  const errs = {}
  if (step === 0) { if (!f.city) errs.city = true; if (!f.property_type) errs.property_type = true }
  if (step === 1) { if (!f.title) errs.title = true; if (!f.bed_type) errs.bed_type = true; if (!f.housing_gender) errs.housing_gender = true }
  if (step === 2) { if (!(Number(f.rent) > 0)) errs.rent = true }
  return errs
}

const STEP_TITLES = ['Le bien', 'Le logement', 'Prix & charges', 'Disponibilité & photos']
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
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

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

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) var(--fs-h1) var(--font-display)', color: 'var(--text-strong)' }}>
            Déposer une annonce
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
            {STEP_TITLES[step]}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--text-muted)' }}>
            <span>Étape {step + 1}/{STEP_COMPONENTS.length}</span>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <Button variant="secondary" onClick={goBack} disabled={step === 0}>Retour</Button>
          {isLast ? (
            // Orchestration réelle (create → upload → media → submit) branchée en tâche 3.4.
            <Button disabled title="Publication disponible prochainement">Publier</Button>
          ) : (
            <Button onClick={goNext}>Suivant</Button>
          )}
        </div>
      </div>
    </div>
  )
}
