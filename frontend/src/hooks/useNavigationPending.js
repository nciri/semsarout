import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const liveUrl = () => window.location.pathname + window.location.search

/**
 * Vrai tant qu'une navigation est demandée mais pas encore affichée.
 *
 * Le routeur tourne avec `future.v7_startTransition` : une navigation passe par
 * `startTransition`, donc React CONSERVE l'écran précédent au lieu de montrer
 * le `fallback` du `<Suspense>`. C'est confortable quand le fragment de la page
 * visée est déjà chargé — mais depuis le découpage des routes, il peut aussi
 * s'agir d'un téléchargement : sans ce signal, l'utilisateur clique et
 * l'application paraît figée, sans le moindre retour visuel.
 *
 * Rien dans React n'expose une transition démarrée par le routeur. On compare
 * donc l'URL du navigateur — poussée SYNCHRONEMENT par `navigate()`, avant que
 * la transition ne soit rendue — au chemin effectivement affiché (`useLocation`
 * ne change qu'au commit de la transition). L'écart entre les deux est
 * exactement la fenêtre d'attente.
 */
export default function useNavigationPending() {
  const location = useLocation()
  const committed = location.pathname + location.search
  const [target, setTarget] = useState(liveUrl)

  useEffect(() => {
    // `history.pushState`/`replaceState` n'émettent aucun événement : le seul
    // moyen de savoir qu'une navigation vient d'être demandée est de les
    // envelopper. L'original est restauré au démontage, et l'enveloppe appelle
    // toujours l'implémentation native d'abord — le routeur ne voit aucune
    // différence.
    const patched = ['pushState', 'replaceState'].map((name) => {
      const original = window.history[name]
      window.history[name] = function withNotification(...args) {
        const result = original.apply(this, args)
        setTarget(liveUrl())
        return result
      }
      return [name, original]
    })
    const onPop = () => setTarget(liveUrl())
    window.addEventListener('popstate', onPop)
    return () => {
      patched.forEach(([name, original]) => { window.history[name] = original })
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  // La transition a été rendue : on se recale sur l'URL réelle, ce qui referme
  // la fenêtre d'attente même si la navigation s'est terminée ailleurs
  // (redirection interne, `<Navigate replace>`).
  useEffect(() => { setTarget(liveUrl()) }, [committed])

  return target !== committed
}
