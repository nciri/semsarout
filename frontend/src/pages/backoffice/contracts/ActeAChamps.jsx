import { createElement, useMemo } from 'react'
import { sensDeLecture } from './sens'

/**
 * Un acte fourni avec le produit : texte en lecture seule, pointillés saisissables.
 *
 * Ces actes sont des formulaires — 22 à 55 pointillés à des positions fixes (titre foncier,
 * CNIE, durée du préavis). Les faire remplir dans un éditeur WYSIWYG revenait à laisser
 * retoucher la prose juridique et la structure : l'éditeur du produit écrasait la ligne
 * d'en-tête des tableaux d'échéancier à chaque enregistrement.
 *
 * Le rang d'un champ est son ordre d'apparition dans le corps, compté avec le MÊME motif que
 * le serveur (`app/champs.py`) et que le générateur des modèles. Rien n'est marqué dans le
 * HTML : l'allowlist produit n'admet aucun attribut `data-*`.
 */
const BLANC = /…{2,}|[.]{4,}/g
// `dangerouslySetInnerHTML` n'est pas utilisé : l'arbre est reconstruit en éléments React,
// donc aucune chaîne n'est injectée telle quelle, et les champs s'insèrent à leur place.
const ATTRS = { colspan: 'colSpan', rowspan: 'rowSpan', href: 'href', title: 'title' }

function styleEnObjet(valeur) {
  const out = {}
  for (const regle of (valeur || '').split(';')) {
    const [prop, v] = regle.split(':')
    if (prop && v && prop.trim() === 'text-align') out.textAlign = v.trim()
  }
  return out
}

function champsDuTexte(texte, etat) {
  const morceaux = []
  let reste = texte
  let m
  BLANC.lastIndex = 0
  let dernier = 0
  while ((m = BLANC.exec(texte)) !== null) {
    if (m.index > dernier) morceaux.push(texte.slice(dernier, m.index))
    etat.rang += 1
    const rang = String(etat.rang)
    const largeur = Math.min(Math.max(m[0].length, 8), 34)
    morceaux.push(
      <input
        key={`champ-${rang}`}
        type="text"
        value={etat.valeurs[rang] || ''}
        onChange={(e) => etat.onChange(rang, e.target.value)}
        disabled={etat.disabled}
        aria-label={etat.libelle(rang)}
        placeholder={m[0].slice(0, 12)}
        size={largeur}
        className="inline-block mx-0.5 px-1 py-0 align-baseline border-0 border-b border-dashed border-gray-400 bg-amber-50/60 text-gray-900 focus:outline-none focus:border-primary-500 focus:bg-white disabled:bg-transparent disabled:border-gray-200"
      />,
    )
    dernier = m.index + m[0].length
  }
  reste = texte.slice(dernier)
  if (reste) morceaux.push(reste)
  return morceaux
}

function rendre(noeud, etat, cle) {
  if (noeud.nodeType === 3) return champsDuTexte(noeud.nodeValue, etat)
  if (noeud.nodeType !== 1) return null
  const balise = noeud.tagName.toLowerCase()
  const props = { key: cle }
  for (const attr of noeud.attributes) {
    const nom = attr.name.toLowerCase()
    if (nom === 'style') props.style = styleEnObjet(attr.value)
    else if (ATTRS[nom]) props[ATTRS[nom]] = attr.value
  }
  if (balise === 'br') return <br key={cle} />
  const enfants = [...noeud.childNodes].map((n, i) => rendre(n, etat, `${cle}.${i}`))
  return createElement(balise, props, enfants.length ? enfants : null)
}

export default function ActeAChamps({ html, valeurs, onChange, disabled = false, libelle }) {
  const etat = { rang: 0, valeurs: valeurs || {}, onChange, disabled, libelle }
  const arbre = useMemo(() => {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html')
    const racine = doc.body.firstChild
    return [...racine.childNodes]
  }, [html])
  etat.rang = 0
  return (
    <div className="acte px-6 py-5" dir={sensDeLecture(html)}>
      {arbre.map((n, i) => rendre(n, etat, `n${i}`))}
    </div>
  )
}
