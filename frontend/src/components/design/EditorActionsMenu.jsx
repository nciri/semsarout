import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiImage, FiMoreVertical, FiRefreshCw } from 'react-icons/fi'

/**
 * Actions secondaires de l'éditeur de plan, regroupées dans un menu à trois
 * points à l'extrême droite de l'en-tête (patron du menu de carte de bien du
 * back-office, `pages/backoffice/Properties.jsx`).
 *
 * Pourquoi un menu : ces deux actions — importer la photo d'un plan papier,
 * reprendre un plan déjà tracé — se lancent une fois par plan, alors que
 * l'en-tête est lu en permanence. En boutons, elles faisaient passer l'en-tête
 * sur une seconde ligne et lui faisaient consommer 263 px sur les 1024 de la
 * plus petite tablette supportée, dans un éditeur doigts-seulement.
 *
 * Ce qui NE descend PAS ici : le badge de synchronisation et le bouton des
 * versions mises de côté, qui sont des alertes — elles doivent se voir sans
 * qu'on ouvre quoi que ce soit.
 *
 * L'import reste un `<label>` portant l'`<input type="file">` : c'est le seul
 * moyen d'ouvrir le sélecteur de fichiers de la tablette sans script.
 */
export default function EditorActionsMenu({ onImportBackground, onReuse }) {
  const { t } = useTranslation(['dashboard'])
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('dashboard:designEditor.actionsMenu')}
        className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg"
        onClick={() => setOpen((v) => !v)}
      >
        <FiMoreVertical className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
          {/* Cible tactile de 44 px par entrée : ce menu se manipule au doigt,
              sur un écran tenu à bout de bras. */}
          <label className="flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            <FiImage className="w-4 h-4 shrink-0" />
            {t('dashboard:designEditor.background.import')}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                // Le fichier est lu depuis `e.target` : on ferme le menu APRÈS
                // avoir passé l'évènement, pour ne pas démonter l'input avant.
                onImportBackground(e)
                setOpen(false)
              }}
            />
          </label>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 min-h-[44px] w-full text-start text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setOpen(false)
              onReuse()
            }}
          >
            <FiRefreshCw className="w-4 h-4 shrink-0" />
            {t('dashboard:designEditor.reuse.action')}
          </button>
        </div>
      )}
    </div>
  )
}
