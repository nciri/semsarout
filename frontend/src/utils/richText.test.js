import { describe, it, expect } from 'vitest'
import { ensureRichText, isRichTextEmpty, plainToRichText, richTextToPlain, sanitizeRichText } from './richText'

/**
 * Charges hostiles partagées avec le test serveur
 * (`services/contract/tests/test_html_sanitize.py`). Les deux couches sont indépendantes —
 * un marcheur DOM ici, bleach/html5lib là — et doivent converger : un contenu assaini par
 * l'une ne doit être ni dangereux, ni déformé par l'autre.
 */
export const HOSTILE = {
  imgOnerror: '<img src=x onerror=alert(1)>',
  svgScript: '<svg><script>alert(1)</script></svg>',
  noscriptMutation: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  javascriptHref: '<a href="javascript:alert(1)">x</a>',
  mathMutation: '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
  freeStyle: '<p style="position:fixed;top:0">x</p>',
  cssUrl: '<p style="text-align:center;background:url(http://evil)">x</p>',
  allowedStyle: '<p style="text-align:center">x</p>',
}

/** Ce que le serveur (`semsar_common.sanitize_html`) rend pour ces mêmes charges. */
export const SERVER_OUTPUT = {
  imgOnerror: '',
  svgScript: '',
  noscriptMutation: '"&gt;',
  javascriptHref: '<a>x</a>',
  mathMutation: '<table></table>',
  freeStyle: '<p style="">x</p>',
  cssUrl: '<p style="text-align:center;">x</p>',
  allowedStyle: '<p style="text-align:center;">x</p>',
}

/** Contrat de sécurité : aucune des deux couches ne doit laisser passer ceci. */
const UNSAFE = [/<\s*script/i, /<\s*img/i, /<\s*svg/i, /<\s*math/i, /<\s*iframe/i,
  /<\s*noscript/i, /\son\w+\s*=/i, /javascript:/i, /position\s*:/i, /url\s*\(/i]

describe('sanitizeRichText', () => {
  it('neutralise chaque charge hostile connue', () => {
    for (const [name, payload] of Object.entries(HOSTILE)) {
      const clean = sanitizeRichText(payload)
      for (const motif of UNSAFE) expect(clean, `${name} : ${clean}`).not.toMatch(motif)
      expect(clean, name).not.toContain('alert(1)')
    }
  })

  it('rend exactement ce qui est attendu, charge par charge', () => {
    expect(sanitizeRichText(HOSTILE.imgOnerror)).toBe('')
    // Les sous-arbres qui changent d'espace de noms partent entiers (vecteur mXSS).
    expect(sanitizeRichText(HOSTILE.svgScript)).toBe('')
    expect(sanitizeRichText(HOSTILE.noscriptMutation)).toBe('')
    expect(sanitizeRichText(HOSTILE.mathMutation)).toBe('')
    expect(sanitizeRichText(HOSTILE.javascriptHref)).toBe('<a>x</a>')
    expect(sanitizeRichText(HOSTILE.freeStyle)).toBe('<p>x</p>')
    expect(sanitizeRichText(HOSTILE.cssUrl)).toBe('<p style="text-align:center;">x</p>')
    expect(sanitizeRichText(HOSTILE.allowedStyle)).toBe('<p style="text-align:center;">x</p>')
  })

  it('accepte sans le déformer ce que le serveur a déjà assaini', () => {
    // Convergence : la sortie de l'autre couche doit traverser celle-ci inchangée, sinon un
    // champ écrit d'un côté et affiché de l'autre perdrait sa mise en forme.
    for (const [name, serveur] of Object.entries(SERVER_OUTPUT)) {
      const normalise = serveur.replace(' style=""', '')  // bleach laisse l'attribut vide
      expect(sanitizeRichText(serveur), name).toBe(normalise)
      for (const motif of UNSAFE) expect(serveur, name).not.toMatch(motif)
    }
  })

  it('se stabilise, et retombe sur le texte si un contenu refuse de se stabiliser', () => {
    const clean = sanitizeRichText('<p>a <b>b</b></p>')
    expect(sanitizeRichText(clean)).toBe(clean)
    expect(sanitizeRichText('<a href="HTTPS://semsarout.com">x</a>'))
      .toBe('<a href="HTTPS://semsarout.com">x</a>')
  })

  it('garde le texte des balises inconnues et retire les attributs non listés', () => {
    expect(sanitizeRichText('<div class="x"><font face="y">texte</font></div>')).toBe('texte')
    expect(sanitizeRichText('<p id="x" onclick="alert(1)">ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichText('<a href="/biens/3" title="t">x</a>'))
      .toBe('<a href="/biens/3" title="t">x</a>')
    expect(sanitizeRichText('<a href="mailto:a@b.com">x</a>')).toBe('<a href="mailto:a@b.com">x</a>')
  })
})

describe('conversions', () => {
  it('richTextToPlain rend un texte lisible sans balise', () => {
    expect(richTextToPlain('<p>Un</p><ul><li>a</li><li>b</li></ul>')).toBe('Un\na\nb')
    expect(richTextToPlain('<p>a &amp; b</p>')).toBe('a & b')
  })

  it('plainToRichText conserve les paragraphes et les sauts de ligne', () => {
    expect(plainToRichText('Bonjour\nSalma\n\nMerci')).toBe('<p>Bonjour<br>Salma</p><p>Merci</p>')
    expect(plainToRichText('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
    expect(plainToRichText('')).toBe('')
  })

  it('ensureRichText ne retouche pas une valeur déjà riche', () => {
    expect(ensureRichText('<p>déjà</p>')).toBe('<p>déjà</p>')
    expect(ensureRichText('ligne 1\nligne 2')).toBe('<p>ligne 1<br>ligne 2</p>')
    expect(ensureRichText(null)).toBe('')
  })

  it('isRichTextEmpty reconnaît un éditeur vidé', () => {
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
    expect(isRichTextEmpty('<p>  </p>')).toBe(true)
    expect(isRichTextEmpty('<p>x</p>')).toBe(false)
  })
})
