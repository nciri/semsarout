import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FiCheck, FiCheckCircle, FiArrowRight, FiArrowLeft, FiHome, FiCamera,
  FiFileText, FiDollarSign, FiClipboard, FiUpload, FiTrash2, FiUser,
  FiTrendingUp, FiAlertCircle, FiEdit2, FiClock, FiEye
} from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import api from '../services/api'
import { formatPrice, DIRHAM_SYMBOL } from '../utils/currency'
import { PROPERTY_TYPES, FEATURES, MOROCCAN_CITIES, DOC_TYPES } from '../constants/property'

const STORAGE_KEY = 'sell-wizard-v1'

const STEPS = [
  { key: 'bien', label: 'Votre bien', icon: FiHome },
  { key: 'prix', label: 'Estimation & prix', icon: FiDollarSign },
  { key: 'photos', label: 'Photos', icon: FiCamera },
  { key: 'documents', label: 'Documents', icon: FiFileText },
  { key: 'recap', label: 'Récapitulatif', icon: FiClipboard }
]

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
      if (!form.property_type) return 'Choisissez le type de bien'
      if (!form.city) return 'Indiquez la ville'
      if (!form.surface || Number(form.surface) <= 0) return 'Indiquez la surface habitable'
    }
    if (idx === 1) {
      if (!form.desired_price || Number(form.desired_price) <= 0) return 'Indiquez votre prix de vente'
    }
    if (idx === 2) {
      if (!isAuthenticated) return 'Créez votre compte pour ajouter vos photos'
      if (form.photos.length === 0 && !form.wants_pro_photos) {
        return 'Ajoutez au moins une photo, ou choisissez le shooting professionnel'
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
      setStepError(err.response?.data?.error || "Échec de l'envoi d'une photo")
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
      setStepError(err.response?.data?.error || "Échec de l'envoi du document")
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  /* ---------- Soumission ---------- */
  const submit = async () => {
    if (!consent) {
      setStepError("Veuillez accepter les conditions pour envoyer votre dossier")
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
      setStepError(err.response?.data?.error || 'Une erreur est survenue, veuillez réessayer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const typeLabel = PROPERTY_TYPES.find((t) => t.value === form.property_type)?.label

  /* ================= Écran de succès ================= */
  if (result) {
    return (
      <div className="min-h-[calc(100vh-200px)] py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">
            Dossier de vente envoyé !
          </h1>
          <p className="text-gray-600 mb-2">
            Référence de votre dossier :{' '}
            <span className="font-mono font-semibold text-gray-900">{result.reference}</span>
          </p>
          <p className="text-gray-600 mb-10">
            Votre annonce est en attente de validation par nos experts.
          </p>

          <div className="card p-6 text-left mb-8">
            <h2 className="font-semibold mb-5">Les prochaines étapes</h2>
            <ol className="space-y-5">
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-4 flex-shrink-0">1</div>
                <div>
                  <div className="font-medium text-gray-900">Validation sous 24h ouvrées</div>
                  <div className="text-sm text-gray-600">Un expert vérifie votre dossier, votre prix et vos documents, puis vous contacte.</div>
                </div>
              </li>
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-4 flex-shrink-0">2</div>
                <div>
                  <div className="font-medium text-gray-900">
                    {form.wants_pro_photos ? 'Shooting photo professionnel' : 'Optimisation de votre annonce'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {form.wants_pro_photos
                      ? 'Notre photographe vous contacte pour planifier la séance (incluse dans le Forfait Vente).'
                      : 'Rédaction optimisée et mise en valeur de votre bien.'}
                  </div>
                </div>
              </li>
              <li className="flex">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-4 flex-shrink-0">3</div>
                <div>
                  <div className="font-medium text-gray-900">Publication et visites</div>
                  <div className="text-sm text-gray-600">Votre annonce est publiée, nous gérons les contacts et organisons les visites avec vous.</div>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/dashboard/annonces" className="btn-primary">
              Suivre mon dossier
              <FiArrowRight className="w-4 h-4 ml-2" />
            </Link>
            <Link to="/" className="btn border border-gray-200 text-gray-700 hover:bg-gray-50">
              Retour à l'accueil
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
          <h1 className="font-display text-3xl font-bold mb-2">Vendez votre bien en ligne</h1>
          <p className="text-gray-300">
            Décrivez votre bien, obtenez une estimation, constituez votre dossier :
            votre annonce est prête à être publiée. Forfait fixe {formatPrice(4900)}, payable après validation.
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
                  <span className={`ml-2 mr-4 text-sm font-medium hidden md:inline ${
                    current ? 'text-primary-700' : done ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-6 lg:w-12 h-0.5 mr-4 hidden sm:block ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
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
              <FiAlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {stepError}
            </div>
          )}

          {/* ---------- Étape 1 : Votre bien ---------- */}
          {step === 0 && (
            <div className="card p-6 sm:p-8 space-y-6">
              <div>
                <label className="label">Type de bien <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROPERTY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => update({ property_type: t.value })}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        form.property_type === t.value
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Ville <span className="text-red-500">*</span></label>
                  <input
                    list="cities"
                    value={form.city}
                    onChange={(e) => update({ city: e.target.value })}
                    className="input"
                    placeholder="Ex: Casablanca"
                  />
                  <datalist id="cities">
                    {MOROCCAN_CITIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">Quartier</label>
                  <input
                    value={form.neighborhood}
                    onChange={(e) => update({ neighborhood: e.target.value })}
                    className="input"
                    placeholder="Ex: Maârif"
                  />
                </div>
                <div>
                  <label className="label">Adresse</label>
                  <input
                    value={form.address}
                    onChange={(e) => update({ address: e.target.value })}
                    className="input"
                    placeholder="Non publiée sur l'annonce"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="label">Surface (m²) <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="1"
                    value={form.surface}
                    onChange={(e) => { setEstimation(null); update({ surface: e.target.value }) }}
                    className="input"
                    placeholder="85"
                  />
                </div>
                <div>
                  <label className="label">Pièces</label>
                  <input type="number" min="0" value={form.rooms}
                    onChange={(e) => update({ rooms: e.target.value })} className="input" placeholder="3" />
                </div>
                <div>
                  <label className="label">Chambres</label>
                  <input type="number" min="0" value={form.bedrooms}
                    onChange={(e) => update({ bedrooms: e.target.value })} className="input" placeholder="2" />
                </div>
                <div>
                  <label className="label">Salles de bain</label>
                  <input type="number" min="0" value={form.bathrooms}
                    onChange={(e) => update({ bathrooms: e.target.value })} className="input" placeholder="1" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="label">Étage</label>
                  <input type="number" value={form.floor}
                    onChange={(e) => update({ floor: e.target.value })} className="input" placeholder="2" />
                </div>
                <div>
                  <label className="label">Étages du bâtiment</label>
                  <input type="number" min="0" value={form.total_floors}
                    onChange={(e) => update({ total_floors: e.target.value })} className="input" placeholder="5" />
                </div>
                <div className="col-span-2">
                  <label className="label">Année de construction</label>
                  <input type="number" min="1900" max="2030" value={form.construction_year}
                    onChange={(e) => update({ construction_year: e.target.value })} className="input" placeholder="2010" />
                </div>
              </div>

              <div>
                <label className="label">Caractéristiques</label>
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
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Description libre</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  className="input resize-none"
                  placeholder="Points forts, travaux récents, environnement... Nos experts peaufineront le texte de l'annonce."
                />
              </div>
            </div>
          )}

          {/* ---------- Étape 2 : Estimation & prix ---------- */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="card p-6 sm:p-8">
                <div className="flex items-center mb-4">
                  <FiTrendingUp className="w-5 h-5 text-primary-600 mr-2" />
                  <h2 className="font-semibold text-lg">Estimation de votre bien</h2>
                </div>

                {isEstimating ? (
                  <p className="text-gray-500">Analyse des biens comparables en cours...</p>
                ) : estimation?.available ? (
                  <div>
                    <div className="grid grid-cols-3 gap-4 text-center mb-4">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="text-sm text-gray-500 mb-1">Fourchette basse</div>
                        <div className="text-lg font-bold text-gray-700">{formatPrice(estimation.estimate_low)}</div>
                      </div>
                      <div className="p-4 bg-primary-50 border-2 border-primary-200 rounded-xl">
                        <div className="text-sm text-primary-600 mb-1">Prix conseillé</div>
                        <div className="text-xl font-bold text-primary-700">{formatPrice(estimation.estimate)}</div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="text-sm text-gray-500 mb-1">Fourchette haute</div>
                        <div className="text-lg font-bold text-gray-700">{formatPrice(estimation.estimate_high)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">
                      Basée sur {estimation.comparables_count} bien(s) comparable(s)
                      {estimation.scope === 'city_and_type' ? ` (${typeLabel?.toLowerCase()}s à ${form.city})` :
                       estimation.scope === 'city' ? ` à ${form.city}` : ' du même type'}
                      {' '}— environ {formatPrice(estimation.price_per_sqm)}/m².
                      Un expert affinera cette estimation lors de la validation de votre dossier.
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">
                    Pas assez de biens comparables pour une estimation automatique —
                    un expert estimera votre bien gratuitement à la validation du dossier.
                  </p>
                )}
              </div>

              <div className="card p-6 sm:p-8">
                <h2 className="font-semibold text-lg mb-4">Votre prix de vente</h2>
                <div className="max-w-xs">
                  <label className="label">Prix souhaité ({DIRHAM_SYMBOL}) <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="1"
                    value={form.desired_price}
                    onChange={(e) => update({ desired_price: e.target.value })}
                    className="input text-lg font-semibold"
                    placeholder="1 400 000"
                  />
                </div>
                {estimation?.available && Number(form.desired_price) > estimation.estimate_high && (
                  <p className="text-sm text-amber-600 mt-2 flex items-center">
                    <FiAlertCircle className="w-4 h-4 mr-1" />
                    Prix au-dessus de la fourchette haute : la vente pourrait prendre plus de temps.
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-3">
                  Ce prix reste indicatif : vous le validerez avec votre expert avant publication.
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
                  <h2 className="font-semibold text-lg mb-2">Créez votre compte pour continuer</h2>
                  <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">
                    Vos photos et documents seront rattachés à votre compte.
                    Votre saisie est conservée : vous reprendrez exactement ici.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      to={`/inscription?service=vente&redirect=${encodeURIComponent('/vendre')}`}
                      className="btn-primary"
                    >
                      Créer mon compte gratuitement
                      <FiArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                    <Link
                      to={`/connexion?redirect=${encodeURIComponent('/vendre')}`}
                      className="btn border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      J'ai déjà un compte
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card p-6 sm:p-8">
                    <h2 className="font-semibold text-lg mb-1">Photos de votre bien</h2>
                    <p className="text-sm text-gray-500 mb-6">
                      Formats JPG, PNG ou WebP — 10 Mo max par photo. Les annonces avec photos
                      reçoivent 5x plus de contacts.
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
                        {uploading ? 'Envoi en cours...' : 'Cliquez pour ajouter vos photos'}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">ou glissez-déposez plusieurs fichiers</div>
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
                              <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
                                Principale
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => update({ photos: form.photos.filter((p) => p.url !== photo.url) })}
                              className="absolute top-1.5 right-1.5 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Supprimer la photo"
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
                      className="mt-1 rounded border-gray-300 text-terracotta-600 mr-3"
                    />
                    <span>
                      <span className="flex items-center font-medium text-gray-900">
                        <FiCamera className="w-4 h-4 mr-2 text-terracotta-600" />
                        Je souhaite le shooting photo professionnel
                        <span className="ml-2 text-xs bg-terracotta-100 text-terracotta-700 px-2 py-0.5 rounded-full">Inclus dans le Forfait Vente</span>
                      </span>
                      <span className="block text-sm text-gray-500 mt-1">
                        15-20 photos HD retouchées par un photographe à domicile, livrées sous 48h.
                        Vous pouvez quand même ajouter vos photos en attendant.
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
              <h2 className="font-semibold text-lg mb-1">Documents du bien</h2>
              <p className="text-sm text-gray-500 mb-6">
                Tous facultatifs à ce stade, mais un dossier complet accélère la validation
                et rassure les acheteurs. Formats PDF ou image, 10 Mo max.
              </p>

              <div className="divide-y">
                {DOC_TYPES.map((doc) => {
                  const uploaded = form.documents[doc.value]
                  return (
                    <div key={doc.value} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{doc.label}</div>
                        <div className="text-sm text-gray-500">{doc.description}</div>
                      </div>
                      {uploaded ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                            <FiCheck className="w-4 h-4 mr-1.5" />
                            {uploaded.original_name || 'Document ajouté'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const { [doc.value]: _, ...rest } = form.documents
                              update({ documents: rest })
                            }}
                            className="text-gray-400 hover:text-red-500"
                            aria-label="Supprimer le document"
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
                          <FiUpload className="w-4 h-4 mr-2" />
                          Ajouter
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
                  <h2 className="font-semibold text-lg">Votre bien</h2>
                  <button type="button" onClick={() => goTo(0)} className="text-sm text-primary-600 flex items-center">
                    <FiEdit2 className="w-3.5 h-3.5 mr-1" /> Modifier
                  </button>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <div><dt className="text-gray-500">Type</dt><dd className="font-medium text-gray-900">{typeLabel || '-'}</dd></div>
                  <div><dt className="text-gray-500">Ville</dt><dd className="font-medium text-gray-900">{form.city}{form.neighborhood ? ` (${form.neighborhood})` : ''}</dd></div>
                  <div><dt className="text-gray-500">Surface</dt><dd className="font-medium text-gray-900">{form.surface} m²</dd></div>
                  {form.rooms && <div><dt className="text-gray-500">Pièces</dt><dd className="font-medium text-gray-900">{form.rooms}</dd></div>}
                  {form.bedrooms && <div><dt className="text-gray-500">Chambres</dt><dd className="font-medium text-gray-900">{form.bedrooms}</dd></div>}
                  {form.bathrooms && <div><dt className="text-gray-500">Salles de bain</dt><dd className="font-medium text-gray-900">{form.bathrooms}</dd></div>}
                  {form.construction_year && <div><dt className="text-gray-500">Construction</dt><dd className="font-medium text-gray-900">{form.construction_year}</dd></div>}
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
                  <h2 className="font-semibold text-lg">Prix</h2>
                  <button type="button" onClick={() => goTo(1)} className="text-sm text-primary-600 flex items-center">
                    <FiEdit2 className="w-3.5 h-3.5 mr-1" /> Modifier
                  </button>
                </div>
                <div className="text-2xl font-bold text-primary-700">
                  {form.desired_price ? formatPrice(Number(form.desired_price)) : '-'}
                </div>
                {estimation?.available && (
                  <p className="text-sm text-gray-500 mt-1">
                    Estimation : {formatPrice(estimation.estimate_low)} — {formatPrice(estimation.estimate_high)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">Photos</h2>
                    <button type="button" onClick={() => goTo(2)} className="text-sm text-primary-600 flex items-center">
                      <FiEdit2 className="w-3.5 h-3.5 mr-1" /> Modifier
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    {form.photos.length} photo(s) ajoutée(s)
                    {form.wants_pro_photos && <span className="block text-terracotta-600 mt-1">+ shooting professionnel demandé</span>}
                  </p>
                  {form.photos.length > 0 && (
                    <div className="flex -space-x-2 mt-3">
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
                    <h2 className="font-semibold">Documents</h2>
                    <button type="button" onClick={() => goTo(3)} className="text-sm text-primary-600 flex items-center">
                      <FiEdit2 className="w-3.5 h-3.5 mr-1" /> Modifier
                    </button>
                  </div>
                  {Object.keys(form.documents).length > 0 ? (
                    <ul className="text-sm text-gray-600 space-y-1">
                      {Object.keys(form.documents).map((key) => (
                        <li key={key} className="flex items-center">
                          <FiCheck className="w-3.5 h-3.5 text-green-500 mr-2" />
                          {DOC_TYPES.find((d) => d.value === key)?.label || key}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Aucun document — votre expert vous les demandera plus tard.
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
                    className="mt-1 rounded border-gray-300 text-primary-600 mr-3"
                  />
                  <span className="text-sm text-gray-600">
                    Je certifie être propriétaire de ce bien (ou mandaté pour sa vente) et j'accepte
                    les <Link to="/cgu" target="_blank" className="text-primary-600 underline">conditions du Forfait Vente</Link>.
                    Le forfait de {formatPrice(4900)} n'est facturé qu'après validation du dossier avec votre expert.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ---------- Navigation ---------- */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button type="button" onClick={prev} className="btn border border-gray-200 text-gray-700 hover:bg-gray-50">
                <FiArrowLeft className="w-4 h-4 mr-2" />
                Précédent
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
                Continuer
                <FiArrowRight className="w-4 h-4 ml-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? 'Envoi du dossier...' : 'Envoyer mon dossier de vente'}
                {!isSubmitting && <FiCheckCircle className="w-4 h-4 ml-2" />}
              </button>
            )}
          </div>

          {/* Réassurance */}
          <div className="flex flex-wrap justify-center gap-6 mt-10 text-sm text-gray-500">
            <span className="flex items-center"><FiClock className="w-4 h-4 mr-1.5" /> 10 minutes suffisent</span>
            <span className="flex items-center"><FiEye className="w-4 h-4 mr-1.5" /> Validation par un expert sous 24h</span>
            <span className="flex items-center"><FiCheck className="w-4 h-4 mr-1.5" /> Rien à payer avant validation</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SellProperty
