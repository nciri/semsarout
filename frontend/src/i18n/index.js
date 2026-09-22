import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'
import frAuth from '../locales/fr/auth.json'
import arAuth from '../locales/ar/auth.json'
import frPublic from '../locales/fr/public.json'
import arPublic from '../locales/ar/public.json'
import frDashboard from '../locales/fr/dashboard.json'
import arDashboard from '../locales/ar/dashboard.json'
import frAdmin from '../locales/fr/admin.json'
import arAdmin from '../locales/ar/admin.json'

export const SUPPORTED_LANGS = ['fr', 'ar']

const resources = {
  fr: { common: frCommon, backoffice: frBackoffice, auth: frAuth, public: frPublic, dashboard: frDashboard, admin: frAdmin },
  ar: { common: arCommon, backoffice: arBackoffice, auth: arAuth, public: arPublic, dashboard: arDashboard, admin: arAdmin },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common', 'backoffice', 'auth', 'public', 'dashboard', 'admin'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
  })

// Les locales AR ne portent que _one/_other (parité des clés avec le FR). Sans ce repli, les
// catégories zero/two/few/many de l'arabe (0, 2, 3-10, 11-99…) ne trouvaient aucune clé et
// l'interface retombait sur le texte français.
const resolver = i18n.services.pluralResolver
const baseSuffix = resolver.getSuffix.bind(resolver)
resolver.getSuffix = (code, count, options = {}) => {
  const suffix = baseSuffix(code, count, options)
  return String(code).startsWith('ar') && !options.ordinal && suffix !== '_one' ? '_other' : suffix
}

export default i18n
