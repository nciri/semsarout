import {
  FiHome, FiKey, FiUsers, FiCalendar, FiDollarSign, FiHelpCircle
} from 'react-icons/fi'

/**
 * Référentiel des services proposés — clés partagées entre la page Services,
 * la page Contact, l'inscription (users.interest) et les leads (leads.service).
 *
 * Ne porte plus ni texte ni montant : les libellés vivent dans les catalogues i18n
 * (`common:services.<clé>.*`) et les prix dans le catalogue de billing (`usePricing`). Les
 * garder ici imposait du français en dur et un montant qui divergeait du prix prélevé.
 * `priceCode` relie une option à sa prestation facturable, quand elle en a une.
 */
export const SERVICE_OPTIONS = {
  vente: { icon: FiHome, priceCode: 'forfait-vente' },
  'mise-en-location': { icon: FiUsers, priceCode: null },
  'gestion-locative': { icon: FiKey, priceCode: null },
  'courte-duree': { icon: FiCalendar, priceCode: 'staymanager-manage' },
  estimation: { icon: FiDollarSign, priceCode: null },
  autre: { icon: FiHelpCircle, priceCode: null },
}

export const isValidService = (key) => Boolean(key && SERVICE_OPTIONS[key])

/**
 * Intentions déclarées à l'inscription par un ACHETEUR/chercheur. SERVICE_OPTIONS ci-dessus
 * est le catalogue des prestations VENDUES : ses entrées décrivent ce qu'un propriétaire veut
 * faire de son bien, un acheteur n'en coche aucune.
 */
const BUYER_INTENT_OPTIONS = {
  acheter: { icon: FiHome },
  louer: { icon: FiKey },
  colocation: { icon: FiUsers },
  investir: { icon: FiDollarSign },
  autre: { icon: FiHelpCircle },
}

/**
 * Options de la question d'intention, selon le rôle choisi plus haut dans le formulaire.
 * Rend une liste uniforme `{ key, icon, labelKey }` : l'appelant n'a pas à savoir de quel
 * catalogue i18n vient le libellé.
 */
export const intentOptionsFor = (accountRole) =>
  accountRole === 'buyer'
    ? Object.entries(BUYER_INTENT_OPTIONS).map(([key, opt]) => ({
        key, icon: opt.icon, labelKey: `auth:register.buyerIntents.${key}`,
      }))
    : Object.entries(SERVICE_OPTIONS).map(([key, opt]) => ({
        key, icon: opt.icon, labelKey: `common:services.${key}.label`,
      }))

export const STAYMANAGER_REGISTER_URL = 'https://staymanager.ma/register'
