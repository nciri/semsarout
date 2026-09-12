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

export const STAYMANAGER_REGISTER_URL = 'https://staymanager.ma/register'
