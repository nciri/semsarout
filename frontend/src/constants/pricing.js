// Tarification affichée sur le site — SOURCE UNIQUE.
//
// Toute grille tarifaire *affichée* (forfaits, options, abonnements) se règle ICI.
// NB : la source de vérité des abonnements agence reste le backend (service billing,
// `/subscription-plans`) ; les valeurs `plans` ci-dessous ne servent que de repli
// d'affichage quand l'API ne renvoie rien.

import { DIRHAM_SYMBOL } from '../utils/currency'

export const PRICING = {
  // Forfait « Service d'agence en ligne » (vente) — tarif fixe.
  agencyForfait: 4900,
  // Options média ponctuelles (add-ons).
  addons: { virtualTour360: 500, drone: 800, video: 1200 },
  // Gestion locative (StayManager) — par bien / mois.
  staymanager: { manage: 179, automate: 299, optimize: 449 },
  // Abonnements agence (repli d'affichage ; source de vérité = backend billing).
  plans: {
    starter: { monthly: 299, yearly: 2990 },
    pro: { monthly: 799, yearly: 7990 },
    enterprise: { monthly: 1999, yearly: 19990 },
  },
}

// Helpers d'affichage : format français + symbole dirham.
export const priceLabel = (n) => Number(n).toLocaleString('fr-FR') // 4900 -> "4 900"
export const priceWithSymbol = (n) => `${priceLabel(n)} ${DIRHAM_SYMBOL}` // "4 900 Đh"
