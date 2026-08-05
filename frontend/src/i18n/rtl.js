const RTL_LANGS = ['ar']

export function isRtl(lang) {
  return RTL_LANGS.includes(lang)
}

export function applyDirection(lang) {
  const el = document.documentElement
  el.setAttribute('lang', lang)
  el.setAttribute('dir', isRtl(lang) ? 'rtl' : 'ltr')
}
