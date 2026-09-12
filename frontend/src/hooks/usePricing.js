import { useQuery } from 'react-query'
import api from '../services/api'

/**
 * Tarifs du catalogue (billing) — SEULE source d'un montant affiché.
 *
 * Les montants vivaient auparavant dans `constants/pricing.js`, dupliqués dans le tunnel de
 * paiement et dans le service payment : porter le forfait de 4 900 à 9 900 demandait de toucher
 * huit endroits, et en oublier un affichait un prix pour en prélever un autre.
 *
 * `amountOf(code)` rend `null` — jamais un montant de repli — quand le catalogue est injoignable
 * ou que la prestation a quitté l'offre : un prix faux coûte plus cher qu'un prix absent, et
 * l'appelant doit afficher l'indisponibilité plutôt qu'un nombre inventé.
 */
export function usePricing() {
  const { data, isLoading, isError } = useQuery(
    'pricing',
    async () => {
      const { data: body } = await api.get('/pricing')
      return body
    },
    { staleTime: 5 * 60 * 1000 },
  )

  const services = data?.services ?? []
  const byCode = new Map(services.map((s) => [s.code, s]))

  return {
    isLoading,
    isError,
    services,
    plans: data?.plans ?? [],
    amountOf: (code) => byCode.get(code)?.amount ?? null,
  }
}

export default usePricing
