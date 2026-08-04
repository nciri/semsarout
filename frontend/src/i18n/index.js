import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'

export const SUPPORTED_LANGS = ['fr', 'ar']

const resources = {
  fr: { common: frCommon, backoffice: frBackoffice },
  ar: { common: arCommon, backoffice: arBackoffice },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common', 'backoffice'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
  })

export default i18n
