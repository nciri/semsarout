import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  FiCheck, FiCheckCircle, FiMail, FiPhone, FiClock, FiArrowRight,
  FiUser, FiMapPin, FiExternalLink
} from 'react-icons/fi'
import useAuthStore from '../store/authStore'
import api from '../services/api'
import StayManagerWordmark from '../components/common/StayManagerWordmark'
import { SERVICE_OPTIONS, isValidService, STAYMANAGER_REGISTER_URL } from '../constants/services'
import { CONTACT } from '../constants/contact'

function Contact() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated } = useAuthStore()

  const serviceParam = searchParams.get('service')
  const [selectedService, setSelectedService] = useState(
    isValidService(serviceParam) ? serviceParam : null
  )
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSending, setIsSending] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: {
      name: user ? `${user.first_name} ${user.last_name}` : '',
      email: user?.email || '',
      phone: user?.phone || ''
    }
  })

  // Re-prefill if auth state arrives after mount (persisted store rehydration)
  useEffect(() => {
    if (user) {
      reset((values) => ({
        ...values,
        name: values.name || `${user.first_name} ${user.last_name}`,
        email: values.email || user.email,
        phone: values.phone || user.phone || ''
      }))
    }
  }, [user, reset])

  const selectService = (key) => {
    setSelectedService(key)
    setSearchParams(key ? { service: key } : {}, { replace: true })
  }

  const onSubmit = async (data) => {
    setSubmitError('')
    setIsSending(true)
    try {
      await api.post('/contact', {
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        service: selectedService || 'autre'
      })
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Une erreur est survenue, veuillez réessayer.')
    } finally {
      setIsSending(false)
    }
  }

  const serviceMeta = selectedService ? SERVICE_OPTIONS[selectedService] : null

  /* --------- Écran de succès --------- */
  if (submitted) {
    const registerLink = `/inscription?service=${selectedService || 'autre'}&redirect=${encodeURIComponent('/dashboard')}`
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-16 px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900 mb-3">
            Demande envoyée !
          </h1>
          <p className="text-gray-600 mb-8">
            Nous avons bien reçu votre demande
            {serviceMeta ? <> concernant <strong>{serviceMeta.shortLabel}</strong></> : null}.
            Un conseiller vous recontactera sous 24h ouvrées.
          </p>

          {isAuthenticated ? (
            <div className="space-y-3">
              <Link to="/dashboard" className="btn-primary w-full justify-center">
                Aller à mon tableau de bord
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link to="/" className="btn border border-gray-200 text-gray-700 hover:bg-gray-50 w-full justify-center">
                Retour à l'accueil
              </Link>
            </div>
          ) : (
            <div className="card p-6 text-left">
              <h2 className="font-semibold text-gray-900 mb-2">Suivez votre demande en ligne</h2>
              <p className="text-sm text-gray-600 mb-4">
                Créez votre compte gratuit pour suivre l'avancement de votre demande,
                échanger avec votre conseiller et accéder à tous nos services.
              </p>
              <Link to={registerLink} className="btn-primary w-full justify-center mb-2">
                Créer mon compte gratuitement
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link to="/" className="btn border border-gray-200 text-gray-700 hover:bg-gray-50 w-full justify-center">
                Retour à l'accueil
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* --------- Écran principal --------- */
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl lg:text-4xl font-bold mb-4">
            Contactez-nous
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl">
            Dites-nous ce qui vous amène : nous vous répondons sous 24h ouvrées,
            sans engagement.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Colonne principale */}
            <div className="lg:col-span-2">
              {/* Étape 1 : choix du service */}
              <div className="mb-8">
                <h2 className="font-semibold text-lg mb-4">
                  1. Quel service vous intéresse ?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(SERVICE_OPTIONS).map(([key, opt]) => {
                    const OptIcon = opt.icon
                    const active = selectedService === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectService(key)}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          active
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <OptIcon className={`w-5 h-5 mb-2 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                        <div className={`font-medium text-sm ${active ? 'text-primary-700' : 'text-gray-900'}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{opt.description}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cas particulier : vente = parcours 100% en ligne */}
              {selectedService === 'vente' && (
                <div className="mb-8 p-6 rounded-xl bg-primary-50 border border-primary-100">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    Gagnez du temps : vendez 100% en ligne
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Décrivez votre bien, recevez une estimation instantanée, ajoutez photos et
                    documents : votre dossier de vente est constitué en 10 minutes, sans attendre
                    un rappel téléphonique.
                  </p>
                  <Link to="/vendre" className="btn-primary">
                    Démarrer ma vente en ligne
                    <FiArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                  <p className="text-xs text-gray-500 mt-4">
                    Vous préférez d'abord échanger avec un conseiller ? Utilisez le formulaire ci-dessous.
                  </p>
                </div>
              )}

              {/* Cas particulier : courte durée = plateforme StayManager en self-service */}
              {selectedService === 'courte-duree' && (
                <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-[#F5F0E6] via-[#FAF7F2] to-[#ECF4EF] border border-[#E5DFD3]">
                  <div className="flex items-center gap-2 mb-2">
                    <img src="/staymanager-logo.png" alt="StayManager.ma" className="h-7" />
                    <StayManagerWordmark className="text-lg" />
                  </div>
                  <p className="text-sm text-gray-700 mb-4">
                    La location courte durée est opérée par notre partenaire StayManager.ma,
                    une plateforme en libre-service : créez votre compte, ajoutez vos biens
                    et démarrez avec 14 jours d'essai gratuit — sans attendre un conseiller.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={STAYMANAGER_REGISTER_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn bg-gradient-to-r from-[#1F3D34] to-[#2E5E4E] text-white hover:opacity-90"
                    >
                      Créer votre compte StayManager
                      <FiExternalLink className="w-4 h-4 ml-2" />
                    </a>
                    <Link
                      to="/nos-services/courte-duree"
                      className="btn border border-[#2E5E4E] text-[#2E5E4E] hover:bg-[#ECF4EF]"
                    >
                      En savoir plus sur l'offre
                    </Link>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Vous préférez être accompagné ? Laissez-nous un message ci-dessous
                    et un conseiller vous guidera.
                  </p>
                </div>
              )}

              {/* Étape 2 : formulaire */}
              <div className="card p-6 sm:p-8">
                <h2 className="font-semibold text-lg mb-1">
                  2. Vos coordonnées
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  {isAuthenticated
                    ? 'Vos informations de compte sont pré-remplies.'
                    : 'Pas besoin de compte pour nous écrire.'}
                </p>

                {submitError && (
                  <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Nom complet</label>
                      <div className="relative">
                        <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          {...register('name', { required: 'Nom requis' })}
                          className="input pl-10"
                          placeholder="Votre nom"
                        />
                      </div>
                      {errors.name && (
                        <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="label">Téléphone</label>
                      <div className="relative">
                        <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          {...register('phone')}
                          className="input pl-10"
                          placeholder="+212 6XX XXX XXX"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Email</label>
                    <div className="relative">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        {...register('email', {
                          required: 'Email requis',
                          pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: 'Email invalide'
                          }
                        })}
                        className="input pl-10"
                        placeholder="votre@email.com"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Votre message</label>
                    <textarea
                      {...register('message')}
                      rows={5}
                      className="input resize-none"
                      placeholder={
                        serviceMeta
                          ? `Parlez-nous de votre projet (${serviceMeta.label.toLowerCase()}) : type de bien, ville, délais...`
                          : 'Parlez-nous de votre projet : type de bien, ville, délais...'
                      }
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="btn-primary w-full justify-center"
                  >
                    {isSending ? 'Envoi en cours...' : 'Envoyer ma demande'}
                    {!isSending && <FiArrowRight className="w-4 h-4 ml-2" />}
                  </button>
                </form>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="card p-6 mb-6">
                <h3 className="font-semibold mb-4">Nous joindre directement</h3>
                <div className="space-y-4 text-sm">
                  <a href={`tel:${CONTACT.phoneTel}`} className="flex items-center text-gray-700 hover:text-primary-600">
                    <FiPhone className="w-5 h-5 mr-3 text-primary-600" />
                    {CONTACT.phone}
                  </a>
                  <a href={`mailto:${CONTACT.email}`} className="flex items-center text-gray-700 hover:text-primary-600">
                    <FiMail className="w-5 h-5 mr-3 text-primary-600" />
                    {CONTACT.email}
                  </a>
                  <div className="flex items-center text-gray-700">
                    <FiClock className="w-5 h-5 mr-3 text-primary-600" />
                    Lun - Sam : 9h - 19h
                  </div>
                </div>
              </div>

              <div className="card p-6 bg-gray-50">
                <h3 className="font-semibold mb-4">Pourquoi SemsarOut ?</h3>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li className="flex items-start">
                    <FiCheck className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Tarifs fixes et transparents, zéro commission surprise
                  </li>
                  <li className="flex items-start">
                    <FiCheck className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Réponse garantie sous 24h ouvrées
                  </li>
                  <li className="flex items-start">
                    <FiCheck className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Accompagnement par des experts locaux
                  </li>
                  <li className="flex items-start">
                    <FiCheck className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Sans engagement
                  </li>
                </ul>
              </div>

              <div className="mt-6 text-center text-sm text-gray-500">
                <FiMapPin className="inline w-4 h-4 mr-1" />
                Casablanca, Maroc
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contact
