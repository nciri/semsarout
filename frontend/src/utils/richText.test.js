import { describe, it, expect } from 'vitest'
import { ensureRichText, isRichTextEmpty, plainToRichText, richTextToPlain, safeHref, sanitizeRichText } from './richText'
import DOMPurify from 'dompurify'
import fixture from './serverSanitize.fixture.json'
import pkg from '../../package.json'

/**
 * Convergence des deux couches de sanitisation.
 *
 * Les charges **et** la sortie serveur viennent d'un fixture produit par
 * `services/contract/tests/test_html_sanitize.py`, pas d'une copie transcrite ici : une copie
 * n'aurait pas pu détecter la divergence qu'elle est censée surveiller. Un changement de
 * liste blanche serveur périme le fixture → le test Python casse → une fois régénéré, c'est
 * ce test-ci qui casse si le client ne suit pas. C'est tout l'intérêt du dispositif.
 */
const { payloads, serverOutput, unsafePatterns } = fixture
const UNSAFE = unsafePatterns.map((source) => new RegExp(source, 'i'))

/**
 * Divergences connues, examinées et acceptées : DOMPurify est plus strict, bleach/html5lib
 * laisse des résidus **inertes** que le contrat de sécurité accepte. Toute entrée non
 * déclarée ici doit traverser le client sans être modifiée — une nouvelle divergence fait
 * donc échouer le test au lieu d'être rattrapée par une normalisation.
 */
const KNOWN_DIVERGENCES = {
  freeStyle: 'bleach laisse style="" quand aucune déclaration ne survit ; le client retire l’attribut',
  attrOrder: 'bleach conserve l’ordre de la source ; DOMPurify réinsère les attributs et doit '
    + 'donc les trier pour que sa sortie soit déterministe (cf. le commentaire du crochet '
    + 'afterSanitizeAttributes). Cosmétique : une valeur stockée peut porter un autre ordre '
    + 'que celle qu’avait l’éditeur.',
}

describe('sanitizeRichText — contrat de sécurité', () => {
  it('neutralise chaque charge hostile de la table partagée', () => {
    for (const [name, payload] of Object.entries(payloads)) {
      const clean = sanitizeRichText(payload)
      for (const motif of UNSAFE) expect(clean, `${name} : ${clean}`).not.toMatch(motif)
      expect(clean, name).not.toContain('alert(1)')
    }
  })

  it('la sortie du serveur est elle aussi sûre, charge par charge', () => {
    for (const [name, output] of Object.entries(serverOutput)) {
      for (const motif of UNSAFE) expect(output, `${name} : ${output}`).not.toMatch(motif)
    }
  })
})

describe('sanitizeRichText — convergence avec le serveur', () => {
  it('ne diverge du serveur que sur les cas déclarés', () => {
    const divergences = []
    for (const [name, output] of Object.entries(serverOutput)) {
      if (sanitizeRichText(output) !== output) divergences.push(name)
    }
    // Égalité exacte des deux ensembles : une divergence nouvelle **ou** disparue est un
    // changement de comportement à constater, pas à absorber.
    expect(divergences.sort()).toEqual(Object.keys(KNOWN_DIVERGENCES).sort())
  })

  it('chaque divergence déclarée reste une différence sûre, jamais une faille', () => {
    for (const name of Object.keys(KNOWN_DIVERGENCES)) {
      const clean = sanitizeRichText(serverOutput[name])
      for (const motif of UNSAFE) expect(clean, `${name} : ${clean}`).not.toMatch(motif)
      expect(clean, name).not.toContain('alert(1)')
    }
  })

  it('la table partagée couvre la portée par balise de chaque attribut', () => {
    // `"*": ["style"]` côté serveur : `style` vaut sur toute balise autorisée. Sans ce
    // miroir, `<li style="text-align:center">` était accepté et stocké par le serveur puis
    // retiré à l'affichage.
    expect(sanitizeRichText(payloads.styleOnListItem))
      .toBe('<ul><li style="text-align:center;">x</li></ul>')
    expect(sanitizeRichText(payloads.styleOnBlockquote))
      .toBe('<blockquote style="text-align:right;">x</blockquote>')
    // À l'inverse, un attribut autorisé ailleurs ne l'est pas sur n'importe quelle balise.
    expect(sanitizeRichText(payloads.hrefOnParagraph)).toBe('<p>x</p>')
    expect(sanitizeRichText(payloads.colspanOnParagraph)).toBe('<p>x</p>')
  })
})

