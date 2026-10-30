/**
 * Texte riche : liste blanche, nettoyage et dégradés en texte brut.
 *
 * Tous les champs texte du projet étant saisis en WYSIWYG, ce qui circule est du HTML. La
 * liste blanche recopie celle du serveur (`libs/semsar_common/semsar_common/html_sanitize.py`),
 * sans quoi un collage accepté ici serait silencieusement amputé à l'enregistrement. Le
 * serveur reste la frontière de confiance : ce nettoyage-ci sert au collage (Word colle des
 * `<o:p>`, des `<font>` et des styles entiers) et à l'affichage.
 */
const ALLOWED = {
  p: ['style'], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
  ul: [], ol: [], li: [], h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
  blockquote: [], table: [], thead: [], tbody: [], tr: [],
  td: ['colspan', 'rowspan', 'style'], th: ['colspan', 'rowspan', 'style'],
  span: ['style'], a: ['href', 'title'],
}
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:']
// Seule déclaration admise, comme côté serveur. Un `style` libre reste un trou, plus petit
// qu'un `<script>` mais réel (`position:fixed` recouvre une page, `url()` appelle un tiers).
const ALLOWED_CSS = ['text-align']
/**
 * Sous-arbres retirés entiers, et non dépliés sur leurs enfants. `svg`, `math`, `template`
 * et `noscript` changent l'espace de noms ou le mode d'analyse : rendre leurs enfants au
 * HTML est le vecteur mXSS classique (`<math><mtext><table><mglyph><style>…`). Les autres
 * chargent une ressource ou réécrivent la résolution des URL relatives.
 */
const DROP = new Set(['script', 'style', 'svg', 'math', 'template', 'noscript', 'iframe',
  'object', 'embed', 'base', 'link', 'meta', 'frame', 'frameset', 'applet', 'form'])
// Fins de bloc : leur disparition ne doit pas coller deux mots.
const BLOCK_END = /<\/(?:p|div|li|tr|h[1-4]|blockquote|table|ul|ol)\s*>|<br\s*\/?>/gi
// Au-delà, un contenu qui ne se stabilise pas est hostile : on ne rend plus que son texte.
const MAX_PASSES = 4

function safeHref(value) {
  try {
    // Base absolue : une URL relative reste relative et donc sans protocole dangereux.
    return ALLOWED_PROTOCOLS.includes(new URL(value, 'https://semsarout.com').protocol)
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

function escapeText(text) {
  return String(text).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function sanitizePass(html) {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
  const root = doc.getElementById('r')
  if (!root) return ''
  // Parcours en profondeur d'abord : un nœud remplacé par ses enfants doit être revisité.
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName.toLowerCase()
      if (DROP.has(tag)) { child.remove(); continue }
      const allowed = ALLOWED[tag]
      if (!allowed) {
        walk(child)
        child.replaceWith(...Array.from(child.childNodes))
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        if (!allowed.includes(name)) { child.removeAttribute(attr.name); continue }
        if (name === 'href' && !safeHref(attr.value)) child.removeAttribute(attr.name)
        if (name === 'style') {
          const style = safeStyle(attr.value)
          if (style) child.setAttribute('style', style)
          else child.removeAttribute(attr.name)
        }
      }
      walk(child)
    }
  }
  walk(root)
  return root.innerHTML
}

/** Texte brut d'un champ riche : aperçu d'une cellule, index de recherche, email texte. */
export function richTextToPlain(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html).replace(BLOCK_END, '\n'), 'text/html')
  for (const el of doc.querySelectorAll('script, style, template, noscript')) el.remove()
  return (doc.body.textContent || '').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * HTML réduit à la liste blanche produit. Les balises interdites disparaissent, leur texte
 * reste ; les sous-arbres de `DROP` partent entiers.
 *
 * Le nettoyage est répété jusqu'au point fixe : on inspecte un arbre analysé puis on en
 * ré-sérialise le HTML, et cette ré-sérialisation peut se ré-analyser autrement que ce qui
 * a été inspecté (mutation XSS). Un contenu qui refuse de se stabiliser n'est pas un
 * contenu d'agence : on n'en rend plus que le texte.
 */
export function sanitizeRichText(html) {
  if (!html) return ''
  let current = String(html)
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = sanitizePass(current)
    if (next === current) return next
    current = next
  }
  return escapeText(richTextToPlain(current))
}

/** Un champ riche ne contenant que des balises vides (`<p><br></p>`) est vide. */
export function isRichTextEmpty(html) {
  if (!html) return true
  return richTextToPlain(html) === '' && !/<(?:img|table|hr)\b/i.test(html)
}

/**
 * Texte brut → HTML riche : les modèles préécrits et les données d'avant la bascule WYSIWYG
 * arrivent avec des sauts de ligne, qui disparaîtraient à l'affichage en HTML.
 */
export function plainToRichText(text) {
  if (!text) return ''
  const escaped = String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.trim().replace(/\n/g, '<br>')}</p>`)
    .filter((block) => block !== '<p></p>')
    .join('')
}

/**
 * Valeur prête pour un `RichTextarea` : les champs enregistrés avant la bascule WYSIWYG
 * contiennent du texte brut, dont les sauts de ligne seraient perdus à l'affichage.
 */
export function ensureRichText(value) {
  if (!value) return ''
  return /<(?:p|br|ul|ol|li|h[1-4]|strong|b|em|i|u|s|a|blockquote|table|span)\b[^>]*>/i.test(value)
    ? value
    : plainToRichText(value)
}
