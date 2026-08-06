import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import {
  FiCheck, FiCheckCircle, FiArrowRight, FiArrowLeft, FiHome, FiCamera,
  FiFileText, FiDollarSign, FiClipboard, FiUpload, FiTrash2, FiUser,
  FiTrendingUp, FiAlertCircle, FiEdit2, FiClock, FiEye
} from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import api from '../services/api'
import DirIcon from '../components/common/DirIcon'
import { formatPrice, DIRHAM_SYMBOL } from '../utils/currency'
import { PROPERTY_TYPES, FEATURES, MOROCCAN_CITIES, DOC_TYPES } from '../constants/property'

const STORAGE_KEY = 'sell-wizard-v1'

const STEPS = [
  { key: 'bien', icon: FiHome },
  { key: 'prix', icon: FiDollarSign },
  { key: 'photos', icon: FiCamera },
  { key: 'documents', icon: FiFileText },
  { key: 'recap', icon: FiClipboard }
]

// Clés FR utilisées uniquement pour retrouver la clé de traduction du libellé
// (public:sellProperty.features.<key>) — la valeur elle-même reste celle
// envoyée à l'API et ne change pas.
const FEATURE_LABEL_KEYS = {
  parking: 'parking',
  garage: 'garage',
  jardin: 'jardin',
  terrasse: 'terrasse',
  balcon: 'balcon',
  piscine: 'piscine',
  ascenseur: 'ascenseur',
  gardien: 'gardien',
  climatisation: 'climatisation',
  chauffage: 'chauffage',
  'meublé': 'meuble',
  'cuisine équipée': 'cuisineEquipee',
  cave: 'cave',
  'vue mer': 'vueMer',
  'vue montagne': 'vueMontagne',
  duplex: 'duplex'
}

const EMPTY_FORM = {
  property_type: '',
  city: '',
  neighborhood: '',
  address: '',
  surface: '',
  rooms: '',
  bedrooms: '',
  bathrooms: '',
  floor: '',
  total_floors: '',
  construction_year: '',
  features: [],
  description: '',
  desired_price: '',
  photos: [],
  documents: {},
  wants_pro_photos: false
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    return { ...EMPTY_FORM, ...saved.form, __step: saved.step || 0 }
  } catch {
    return null
  }
}

