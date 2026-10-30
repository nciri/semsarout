/**
 * Texte riche : liste blanche, nettoyage et dégradés en texte brut.
 *
 * Tous les champs texte du projet étant saisis en WYSIWYG, ce qui circule est du HTML. La
 * liste blanche recopie exactement celle du serveur (`libs/semsar_common/html_sanitize.py`),
 * sans quoi un collage accepté ici serait silencieusement amputé à l'enregistrement. Le
 * serveur reste la frontière de confiance : ce nettoyage-ci sert au collage (Word colle des
 * `<o:p>`, des `<font>` et des styles entiers) et à l'affichage.
 */
const ALLOWED = {
  p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [],
  ul: [], ol: [], li: [], h1: [], h2: [], h3: [], h4: [], blockquote: [],
  table: [], thead: [], tbody: [], tr: [], td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'], span: [], a: ['href', 'title'],
}
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:']
// Fins de bloc : leur disparition ne doit pas coller deux mots.
const BLOCK_END = /<\/(?:p|div|li|tr|h[1-4]|blockquote|table|ul|ol)\s*>|<br\s*\/?>/gi

function safeHref(value) {
  try {
    // Base absolue : une URL relative reste relative et donc sans protocole dangereux.
    return ALLOWED_PROTOCOLS.includes(new URL(value, 'https://semsarout.com').protocol)
  } catch {
    return false
  }
}

/** HTML réduit à la liste blanche produit. Les balises interdites disparaissent, leur texte reste. */
export function sanitizeRichText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
  const root = doc.getElementById('r')
  if (!root) return ''
  // Parcours en profondeur d'abord : un nœud remplacé par ses enfants doit être revisité.
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName.toLowerCase()
      const allowed = ALLOWED[tag]
      if (!allowed) {
        walk(child)
        // `script`/`style` : leur texte n'est pas du contenu, il ne doit pas remonter.
        if (tag === 'script' || tag === 'style') child.remove()
        else child.replaceWith(...Array.from(child.childNodes))
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        if (!allowed.includes(name)) child.removeAttribute(attr.name)
        else if (name === 'href' && !safeHref(attr.value)) child.removeAttribute(attr.name)
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
  return (doc.body.textContent || '').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Un champ riche ne contenant que des balises vides (`<p><br></p>`) est vide. */
export function isRichTextEmpty(html) {
  if (!html) return true
  return richTextToPlain(html) === '' && !/<(?:img|table|hr)\b/i.test(html)
}
