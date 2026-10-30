import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiBold, FiItalic, FiLink, FiList, FiUnderline } from 'react-icons/fi'
import { isRtl } from '../../i18n/rtl'
import { ensureRichText, isRichTextEmpty, safeHref, sanitizeRichText } from '../../utils/richText'

/**
 * Champ de texte riche, en remplacement d’un `textarea`.
 *
 * `contentEditable` plutôt qu'une bibliothèque : les champs du projet n'ont besoin que de
 * gras, italique, souligné, listes et liens, et une dépendance d'éditeur apporte sa propre
 * mise en forme à discipliner alors qu'elle doit suivre le thème SemsarOut.
 *
 * L’API reprend celle du `textarea` remplacé (`id`, `value`, `onChange`, `rows`,
 * `placeholder`, `disabled`) pour que la conversion d'un écran reste mécanique ; seul
 * `onChange` change de forme : il reçoit le HTML, pas un événement.
 */

/** Hauteur minimale équivalente à `rows` : une ligne ≈ 1.5rem, plus le padding vertical. */
const minHeightFor = (rows) => `${Math.max(1, rows) * 1.5 + 0.75}rem`

const BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors motion-reduce:transition-none hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40'

export function RichText({ html, className = '', emptyLabel }) {
  if (isRichTextEmpty(html)) {
    return emptyLabel ? <p className={`text-gray-500 ${className}`}>{emptyLabel}</p> : null
  }
  return (
    <div
      className={`rich-text break-words [&_a]:text-primary-700 [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-gray-200 [&_blockquote]:ps-3 [&_li]:ms-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ps-5 ${className}`}
      // Assaini à l'écriture par le service ET ici à l'affichage. `ensureRichText` remonte
      // d'abord une valeur d'avant la bascule : c'est du texte brut, dont les sauts de ligne
      // se réduiraient sinon à des espaces — la surface remplacée était `whitespace-pre-line`.
      //
      // La valeur posée ici est la sortie de **DOMPurify**, configuré depuis la liste blanche
      // partagée du produit (`utils/richText.js`), et la passe bleach de
      // `semsar_common.sanitize_html` est la frontière côté stockage. Deux couches
      // indépendantes, dont la convergence est vérifiée par `utils/richText.test.js` contre
      // un fixture produit par le test serveur. L'analyseur signale cette ligne quel que soit
      // l'assainissement — son propre remède recommandé est précisément DOMPurify — et une
      // alerte permanente sur une ligne correcte apprend à survoler sa sortie.
      // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(ensureRichText(html)) }}
    />
  )
}