function SellProperty() {
  const { t } = useTranslation(['public', 'common'])
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  const saved = loadSaved()
  const [step, setStep] = useState(saved?.__step ?? 0)
  const [form, setForm] = useState(() => {
    if (!saved) return EMPTY_FORM
    const { __step, ...rest } = saved
    return rest
  })
  const [stepError, setStepError] = useState('')
  const [estimation, setEstimation] = useState(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  // Persistance : survivre à la création de compte en cours de parcours
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, step }))
  }, [form, step])

  const update = (patch) => {
    setStepError('')
    setForm((f) => ({ ...f, ...patch }))
  }

  const toggleFeature = (value) => {
    update({
      features: form.features.includes(value)
        ? form.features.filter((v) => v !== value)
        : [...form.features, value]
    })
  }

  /* ---------- Validation par étape ---------- */
  const validateStep = (idx) => {
    if (idx === 0) {
      if (!form.property_type) return t('public:sellProperty.errors.chooseType')
      if (!form.city) return t('public:sellProperty.errors.cityRequired')
      if (!form.surface || Number(form.surface) <= 0) return t('public:sellProperty.errors.surfaceRequired')
    }
    if (idx === 1) {
      if (!form.desired_price || Number(form.desired_price) <= 0) return t('public:sellProperty.errors.priceRequired')
    }
    if (idx === 2) {
      if (!isAuthenticated) return t('public:sellProperty.errors.accountRequiredPhotos')
      if (form.photos.length === 0 && !form.wants_pro_photos) {
        return t('public:sellProperty.errors.photosRequired')
      }
    }
    return ''
  }

  const goTo = (idx) => {
    // On ne peut avancer qu'après validation des étapes précédentes
    for (let i = 0; i < idx; i++) {
      const err = validateStep(i)
      if (err) {
        setStep(i)
        setStepError(err)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
    setStepError('')
    setStep(idx)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const next = () => goTo(step + 1)
  const prev = () => { setStepError(''); setStep((s) => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  /* ---------- Estimation ---------- */
  const fetchEstimation = useCallback(async () => {
    if (!form.city || !form.property_type || !form.surface) return
    setIsEstimating(true)
    try {
      const { data } = await api.post('/estimate', {
        city: form.city,
        property_type: form.property_type,
        surface: Number(form.surface)
      })
      setEstimation(data)
      if (data.available && !form.desired_price) {
        setForm((f) => ({ ...f, desired_price: String(data.estimate) }))
      }
    } catch {
      setEstimation({ available: false })
    } finally {
      setIsEstimating(false)
    }
  }, [form.city, form.property_type, form.surface, form.desired_price])

  useEffect(() => {
    if (step === 1 && !estimation) fetchEstimation()
  }, [step, estimation, fetchEstimation])

  /* ---------- Uploads ---------- */
  const uploadFile = async (file, kind) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const { data } = await api.post('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  }

  const onPhotosSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setStepError('')
    try {
      const uploaded = []
      for (const file of files) {
        const data = await uploadFile(file, 'photo')
        uploaded.push({ url: data.url, original_name: data.original_name })
      }
      update({ photos: [...form.photos, ...uploaded] })
    } catch (err) {
      setStepError(err.response?.data?.error || t('public:sellProperty.errors.uploadPhotoFailed'))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const onDocumentSelected = async (docType, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStepError('')
    try {
      const data = await uploadFile(file, 'document')
      update({
        documents: {
          ...form.documents,
          [docType]: { file_id: data.file_id, original_name: data.original_name }
        }
      })
    } catch (err) {
      setStepError(err.response?.data?.error || t('public:sellProperty.errors.uploadDocumentFailed'))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  /* ---------- Soumission ---------- */
  const submit = async () => {
    if (!consent) {
      setStepError(t('public:sellProperty.errors.consentRequired'))
      return
    }
    setIsSubmitting(true)
    setStepError('')
    try {
      const toInt = (v) => (v === '' || v === null ? undefined : parseInt(v, 10))
      const { data } = await api.post('/sale-requests', {
        property: {
          property_type: form.property_type,
          city: form.city,
          neighborhood: form.neighborhood || undefined,
          address: form.address || undefined,
          surface: Number(form.surface),
          rooms: toInt(form.rooms),
          bedrooms: toInt(form.bedrooms),
          bathrooms: toInt(form.bathrooms),
          floor: toInt(form.floor),
          total_floors: toInt(form.total_floors),
          construction_year: toInt(form.construction_year),
          features: form.features,
          description: form.description || undefined
        },
        desired_price: Number(form.desired_price),
        photos: form.photos.map((p) => p.url),
        documents: Object.entries(form.documents).map(([doc_type, d]) => ({
          doc_type,
          file_id: d.file_id,
          original_name: d.original_name
        })),
        wants_pro_photos: form.wants_pro_photos
      })
      localStorage.removeItem(STORAGE_KEY)
      setResult(data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setStepError(err.response?.data?.error || t('public:sellProperty.errors.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const typeLabel = form.property_type ? t(`public:sellProperty.propertyTypes.${form.property_type}`) : undefined

  /* ================= Écran de succès ================= */
  if (result) {
    return (
      <div className="min-h-[calc(100vh-200px)] py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">
            {t('public:sellProperty.successScreen.title')}
          </h1>
          <p className="text-gray-600 mb-2">
            {t('public:sellProperty.successScreen.referenceLabel')}{' '}
            <span className="font-mono font-semibold text-gray-900">{result.reference}</span>
          </p>
          <p className="text-gray-600 mb-10">
            {t('public:sellProperty.successScreen.pendingValidation')}
          </p>

          <div className="card p-6 text-start mb-8">
            <h2 className="font-semibold mb-5">{t('public:sellProperty.successScreen.nextStepsTitle')}</h2>
            <ol className="space-y-5">
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm me-4 flex-shrink-0">1</div>
                <div>
                  <div className="font-medium text-gray-900">{t('public:sellProperty.successScreen.step1Title')}</div>
                  <div className="text-sm text-gray-600">{t('public:sellProperty.successScreen.step1Text')}</div>
                </div>
              </li>
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm me-4 flex-shrink-0">2</div>
                <div>
                  <div className="font-medium text-gray-900">
                    {form.wants_pro_photos
                      ? t('public:sellProperty.successScreen.step2TitlePro')
                      : t('public:sellProperty.successScreen.step2TitleOptim')}
                  </div>
                  <div className="text-sm text-gray-600">
                    {form.wants_pro_photos
                      ? t('public:sellProperty.successScreen.step2TextPro')
                      : t('public:sellProperty.successScreen.step2TextOptim')}
                  </div>
                </div>
              </li>
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm me-4 flex-shrink-0">3</div>
                <div>
                  <div className="font-medium text-gray-900">{t('public:sellProperty.successScreen.step3Title')}</div>
                  <div className="text-sm text-gray-600">{t('public:sellProperty.successScreen.step3Text')}</div>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/dashboard/annonces" className="btn-primary">
              {t('public:sellProperty.successScreen.trackButton')}
              <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
            </Link>
            <Link to="/" className="btn border border-gray-200 text-gray-700 hover:bg-gray-50">
              {t('public:sellProperty.successScreen.backHome')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ================= Wizard ================= */
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-bold mb-2">{t('public:sellProperty.title')}</h1>
          <p className="text-gray-300">
            {t('public:sellProperty.subtitle', { price: formatPrice(4900) })}
          </p>
        </div>
      </section>

      {/* Stepper */}
      <div className="bg-white border-b sticky top-16 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3 overflow-x-auto">
            {STEPS.map((s, idx) => {
              const SIcon = s.icon
              const done = idx < step
              const current = idx === step
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goTo(idx)}
                  className="flex items-center flex-shrink-0 group"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    done ? 'bg-green-500 text-white'
                      : current ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                  }`}>
                    {done ? <FiCheck className="w-4 h-4" /> : <SIcon className="w-4 h-4" />}
                  </div>
                  <span className={`ms-2 me-4 text-sm font-medium hidden md:inline ${
                    current ? 'text-primary-700' : done ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {t(`public:sellProperty.steps.${s.key}`)}
                  </span>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-6 lg:w-12 h-0.5 me-4 hidden sm:block ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <section className="py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {stepError && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm flex items-center">
              <FiAlertCircle className="w-4 h-4 me-2 flex-shrink-0" />
              {stepError}
            </div>
          )}

          {/* ---------- Étape 1 : Votre bien ---------- */}
          {step === 0 && (
            <div className="card p-6 sm:p-8 space-y-6">
              <div>
                <label className="label">{t('public:sellProperty.step1.propertyTypeLabel')} <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROPERTY_TYPES.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => update({ property_type: pt.value })}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        form.property_type === pt.value
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t(`public:sellProperty.propertyTypes.${pt.value}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">{t('public:sellProperty.step1.cityLabel')} <span className="text-red-500">*</span></label>
                  <input
                    list="cities"
                    value={form.city}
                    onChange={(e) => update({ city: e.target.value })}
                    className="input"
                    placeholder={t('public:sellProperty.step1.cityPlaceholder')}
                  />
                  <datalist id="cities">
                    {MOROCCAN_CITIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.neighborhoodLabel')}</label>
                  <input
                    value={form.neighborhood}
                    onChange={(e) => update({ neighborhood: e.target.value })}
                    className="input"
                    placeholder={t('public:sellProperty.step1.neighborhoodPlaceholder')}
                  />
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.addressLabel')}</label>
                  <input
                    value={form.address}
                    onChange={(e) => update({ address: e.target.value })}
                    className="input"
                    placeholder={t('public:sellProperty.step1.addressPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="label">{t('public:sellProperty.step1.surfaceLabel')} <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="1"
                    value={form.surface}
                    onChange={(e) => { setEstimation(null); update({ surface: e.target.value }) }}
                    className="input"
                    placeholder={t('public:sellProperty.step1.surfacePlaceholder')}
                  />
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.roomsLabel')}</label>
                  <input type="number" min="0" value={form.rooms}
                    onChange={(e) => update({ rooms: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.roomsPlaceholder')} />
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.bedroomsLabel')}</label>
                  <input type="number" min="0" value={form.bedrooms}
                    onChange={(e) => update({ bedrooms: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.bedroomsPlaceholder')} />
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.bathroomsLabel')}</label>
                  <input type="number" min="0" value={form.bathrooms}
                    onChange={(e) => update({ bathrooms: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.bathroomsPlaceholder')} />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="label">{t('public:sellProperty.step1.floorLabel')}</label>
                  <input type="number" value={form.floor}
                    onChange={(e) => update({ floor: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.floorPlaceholder')} />
                </div>
                <div>
                  <label className="label">{t('public:sellProperty.step1.totalFloorsLabel')}</label>
                  <input type="number" min="0" value={form.total_floors}
                    onChange={(e) => update({ total_floors: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.totalFloorsPlaceholder')} />
                </div>
                <div className="col-span-2">
                  <label className="label">{t('public:sellProperty.step1.constructionYearLabel')}</label>
                  <input type="number" min="1900" max="2030" value={form.construction_year}
                    onChange={(e) => update({ construction_year: e.target.value })} className="input" placeholder={t('public:sellProperty.step1.constructionYearPlaceholder')} />
                </div>
              </div>

              <div>
                <label className="label">{t('public:sellProperty.step1.featuresLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {FEATURES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => toggleFeature(f.value)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        form.features.includes(f.value)
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t(`public:sellProperty.features.${FEATURE_LABEL_KEYS[f.value]}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">{t('public:sellProperty.step1.descriptionLabel')}</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  className="input resize-none"
                  placeholder={t('public:sellProperty.step1.descriptionPlaceholder')}
                />
              </div>
            </div>
          )}

          {/* ---------- Étape 2 : Estimation & prix ---------- */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="card p-6 sm:p-8">
                <div className="flex items-center mb-4">
                  <FiTrendingUp className="w-5 h-5 text-primary-600 me-2" />
                  <h2 className="font-semibold text-lg">{t('public:sellProperty.step2.estimationTitle')}</h2>
                </div>

                {isEstimating ? (
                  <p className="text-gray-500">{t('public:sellProperty.step2.estimationLoading')}</p>
                ) : estimation?.available ? (
                  <div>
                    <div className="grid grid-cols-3 gap-4 text-center mb-4">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="text-sm text-gray-500 mb-1">{t('public:sellProperty.step2.rangeLow')}</div>
                        <div className="text-lg font-bold text-gray-700">{formatPrice(estimation.estimate_low)}</div>
                      </div>
                      <div className="p-4 bg-primary-50 border-2 border-primary-200 rounded-xl">
                        <div className="text-sm text-primary-600 mb-1">{t('public:sellProperty.step2.recommendedPrice')}</div>
                        <div className="text-xl font-bold text-primary-700">{formatPrice(estimation.estimate)}</div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="text-sm text-gray-500 mb-1">{t('public:sellProperty.step2.rangeHigh')}</div>
                        <div className="text-lg font-bold text-gray-700">{formatPrice(estimation.estimate_high)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      {estimation.scope === 'city_and_type'
                        ? t('public:sellProperty.step2.comparablesBasisCityAndType', {
                            count: estimation.comparables_count,
                            type: typeLabel?.toLowerCase(),
                            city: form.city,
                            price: formatPrice(estimation.price_per_sqm)
                          })
                        : estimation.scope === 'city'
                        ? t('public:sellProperty.step2.comparablesBasisCity', {
                            count: estimation.comparables_count,
                            city: form.city,
                            price: formatPrice(estimation.price_per_sqm)
                          })
                        : t('public:sellProperty.step2.comparablesBasisType', {
                            count: estimation.comparables_count,
                            price: formatPrice(estimation.price_per_sqm)
                          })}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">
                    {t('public:sellProperty.step2.noEstimation')}
                  </p>
                )}
              </div>

              <div className="card p-6 sm:p-8">
                <h2 className="font-semibold text-lg mb-4">{t('public:sellProperty.step2.priceTitle')}</h2>
                <div className="max-w-xs">
                  <label className="label">{t('public:sellProperty.step2.priceLabel', { currency: DIRHAM_SYMBOL })} <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="1"
                    value={form.desired_price}
                    onChange={(e) => update({ desired_price: e.target.value })}
                    className="input text-lg font-semibold"
                    placeholder={t('public:sellProperty.step2.pricePlaceholder')}
                  />
                </div>
                {estimation?.available && Number(form.desired_price) > estimation.estimate_high && (
                  <p className="text-sm text-amber-600 mt-2 flex items-center">
                    <FiAlertCircle className="w-4 h-4 me-1" />
                    {t('public:sellProperty.step2.priceAboveRangeWarning')}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-3">
                  {t('public:sellProperty.step2.priceIndicative')}
                </p>
              </div>
            </div>
          )}

          {/* ---------- Étape 3 : Photos ---------- */}
          {step === 2 && (
            <div className="space-y-6">
              {!isAuthenticated ? (
                <div className="card p-8 text-center">
                  <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FiUser className="w-7 h-7 text-primary-600" />
                  </div>
                  <h2 className="font-semibold text-lg mb-2">{t('public:sellProperty.step3.accountRequiredTitle')}</h2>
                  <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">
                    {t('public:sellProperty.step3.accountRequiredText')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      to={`/inscription?service=vente&redirect=${encodeURIComponent('/vendre')}`}
                      className="btn-primary"
                    >
                      {t('public:sellProperty.step3.createAccountButton')}
                      <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
                    </Link>
                    <Link
                      to={`/connexion?redirect=${encodeURIComponent('/vendre')}`}
                      className="btn border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {t('public:sellProperty.step3.haveAccountButton')}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card p-6 sm:p-8">
                    <h2 className="font-semibold text-lg mb-1">{t('public:sellProperty.step3.photosTitle')}</h2>
                    <p className="text-sm text-gray-500 mb-6">
                      {t('public:sellProperty.step3.photosHelp')}
                    </p>

                    <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                      uploading ? 'border-gray-200 bg-gray-50' : 'border-primary-300 hover:border-primary-500 hover:bg-primary-50'
                    }`}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={onPhotosSelected}
                        disabled={uploading}
                        className="sr-only"
                      />
                      <FiUpload className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                      <div className="font-medium text-gray-700">
                        {uploading ? t('public:sellProperty.step3.uploading') : t('public:sellProperty.step3.clickToAdd')}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{t('public:sellProperty.step3.dragDrop')}</div>
                    </label>

                    {form.photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                        {form.photos.map((photo, idx) => (
                          <div key={photo.url} className="relative group">
                            <img
                              src={photo.url}
                              alt={photo.original_name}
                              className="w-full h-28 object-cover rounded-lg border border-gray-200"
                            />
                            {idx === 0 && (
                              <span className="absolute top-1.5 start-1.5 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
                                {t('public:sellProperty.step3.mainPhotoBadge')}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => update({ photos: form.photos.filter((p) => p.url !== photo.url) })}
                              className="absolute top-1.5 end-1.5 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label={t('public:sellProperty.step3.removePhotoAriaLabel')}
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="card p-6 flex items-start cursor-pointer hover:border-terracotta-300 border-2 border-transparent transition-colors">
                    <input
                      type="checkbox"
                      checked={form.wants_pro_photos}
                      onChange={(e) => update({ wants_pro_photos: e.target.checked })}
                      className="mt-1 rounded border-gray-300 text-terracotta-600 me-3"
                    />
                    <span>
                      <span className="flex items-center font-medium text-gray-900">
                        <FiCamera className="w-4 h-4 me-2 text-terracotta-600" />
                        {t('public:sellProperty.step3.proPhotosLabel')}
                        <span className="ms-2 text-xs bg-terracotta-100 text-terracotta-700 px-2 py-0.5 rounded-full">{t('public:sellProperty.step3.proPhotosIncluded')}</span>
                      </span>
                      <span className="block text-sm text-gray-500 mt-1">
                        {t('public:sellProperty.step3.proPhotosHelp')}
                      </span>
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* ---------- Étape 4 : Documents ---------- */}
          {step === 3 && (
            <div className="card p-6 sm:p-8">
              <h2 className="font-semibold text-lg mb-1">{t('public:sellProperty.step4.title')}</h2>
              <p className="text-sm text-gray-500 mb-6">
                {t('public:sellProperty.step4.help')}
              </p>

              <div className="divide-y">
                {DOC_TYPES.map((doc) => {
                  const uploaded = form.documents[doc.value]
                  return (
                    <div key={doc.value} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{t(`public:sellProperty.docTypes.${doc.value}.label`)}</div>
                        <div className="text-sm text-gray-500">{t(`public:sellProperty.docTypes.${doc.value}.description`)}</div>
                      </div>
                      {uploaded ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                            <FiCheck className="w-4 h-4 me-1.5" />
                            {uploaded.original_name || t('public:sellProperty.step4.added')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const { [doc.value]: _, ...rest } = form.documents
                              update({ documents: rest })
                            }}
                            className="text-gray-400 hover:text-red-500"
                            aria-label={t('public:sellProperty.step4.removeDocumentAriaLabel')}
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className={`btn border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={(e) => onDocumentSelected(doc.value, e)}
                            disabled={uploading || !isAuthenticated}
                            className="sr-only"
                          />
                          <FiUpload className="w-4 h-4 me-2" />
                          {t('public:sellProperty.step4.addButton')}
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ---------- Étape 5 : Récapitulatif ---------- */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="card p-6 sm:p-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-lg">{t('public:sellProperty.step5.propertyTitle')}</h2>
                  <button type="button" onClick={() => goTo(0)} className="text-sm text-primary-600 flex items-center">
                    <FiEdit2 className="w-3.5 h-3.5 me-1" /> {t('public:sellProperty.step5.editButton')}
                  </button>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <div><dt className="text-gray-500">{t('public:sellProperty.step5.typeLabel')}</dt><dd className="font-medium text-gray-900">{typeLabel || '-'}</dd></div>
                  <div><dt className="text-gray-500">{t('public:sellProperty.step5.cityLabel')}</dt><dd className="font-medium text-gray-900">{form.city}{form.neighborhood ? ` (${form.neighborhood})` : ''}</dd></div>
                  <div><dt className="text-gray-500">{t('public:sellProperty.step5.surfaceLabel')}</dt><dd className="font-medium text-gray-900">{form.surface} m²</dd></div>
                  {form.rooms && <div><dt className="text-gray-500">{t('public:sellProperty.step5.roomsLabel')}</dt><dd className="font-medium text-gray-900">{form.rooms}</dd></div>}
                  {form.bedrooms && <div><dt className="text-gray-500">{t('public:sellProperty.step5.bedroomsLabel')}</dt><dd className="font-medium text-gray-900">{form.bedrooms}</dd></div>}
                  {form.bathrooms && <div><dt className="text-gray-500">{t('public:sellProperty.step5.bathroomsLabel')}</dt><dd className="font-medium text-gray-900">{form.bathrooms}</dd></div>}
                  {form.construction_year && <div><dt className="text-gray-500">{t('public:sellProperty.step5.constructionLabel')}</dt><dd className="font-medium text-gray-900">{form.construction_year}</dd></div>}
                </dl>
                {form.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {form.features.map((f) => (
                      <span key={f} className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{f}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-6 sm:p-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-lg">{t('public:sellProperty.step5.priceTitle')}</h2>
                  <button type="button" onClick={() => goTo(1)} className="text-sm text-primary-600 flex items-center">
                    <FiEdit2 className="w-3.5 h-3.5 me-1" /> {t('public:sellProperty.step5.editButton')}
                  </button>
                </div>
                <div className="text-2xl font-bold text-primary-700">
                  {form.desired_price ? formatPrice(Number(form.desired_price)) : '-'}
                </div>
                {estimation?.available && (
                  <p className="text-sm text-gray-500 mt-1">
                    {t('public:sellProperty.step5.estimationRange', {
                      low: formatPrice(estimation.estimate_low),
                      high: formatPrice(estimation.estimate_high)
                    })}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">{t('public:sellProperty.step5.photosTitle')}</h2>
                    <button type="button" onClick={() => goTo(2)} className="text-sm text-primary-600 flex items-center">
                      <FiEdit2 className="w-3.5 h-3.5 me-1" /> {t('public:sellProperty.step5.editButton')}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    {t('public:sellProperty.step5.photosCount', { count: form.photos.length })}
                    {form.wants_pro_photos && <span className="block text-terracotta-600 mt-1">{t('public:sellProperty.step5.proPhotosRequested')}</span>}
                  </p>
                  {form.photos.length > 0 && (
                    <div className="flex -space-x-2 rtl:space-x-reverse mt-3">
                      {form.photos.slice(0, 5).map((p) => (
                        <img key={p.url} src={p.url} alt="" className="w-10 h-10 rounded-lg object-cover border-2 border-white" />
                      ))}
                      {form.photos.length > 5 && (
                        <span className="w-10 h-10 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500">
                          +{form.photos.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">{t('public:sellProperty.step5.documentsTitle')}</h2>
                    <button type="button" onClick={() => goTo(3)} className="text-sm text-primary-600 flex items-center">
                      <FiEdit2 className="w-3.5 h-3.5 me-1" /> {t('public:sellProperty.step5.editButton')}
                    </button>
                  </div>
                  {Object.keys(form.documents).length > 0 ? (
                    <ul className="text-sm text-gray-600 space-y-1">
                      {Object.keys(form.documents).map((key) => (
                        <li key={key} className="flex items-center">
                          <FiCheck className="w-3.5 h-3.5 text-green-500 me-2" />
                          {t(`public:sellProperty.docTypes.${key}.label`, { defaultValue: key })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {t('public:sellProperty.step5.noDocuments')}
                    </p>
                  )}
                </div>
              </div>

              <div className="card p-6 bg-gray-50">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); setStepError('') }}
                    className="mt-1 rounded border-gray-300 text-primary-600 me-3"
                  />
                  <span className="text-sm text-gray-600">
                    <Trans
                      i18nKey="public:sellProperty.step5.consentText"
                      values={{ price: formatPrice(4900) }}
                      components={{ link: <Link to="/cgu" target="_blank" className="text-primary-600 underline" /> }}
                    />
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ---------- Navigation ---------- */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button type="button" onClick={prev} className="btn border border-gray-200 text-gray-700 hover:bg-gray-50">
                <DirIcon icon={FiArrowLeft} className="w-4 h-4 me-2" />
                {t('public:sellProperty.navigation.previous')}
              </button>
            ) : <span />}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  const err = validateStep(step)
                  if (err) { setStepError(err); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
                  next()
                }}
                className="btn-primary"
              >
                {t('public:sellProperty.navigation.continue')}
                <DirIcon icon={FiArrowRight} className="w-4 h-4 ms-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? t('public:sellProperty.navigation.submitting') : t('public:sellProperty.navigation.submit')}
                {!isSubmitting && <FiCheckCircle className="w-4 h-4 ms-2" />}
              </button>
            )}
          </div>

          {/* Réassurance */}
          <div className="flex flex-wrap justify-center gap-6 mt-10 text-sm text-gray-500">
            <span className="flex items-center"><FiClock className="w-4 h-4 me-1.5" /> {t('public:sellProperty.reassurance.time')}</span>
            <span className="flex items-center"><FiEye className="w-4 h-4 me-1.5" /> {t('public:sellProperty.reassurance.validation')}</span>
            <span className="flex items-center"><FiCheck className="w-4 h-4 me-1.5" /> {t('public:sellProperty.reassurance.free')}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SellProperty
