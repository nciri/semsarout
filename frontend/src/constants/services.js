import {
  FiHome, FiKey, FiUsers, FiCalendar, FiDollarSign, FiHelpCircle
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../utils/currency'
import { PRICING, priceLabel } from './pricing'

/**
 * Référentiel des services proposés — clés partagées entre la page Services,
 * la page Contact, l'inscription (users.interest) et les leads (leads.service).
 */
export const SERVICE_OPTIONS = {
  vente: {
    label: 'Vendre mon bien',
    shortLabel: 'Forfait Vente',
    description: `Forfait fixe ${priceLabel(PRICING.agencyForfait)} ${DIRHAM_SYMBOL}, sans commission`,
    icon: FiHome
  },
  'mise-en-location': {
    label: 'Mettre en location',
    shortLabel: 'Mise en Location',
    description: 'Nous trouvons le locataire idéal (1 mois de loyer)',
    icon: FiUsers
  },
  'gestion-locative': {
    label: 'Faire gérer ma location',
    shortLabel: 'Gestion Locative',
    description: 'Gestion complète pour 5% du loyer',
    icon: FiKey
  },
  'courte-duree': {
    label: 'Location courte durée',
    shortLabel: 'Location Courte Durée',
    description: `Plateforme StayManager.ma, dès ${PRICING.staymanager.manage} ${DIRHAM_SYMBOL}/bien/mois`,
    icon: FiCalendar
  },
  estimation: {
    label: 'Estimer mon bien',
    shortLabel: 'Estimation Gratuite',
    description: 'Estimation gratuite et sans engagement',
    icon: FiDollarSign
  },
  autre: {
    label: 'Autre demande',
    shortLabel: 'Autre',
    description: 'Une question, un projet particulier',
    icon: FiHelpCircle
  }
}

export const isValidService = (key) => Boolean(key && SERVICE_OPTIONS[key])

export const STAYMANAGER_REGISTER_URL = 'https://staymanager.ma/register'
