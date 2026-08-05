// Categorical palette validated with the dataviz skill's validator
// (scripts/validate_palette.js) — order + hex values are the CVD-safety
// mechanism, do not reorder or cycle. Two steps per hue: light and dark
// surface. Swap for brand tokens later; re-run the validator if you do.
const PALETTE = {
  light: {
    surface: '#fcfcfb',
    series: ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834'],
    grid: 'rgba(15,23,42,0.12)',
  },
  dark: {
    surface: '#1a1a19',
    series: ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926'],
    grid: 'rgba(255,255,255,0.16)',
  },
}

// No manual theme toggle in the app today (Tailwind's default 'media'
// strategy) — detect via an explicit data-theme override if one is ever
// added, else fall back to the OS/browser preference.
function isDarkMode() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark') return true
    if (attr === 'light') return false
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

// Le backoffice est en thème clair uniquement (aucun bascule sombre ailleurs) :
// les blocs d'analyse restent clairs, donc les graphiques utilisent toujours la
// palette claire — sinon la grille claire deviendrait invisible sur fond clair
// quand l'OS est en mode sombre. `isDarkMode` est conservé pour un futur toggle.
export function useChartTheme() {
  return PALETTE.light
}

export const AXIS = 'currentColor'

export const fmtMAD = (n) => `${Number(n || 0).toLocaleString('fr-FR')} Đh`
export const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR')
export const fmtPct = (n) => `${Number(n || 0).toLocaleString('fr-FR')} %`
