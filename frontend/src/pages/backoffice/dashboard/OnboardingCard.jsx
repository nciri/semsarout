import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiX } from 'react-icons/fi'
import api from '../../../services/api'
import { IconAction } from '../components/kit'

const STORE = 'onboarding-hidden'
const hidden = () => {
  try { return localStorage.getItem(STORE) === '1' } catch { return false }
}
const hide = () => {
  try { localStorage.setItem(STORE, '1') } catch { /* stockage indisponible */ }
}

/**
 * Mise en route de l'agence. Les étapes viennent du service (état réel du compte), donc la
 * carte disparaît d'elle-même quand tout est fait : rien à cocher à la main.
 */
function OnboardingCard() {
  const { t } = useTranslation('backoffice')
  const [dismissed, setDismissed] = useState(hidden)
  const { data } = useQuery('backoffice-onboarding',
    async () => (await api.get('/backoffice/onboarding')).data, { staleTime: 60000 })

  // Rien à montrer sans la liste des étapes : le tableau de bord ne doit pas tomber si la
  // réponse n'a pas la forme attendue.
  if (dismissed || !Array.isArray(data?.steps) || data.complete) return null

  return (
    <section aria-labelledby="onboarding-title" className="grid gap-3 rounded-xl border border-primary-400 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="font-display text-[15px] font-bold">
            {t('onboarding.title')}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            {t('onboarding.progress', { completed: data.completed, total: data.total })}
          </p>
        </div>
        <IconAction icon={FiX} label={t('onboarding.dismiss')} tipAlign="end"
          onClick={() => { hide(); setDismissed(true) }} />
      </div>

      <div className="h-2 overflow-hidden rounded bg-gray-100" role="img"
        aria-label={t('onboarding.progress', { completed: data.completed, total: data.total })}>
        <span className="block h-full bg-primary-400" style={{ width: `${data.progress}%` }} />
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {data.steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 text-[13.5px]">
            <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full ${
              step.done ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {step.done ? <FiCheck className="h-3 w-3" aria-hidden="true" /> : null}
            </span>
            {step.done ? (
              <span className="text-gray-500 line-through">{t(`onboarding.steps.${step.key}`)}</span>
            ) : (
              <Link to={step.href} className="font-medium text-primary-700 hover:underline">
                {t(`onboarding.steps.${step.key}`)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
export default OnboardingCard