describe('sanitizeRichText — comportement', () => {
  it('rend exactement ce qui est attendu, charge par charge', () => {
    expect(sanitizeRichText(payloads.imgOnerror)).toBe('')
    expect(sanitizeRichText(payloads.svgScript)).toBe('')
    // DOMPurify retire tout le sous-arbre `noscript`/`math` : il ne reste que l'enveloppe
    // de la charge, jamais son contenu.
    expect(sanitizeRichText(payloads.noscriptMutation)).toBe('<p></p>')
    expect(sanitizeRichText(payloads.mathMutation)).toBe('')
    expect(sanitizeRichText(payloads.javascriptHref)).toBe('<a>x</a>')
    expect(sanitizeRichText(payloads.relativeHref)).toBe('<a href="/biens/3" title="t">x</a>')
    expect(sanitizeRichText(payloads.freeStyle)).toBe('<p>x</p>')
    expect(sanitizeRichText(payloads.cssUrl)).toBe('<p style="text-align:center;">x</p>')
    expect(sanitizeRichText(payloads.allowedStyle)).toBe('<p style="text-align:center;">x</p>')
    expect(sanitizeRichText(payloads.unknownTags)).toBe('texte')
    expect(sanitizeRichText(payloads.eventHandler)).toBe('<p>ok</p>')
  })

  it('se stabilise sur son propre résultat', () => {
    for (const payload of Object.values(payloads)) {
      const once = sanitizeRichText(payload)
      expect(sanitizeRichText(once)).toBe(once)
    }
  })

  it('accepte les protocoles de la liste blanche et rejette les autres', () => {
    expect(sanitizeRichText('<a href="mailto:a@b.com">x</a>')).toBe('<a href="mailto:a@b.com">x</a>')
    expect(sanitizeRichText('<a href="HTTPS://semsarout.com">x</a>'))
      .toBe('<a href="HTTPS://semsarout.com">x</a>')
    expect(sanitizeRichText('<a href="data:text/html;base64,x">x</a>')).toBe('<a>x</a>')
    expect(safeHref('https://semsarout.com')).toBe(true)
    expect(safeHref('/biens/3')).toBe(true)
    expect(safeHref('javascript:alert(1)')).toBe(false)
    // Une chaîne quelconque se résout en URL *relative* au site : elle est donc sans
    // protocole dangereux, et acceptée — c'est le protocole qui est filtré, pas la forme.
    expect(safeHref('pas-une-url')).toBe(true)
    expect(safeHref('vbscript:msgbox(1)')).toBe(false)
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe(false)
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

  it('ensureRichText survit à la sanitisation sans perdre les sauts de ligne', () => {
    // Le piège : un texte brut est **déjà** un point fixe du nettoyage, donc rien ne signale
    // que ses `\\n` vont se réduire à des espaces en HTML.
    const legacy = payloads.plainTextLineBreaks
    expect(sanitizeRichText(legacy)).toBe(legacy)
    expect(sanitizeRichText(ensureRichText(legacy)))
      .toBe('<p>Visite rapide.<br>Cuisine à refaire.</p>')
  })

  it('isRichTextEmpty reconnaît un éditeur vidé', () => {
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
    expect(isRichTextEmpty('<p>  </p>')).toBe(true)
    expect(isRichTextEmpty('<p>x</p>')).toBe(false)
  })
})

/**
 * Plancher de version de DOMPurify.
 *
 * Le fixture de convergence a été rejoué à la montée et ne bouge pas — il ne distingue donc
 * pas, à lui seul, une 3.2.4 d'une 3.4.x. Rien ne gardait alors la seule bibliothèque sur
 * laquelle repose la défense XSS publique : c'est ainsi qu'une épingle manuelle `3.2.4` a pu
 * poser un retour en arrière alors que le verrou résolvait déjà une version supérieure.
 */
describe('dompurify — plancher de version', () => {
  const PLANCHER = [3, 3, 1]
  const auMoins = (v) => {
    const [a, b, c] = String(v).split('.').map(Number)
    return a * 1e6 + b * 1e3 + c >= PLANCHER[0] * 1e6 + PLANCHER[1] * 1e3 + PLANCHER[2]
  }

  it('est déclaré en plage, jamais épinglé, et au-dessus du plancher', () => {
    const plage = pkg.dependencies.dompurify
    expect(plage, 'une version exacte fige les correctifs amont').toMatch(/^\^/)
    expect(auMoins(plage.slice(1)), `plage déclarée : ${plage}`).toBe(true)
  })

  it('la version réellement installée respecte ce plancher', () => {
    expect(auMoins(DOMPurify.version), `installée : ${DOMPurify.version}`).toBe(true)
  })
})
