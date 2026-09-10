import { useTranslation } from 'react-i18next'

/**
 * Bandeau des problèmes de géométrie : un message par CAUSE, jamais par
 * conséquence — un mur invalide écarté du miroir serveur ne doit pas en plus
 * signaler ses ouvertures comme « mur introuvable », ce qui serait faux à
 * l'écran. Chaque ligne mène droit à l'élément fautif (`onSelect`) ; aucun
 * identifiant technique n'apparaît jamais dans le texte affiché.
 */
export default function GeometryProblems({ problems, onSelect, onRepair }) {
  const { t } = useTranslation(['dashboard'])
  const causes = problems.filter((p) => !p.derived)

  if (!causes.length) return null

  const canRepair = causes.some((p) => p.code === 'wall_too_short')

  return (
    <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
      <ul className="space-y-1">
        {causes.map((p, index) => (
          <li key={`${p.code}-${p.kind}-${p.id ?? index}`}>
            {/*
              Certains problèmes ne désignent aucun élément du plan
              (`geometry_too_large`, `wall_height`) : il n'y a rien à
              sélectionner, et leur texte ne dit d'ailleurs pas « Touchez pour
              le voir ». Les rendre en bouton de 44 px promettait une action qui
              n'arrivait jamais ; ils sont donc du simple texte.
            */}
            {p.kind && p.id ? (
              <button
                type="button"
                className="w-full min-h-[44px] text-left"
                onClick={() => onSelect({ kind: p.kind, id: p.id })}
              >
                {t(`dashboard:designEditor.problems.${p.code}`)}
              </button>
            ) : (
              <p className="min-h-[44px] flex items-center">{t(`dashboard:designEditor.problems.${p.code}`)}</p>
            )}
          </li>
        ))}
      </ul>
      {canRepair && (
        <button
          type="button"
          className="w-full min-h-[44px] font-semibold underline"
          onClick={onRepair}
        >
          {t('dashboard:designEditor.problems.repair')}
        </button>
      )}
    </div>
  )
}
