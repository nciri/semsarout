/**
 * Texte riche : liste blanche, nettoyage et dégradés en texte brut.
 *
 * Tous les champs texte du projet étant saisis en WYSIWYG, ce qui circule est du HTML. La
 * liste blanche recopie celle du serveur (`libs/semsar_common/semsar_common/html_sanitize.py`),
 * et la table de charges partagée de `richText.test.js` vérifie que les deux couches ne
 * divergent pas.
 *
 * Le nettoyage repose sur **DOMPurify** et non sur un marcheur maison. Ce n'est pas une
 * précaution de confort : `RichText` est la dernière chose entre les octets stockés et le DOM
 * d'une page publique (`PropertyDetail`), donc un contournement de cette couche sur une charge
 * que bleach a déjà acceptée est un XSS stocké public **sans rien derrière**. Une liste de
 * vecteurs mXSS figée à une date ne tient pas ce rôle ; un projet maintenu, oui.
 *
 * **Politique de version** (le `^3.3.1` de `package.json` ; JSON n'accepte pas de commentaire,
 * la règle vit donc ici, à l'import) : on suit les correctifs amont, on n'épingle jamais une
 * version exacte à la main. Une épingle fige la seule bibliothèque sur laquelle repose la
 * défense XSS publique — et c'est ainsi que la 3.2.4 s'est retrouvée posée en dur alors que le
 * verrou résolvait déjà la 3.3.1, c'est-à-dire un retour en arrière. Toute montée impose de
 * rejouer le fixture de convergence (`UPDATE_SANITIZE_FIXTURE=1` côté `contract`, puis
 * `richText.test.js`) : la divergence d'ordre des attributs dépend de la version, et c'est
 * précisément ce que ce test surveille.
 */
import DOMPurify from 'dompurify'

/** Mêmes balises que `ALLOWED_TAGS` côté serveur. */
export const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'span', 'a']
/**
 * Mêmes attributs que `ALLOWED_ATTRIBUTES` côté serveur, **par balise**. `ALLOWED_ATTR` de
 * DOMPurify est global : sans ce filtre, `<p href=…>` passerait ici et serait refusé là-bas.
 */
const ATTR_BY_TAG = { a: ['href', 'title'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] }
/** `style` sur n'importe quelle balise, comme le `"*"` du dictionnaire serveur. */
const ATTR_ANY_TAG = ['style']
const ALLOWED_ATTR = [...ATTR_ANY_TAG, ...new Set(Object.values(ATTR_BY_TAG).flat())]
/** `http`, `https`, `mailto` et les URL relatives — mêmes protocoles que le serveur. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i
/**
 * Seule déclaration CSS admise, comme côté serveur (bleach + tinycss2). DOMPurify ne filtre
 * pas le contenu d'un `style` par propriété : c'est au crochet ci-dessous de le faire.
 */
const ALLOWED_CSS = ['text-align']
// Fins de bloc : leur disparition ne doit pas coller deux mots.
const BLOCK_END = /<\/(?:p|div|li|tr|h[1-4]|blockquote|table|ul|ol)\s*>|<br\s*\/?>/gi
// Au-delà, un contenu qui ne se stabilise pas est hostile : on ne rend plus que son texte.
const MAX_PASSES = 4

/** Une URL que l'on accepte de poser dans un `href`. Utilisé aussi par la barre d'outils. */
export function safeHref(value) {
  try {
    // Base absolue : une URL relative reste relative et donc sans protocole dangereux.
    return ['http:', 'https:', 'mailto:'].includes(new URL(value, 'https://semsarout.com').protocol)
  } catch {
    return false
  }
}

/** `style` réduit aux déclarations autorisées ; chaîne vide si rien ne survit. */
function safeStyle(value) {
  return String(value)
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter(([property, val]) => property && val !== undefined
      && ALLOWED_CSS.includes(property.trim().toLowerCase())
      && !/[()]|url|expression|\\/i.test(val))
    // Point-virgule final compris : la sortie doit être identique à celle du serveur
    // (bleach/tinycss2), sinon un aller-retour modifierait le HTML sans raison.
    .map(([property, val]) => `${property.trim().toLowerCase()}:${val.trim()};`)
    .join('')
}

