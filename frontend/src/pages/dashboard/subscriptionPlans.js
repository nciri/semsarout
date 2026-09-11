import { FiStar, FiZap, FiAward } from 'react-icons/fi'

// Données pures (pas de JSX) : module séparé de `Subscription.jsx` pour que
// `react-refresh/only-export-components` n'y voie plus d'export non-composant, et pour que le
// test de parité `featuresIncluded` ↔ `features` i18n (I14) puisse les importer directement.

// Plans pour les particuliers (libellés/descriptions/features traduits via dashboard:subscription.plans.individual.ID)
export const INDIVIDUAL_PLANS = [
  {
    id: 'free',
    price: 0,
    icon: FiStar,
    color: 'gray',
    featuresIncluded: [true, true, true, true, false, false, false],
    popular: false
  },
  {
    id: 'basic',
    price: 99,
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, false, false],
    popular: true
  },
  {
    id: 'premium',
    price: 199,
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
    price: 299,
    icon: FiStar,
    color: 'gray',
    // Le dernier `false` correspond à `design3d` (module payant conception 3D) : conforme à
    // has_design3d de `services/billing/app/seed.py`, réservé aux plans pro/enterprise (I14).
    featuresIncluded: [true, true, true, true, false, false, false, false, false, false],
    popular: false
  },
  {
    id: 'pro',
    price: 799,
    icon: FiZap,
    color: 'blue',
    featuresIncluded: [true, true, true, true, true, true, true, true, false, false, true],
    popular: true
  },
  {
    id: 'enterprise',
    price: 1999,
    icon: FiAward,
    color: 'purple',
    featuresIncluded: [true, true, true, true, true, true, true, true, true, true, true],
    popular: false
  }
]
