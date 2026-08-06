import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonFr from '../locales/fr/common.json'
import webFr from '../locales/fr/web.json'
import appFr from '../locales/fr/app.json'
import partnerFr from '../locales/fr/partner.json'
import commonAr from '../locales/ar/common.json'
import webAr from '../locales/ar/web.json'
import appAr from '../locales/ar/app.json'
import partnerAr from '../locales/ar/partner.json'

export const SUPPORTED_LANGS = ['fr', 'ar']
export const RTL_LANGS = ['ar']
export const LANG_STORAGE_KEY = 'lang'

export function applyDirection(lng) {
  if (typeof document === 'undefined') return
  const dir = RTL_LANGS.includes(lng) ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lng
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: commonFr, web: webFr, app: appFr, partner: partnerFr },
      ar: { common: commonAr, web: webAr, app: appAr, partner: partnerAr },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGS,
    defaultNS: 'common',
    ns: ['common', 'web', 'app', 'partner'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

applyDirection(i18n.resolvedLanguage || i18n.language)
i18n.on('languageChanged', applyDirection)

export default i18n
