import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiAlignCenter, FiAlignJustify, FiAlignLeft, FiAlignRight, FiBold, FiItalic, FiList,
  FiUnderline,
} from 'react-icons/fi'

/**
 * Éditeur du corps d'un contrat.
 *
 * Remplace l'éditeur Quill du produit pour cette surface : mesuré sur les cinq actes,
 * Quill fusionnait les cellules de la ligne d'en-tête des tableaux (« Étape » + « % » en une
 * seule cellule), donc un enregistrement abîmait l'échéancier VEFA et les annexes du bail.
 * TipTap les rend à l'identique (9 `th` → 9 `th`, 93 `td` → 93 `td` sur le bail).
 *
 * Le jeu d'extensions est calé sur l'allowlist produit (`semsar_common.html_sanitize`) :
 * tout ce qui n'y figure pas serait supprimé par le serveur de toute façon.
 */
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'],
                        alignments: ['left', 'center', 'right', 'justify'] }),
  Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
]

const BTN = 'p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors'
const BTN_ACTIF = 'p-1.5 rounded bg-primary-50 text-primary-700'

function Barre({ editor, t }) {
  if (!editor) return null
  const bouton = (cle, actif, action, Icone) => (
    <button key={cle} type="button" title={t(`contracts.editor.format.${cle}`)}
            aria-label={t(`contracts.editor.format.${cle}`)} aria-pressed={actif}
            onClick={action} className={actif ? BTN_ACTIF : BTN}>
      <Icone className="w-4 h-4" />
    </button>
  )
  const c = editor.chain().focus()
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
      {bouton('bold', editor.isActive('bold'), () => c.toggleBold().run(), FiBold)}
      {bouton('italic', editor.isActive('italic'), () => c.toggleItalic().run(), FiItalic)}
      {bouton('underline', editor.isActive('underline'), () => c.toggleUnderline().run(), FiUnderline)}
      <span className="w-px h-4 bg-gray-200 mx-1" />
      {[2, 3].map((n) => (
        <button key={`h${n}`} type="button" aria-pressed={editor.isActive('heading', { level: n })}
                title={t('contracts.editor.format.heading', { level: n })}
                aria-label={t('contracts.editor.format.heading', { level: n })}
                onClick={() => c.toggleHeading({ level: n }).run()}
                className={`${editor.isActive('heading', { level: n }) ? BTN_ACTIF : BTN} text-xs font-bold`}>
          H{n}
        </button>
      ))}
      {bouton('list', editor.isActive('bulletList'), () => c.toggleBulletList().run(), FiList)}
      <span className="w-px h-4 bg-gray-200 mx-1" />
      {bouton('alignLeft', editor.isActive({ textAlign: 'left' }), () => c.setTextAlign('left').run(), FiAlignLeft)}
      {bouton('alignCenter', editor.isActive({ textAlign: 'center' }), () => c.setTextAlign('center').run(), FiAlignCenter)}
      {bouton('alignRight', editor.isActive({ textAlign: 'right' }), () => c.setTextAlign('right').run(), FiAlignRight)}
      {bouton('alignJustify', editor.isActive({ textAlign: 'justify' }), () => c.setTextAlign('justify').run(), FiAlignJustify)}
    </div>
  )
}

export default function EditeurRiche({ value, onChange, readOnly = false }) {
  const { t } = useTranslation('backoffice')
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: { attributes: { class: 'prose-contrat px-5 py-4 min-h-[22rem] focus:outline-none' } },
  })

  // Le contenu arrive après le chargement du contrat : sans cette synchronisation l'éditeur
  // resterait vide. Comparé à `getHTML()` pour ne pas écraser la frappe en cours.
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  useEffect(() => { editor?.setEditable(!readOnly) }, [readOnly, editor])

  return (
    <div className="bg-white">
      {!readOnly && <Barre editor={editor} t={t} />}
      <EditorContent editor={editor} />
    </div>
  )
}
