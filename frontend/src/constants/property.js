/**
 * Référentiels du bien immobilier, partagés par le wizard de vente en ligne.
 */
export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'villa', label: 'Villa' },
  { value: 'riad', label: 'Riad' },
  { value: 'land', label: 'Terrain' },
  { value: 'commercial', label: 'Local commercial' },
  { value: 'office', label: 'Bureau' },
  { value: 'garage', label: 'Garage/Parking' }
]

export const FEATURES = [
  { value: 'parking', label: 'Parking' },
  { value: 'garage', label: 'Garage' },
  { value: 'jardin', label: 'Jardin' },
  { value: 'terrasse', label: 'Terrasse' },
  { value: 'balcon', label: 'Balcon' },
  { value: 'piscine', label: 'Piscine' },
  { value: 'ascenseur', label: 'Ascenseur' },
  { value: 'gardien', label: 'Gardien' },
  { value: 'climatisation', label: 'Climatisation' },
  { value: 'chauffage', label: 'Chauffage' },
  { value: 'meublé', label: 'Meublé' },
  { value: 'cuisine équipée', label: 'Cuisine équipée' },
  { value: 'cave', label: 'Cave' },
  { value: 'vue mer', label: 'Vue mer' },
  { value: 'vue montagne', label: 'Vue montagne' },
  { value: 'duplex', label: 'Duplex' }
]

export const MOROCCAN_CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger',
  'Agadir', 'Meknès', 'Oujda', 'Kenitra', 'Tétouan',
  'El Jadida', 'Mohammedia', 'Beni Mellal', 'Nador', 'Safi'
]

export const DOC_TYPES = [
  {
    value: 'titre_foncier',
    label: 'Titre de propriété / titre foncier',
    description: 'Indispensable pour finaliser la vente chez le notaire'
  },
  {
    value: 'cin',
    label: "Pièce d'identité (CIN)",
    description: 'Pour vérifier votre identité de propriétaire'
  },
  {
    value: 'plan',
    label: 'Plan du bien',
    description: 'Aide les acheteurs à se projeter'
  },
  {
    value: 'reglement_copropriete',
    label: 'Règlement de copropriété',
    description: 'Pour les appartements en copropriété'
  },
  {
    value: 'diagnostic',
    label: 'Diagnostics / certificats',
    description: 'Électricité, conformité... si disponibles'
  },
  {
    value: 'autre',
    label: 'Autre document',
    description: 'Tout document utile à la vente'
  }
]