/**
 * Parité attribut par balise, restriction du CSS, et **ordre canonique**.
 *
 * L'ordre n'est pas de la cosmétique : DOMPurify retire puis réinsère les attributs d'un
 * nœud, ce qui **inverse leur ordre à chaque passe**. Un `<a href title>` ne se stabilisait
 * donc jamais, et la boucle de point fixe le dégradait en texte brut au bout de 4 passes —
 * un lien parfaitement légitime réduit à son libellé. Trier les attributs rend la sortie
 * déterministe et, accessoirement, identique à celle de bleach/html5lib.
 *
 * Posé une fois : c'est le seul usage de DOMPurify de l'application.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!node.attributes || !node.tagName) return
  const permitted = ATTR_BY_TAG[node.tagName.toLowerCase()] || []
  const kept = []
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase()
    node.removeAttribute(attr.name)
    if (name === 'style') {
      const style = safeStyle(attr.value)
      if (style) kept.push([name, style])
    } else if (permitted.includes(name)) {
      kept.push([name, attr.value])
    }
  }
  for (const [name, value] of kept.sort(([a], [b]) => (a < b ? -1 : 1))) {
    node.setAttribute(name, value)
  }
})

function escapeText(text) {
  return String(text).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/** Texte brut d'un champ riche : aperçu d'une cellule, index de recherche, email texte. */
export function richTextToPlain(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html).replace(BLOCK_END, '\n'), 'text/html')
  for (const el of doc.querySelectorAll('script, style, template, noscript')) el.remove()
  return (doc.body.textContent || '').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * HTML réduit à la liste blanche produit.
 *
 * Le nettoyage est répété jusqu'au point fixe : on assainit un arbre analysé puis on en
 * ré-sérialise le HTML, et cette ré-sérialisation peut se ré-analyser autrement que ce qui a
 * été assaini (mutation XSS). DOMPurify ferme déjà cette classe, mais la boucle ne coûte
 * qu'une comparaison. Un contenu qui refuse de se stabiliser n'est pas un contenu d'agence :
 * on n'en rend plus que le texte.
 */
export function sanitizeRichText(html) {
  if (!html) return ''
  let current = String(html)
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = DOMPurify.sanitize(current, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP })
    if (next === current) return next
    current = next
  }
  return escapeText(richTextToPlain(current))
}

/** Un champ riche ne contenant que des balises vides (`<p><br></p>`) est vide. */
export function isRichTextEmpty(html) {
  if (!html) return true
  return richTextToPlain(html) === ''
}

/**
 * Texte brut → HTML riche : les modèles préécrits et les données d'avant la bascule WYSIWYG
 * arrivent avec des sauts de ligne, qui disparaîtraient à l'affichage en HTML.
 */
export function plainToRichText(text) {
  if (!text) return ''
  const escaped = escapeText(text).replace(/&quot;/g, '"')
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.trim().replace(/\n/g, '<br>')}</p>`)
    .filter((block) => block !== '<p></p>')
    .join('')
}

/**
 * Valeur prête pour un champ ou un affichage riche.
 *
 * Tout ce qui a été enregistré **avant** cette bascule est du texte brut, déjà un point fixe
 * du nettoyage : ses `\n` se réduiraient donc à des espaces en HTML, et le paragraphe d'un
 * agent deviendrait une seule ligne continue — silencieusement, sur la description publique
 * de chaque bien existant. `RichText` et `RichTextarea` passent par ici, pour que ni les
 * écrans convertis ni les suivants n'aient à y penser.
 */
export function ensureRichText(value) {
  if (!value) return ''
  return /<(?:p|br|ul|ol|li|h[1-4]|strong|b|em|i|u|s|a|blockquote|table|span)\b[^>]*>/i.test(value)
    ? value
    : plainToRichText(value)
}
