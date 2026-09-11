import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useNavigationPending from '../../hooks/useNavigationPending'

/**
 * Écran d'attente d'un fragment de page. Sans texte visible (le libellé passe
 * par `aria-label`) pour ne pas faire clignoter un mot pendant les quelques
 * dizaines de millisecondes que dure le chargement d'un fragment déjà en cache.
 */
export function RouteFallback() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label={t('loading')}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
    </div>
  )
}

/**
 * Sortie de route des mises en page (Outlet), avec la barrière Suspense posée
 * SOUS l'en-tête : une page qui se charge ne fait plus disparaître la navigation.
 *
 * S'y ajoute un bandeau de progression, parce que le `fallback` ci-dessus ne
 * s'affiche PAS lors d'une navigation client (`future.v7_startTransition`
 * conserve l'écran précédent) : sans lui, un clic sur réseau lent ne produit
 * aucun retour visuel et l'application paraît figée. Volontairement `fixed` et
 * non `absolute` : cela évite d'introduire un bloc conteneur qui déplacerait
 * les éléments positionnés en absolu à l'intérieur des pages.
 */
export default function RouteOutlet() {
  const { t } = useTranslation()
  const pending = useNavigationPending()

  return (
    <>
      {pending && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-blue-600"
          role="status"
          aria-label={t('loading')}
        />
      )}
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </>
  )
}