function RichTextarea({
  id, value = '', onChange, rows = 3, placeholder, disabled = false,
  className = '', 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...rest
}) {
  const { t, i18n } = useTranslation('common')
  const editor = useRef(null)
  // Dernier HTML émis : sert à ne pas réécrire `innerHTML` sous le curseur de la frappe.
  const emitted = useRef(null)
  const generatedId = useId()
  const editorId = id || `rich-${generatedId}`
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [label, setLabel] = useState({})
  const dir = isRtl(i18n.language) ? 'rtl' : 'ltr'

  // `<label for>` et le `<label>` englobant ne nomment que les contrôles de formulaire : un
  // `div[role=textbox]` les ignore, et le champ deviendrait anonyme pour un lecteur d'écran.
  // On retrouve donc le libellé en place et on le rattache nous-mêmes.
  useEffect(() => {
    const el = editor.current
    if (!el || ariaLabel || ariaLabelledBy) return
    const found = el.ownerDocument.querySelector(`label[for="${CSS.escape(editorId)}"]`)
      || el.closest('label')
    if (!found) return
    if (found.contains(el)) {
      // `aria-labelledby` vers un ancêtre nommerait le champ avec son propre contenu :
      // on ne garde que le texte du libellé, hors sous-arbre de l'éditeur.
      const text = Array.from(found.childNodes)
        .filter((n) => !n.contains?.(el))
        .map((n) => n.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) setLabel({ text })
      return
    }
    if (!found.id) found.id = `${editorId}-label`
    setLabel({ id: found.id })
  }, [editorId, ariaLabel, ariaLabelledBy])

  useEffect(() => {
    const el = editor.current
    if (!el || value === emitted.current) return
    // Même remontée qu'à l'affichage : sans elle, ouvrir un compte rendu écrit avant la
    // bascule aplatissait ses paragraphes en une seule ligne dans l'éditeur.
    el.innerHTML = sanitizeRichText(ensureRichText(value))
    emitted.current = value
  }, [value])

  const emit = useCallback(() => {
    const el = editor.current
    if (!el || !onChange) return
    const html = isRichTextEmpty(el.innerHTML) ? '' : sanitizeRichText(el.innerHTML)
    emitted.current = html
    onChange(html)
  }, [onChange])

  /** `execCommand` est déprécié mais reste la seule API d'édition disponible partout. */
  const exec = (command, argument) => {
    const el = editor.current
    if (!el) return
    el.focus()
    if (typeof document.execCommand === 'function') document.execCommand(command, false, argument)
    emit()
  }

  const insert = (html) => {
    if (typeof document.execCommand === 'function') exec('insertHTML', html)
    else if (editor.current) { editor.current.innerHTML += html; emit() }
  }

  const handlePaste = (event) => {
    // Un collage depuis Word apporte sa feuille de style entière : on ne garde que la
    // liste blanche. Sans ce filtre, le champ accepterait du balisage arbitraire.
    event.preventDefault()
    const data = event.clipboardData
    const html = data?.getData('text/html')
    if (html) insert(sanitizeRichText(html))
    else {
      const text = data?.getData('text/plain') || ''
      insert(text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>'))
    }
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    // `createLink` pose l'URL telle quelle : un `javascript:` ferait une ancre vivante dans
    // l'éditeur de son auteur jusqu'au prochain montage. Même filtre qu'à l'affichage.
    if (url && !safeHref(url)) return
    setLinkOpen(false)
    setLinkUrl('')
    if (url) exec('createLink', url)
  }

  const tools = [
    { key: 'bold', icon: FiBold, run: () => exec('bold') },
    { key: 'italic', icon: FiItalic, run: () => exec('italic') },
    { key: 'underline', icon: FiUnderline, run: () => exec('underline') },
    { key: 'bulletList', icon: FiList, run: () => exec('insertUnorderedList') },
    { key: 'numberedList', icon: FiList, run: () => exec('insertOrderedList') },
    { key: 'link', icon: FiLink, run: () => setLinkOpen((o) => !o) },
  ]

  return (
    <div className={`rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary-500 ${disabled ? 'opacity-60' : ''} ${className}`}>
      <div role="toolbar" aria-orientation="horizontal" aria-controls={editorId}
        aria-label={t('richText.toolbar')}
        className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-1.5 py-1">
        {tools.map(({ key, icon: Icon, run }) => (
          <button key={key} type="button" disabled={disabled} onClick={run}
            aria-label={t(`richText.${key}`)} title={t(`richText.${key}`)}
            aria-pressed={key === 'link' ? linkOpen : undefined}
            className={`${BTN} ${key === 'numberedList' ? 'relative after:absolute after:-top-0.5 after:text-[9px] after:font-bold after:content-["1"] after:start-1' : ''}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
          <input type="url" dir="ltr" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } }}
            aria-label={t('richText.linkUrl')} placeholder={t('richText.linkUrl')}
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" />
          <button type="button" onClick={applyLink}
            className="rounded-md bg-primary-400 px-2.5 py-1 text-xs font-semibold text-[#241906] transition-colors motion-reduce:transition-none hover:bg-primary-600">
            {t('richText.linkApply')}
          </button>
        </div>
      )}
      <div
        {...rest}
        ref={editor}
        id={editorId}
        dir={dir}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel || label.text || undefined}
        aria-labelledby={ariaLabelledBy || label.id || undefined}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        tabIndex={0}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        style={{ minHeight: minHeightFor(rows) }}
        className="rich-text w-full overflow-y-auto px-3 py-2 text-sm text-gray-900 focus:outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] [&_a]:text-primary-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ps-5"
      />
    </div>
  )
}

export default RichTextarea
