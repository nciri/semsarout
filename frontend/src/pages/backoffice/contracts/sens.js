const ARABE = /[؀-ۿݐ-ݿ]/g
const LATIN = /[A-Za-zÀ-ÿ]/g

/**
 * Sens de lecture d'un acte, décidé sur la langue qui domine son texte.
 *
 * Même règle que le rendu PDF (`services/contract/app/pdf.py`), pour que l'écran montre
 * l'acte tel qu'il sortira : les actes arabes se lisent de droite à gauche, et un acte
 * français qui cite une mention cadastrale en arabe reste lu de gauche à droite.
 */
export function sensDeLecture(html) {
  const texte = (html || '').replace(/<[^>]+>/g, ' ')
  return (texte.match(ARABE) || []).length > (texte.match(LATIN) || []).length ? 'rtl' : 'ltr'
}
