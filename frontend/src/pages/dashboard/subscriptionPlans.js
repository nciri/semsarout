import { FiStar, FiZap, FiAward } from 'react-icons/fi'

// PRÉSENTATION SEULEMENT — aucun montant ici. Les prix viennent du catalogue (billing), seule
// source, éditable depuis /admin/tarifs : cette liste affichait aux agences des tarifs que le
// backend ne connaissait pas, donc un prix affiché pouvant différer du prix prélevé.
//
// Données pures (pas de JSX) : module séparé de `Subscription.jsx` pour que
// `react-refresh/only-export-components` n'y voie plus d'export non-composant, et pour que le
// test de parité `featuresIncluded` ↔ `features` i18n (I14) puisse les importer directement.

// Plans pour les particuliers (libellés/descriptions/features traduits via dashboard:subscription.plans.individual.ID)
export const INDIVIDUAL_PLANS = [
  {
    id: 'free',
    icon: FiStar,
    color: 'gray',
    featuresIncluded: [true, true, true, true, false, false, false],
    popular: false
  },
  {
    id: 'basic',
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, false, false],
    popular: true
  },
  {
    id: 'premium',
    icon: FiAward,
    color: 'purple',
    featuresIncluded: [true, true, true, true, true, true, true],
    popular: false
  }
]

// Plans pour les agences (libellés/descriptions/features traduits via dashboard:subscription.plans.agency.ID)
export const AGENCY_PLANS = [
  {
    id: 'starter',
    icon: FiStar,
    color: 'gray',
    // Le dernier `false` correspond à `design3d` (module payant conception 3D) : conforme à
    // has_design3d de `services/billing/app/seed.py`, réservé aux plans pro/enterprise (I14).
    featuresIncluded: [true, true, true, true, false, false, false, false, false, false],
    popular: false
  },
  {
    id: 'pro',
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, true, true, true, false, false, true],
    popular: true
  },
  {
    id: 'enterprise',
    icon: FiAward,
    color: 'purple',
    featuresIncluded: [true, true, true, true, true, true, true, true, true, true, true],
    popular: false
  }
]
