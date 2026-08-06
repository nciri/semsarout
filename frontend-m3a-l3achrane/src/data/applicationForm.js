// Données mock pour la surface Candidature (application-form).
// Récapitulatif de l'annonce ciblée + créneaux de visite proposables.

export const applicationListing = {
  titre: 'Chambre privée',
  quartier: 'Maârif',
  ville: 'Casablanca',
  prixMad: 2400,
}

export const applicationMatch = {
  pct: 91,
  raisons: [
    'Même rythme de sommeil',
    'Non-fumeuse',
    'À 11 min à pied de l’ENCG Casablanca',
    'Budget aligné',
  ],
}

export const applicationSlots = [
  { id: 'sat-am', label: 'Sam. 9 août, matin', selected: true },
  { id: 'sat-pm', label: 'Sam. 9 août, après-midi', selected: false },
  { id: 'sun-am', label: 'Dim. 10 août, matin', selected: true },
  { id: 'video', label: 'En visio', selected: false },
]

export const applicationHost = {
  nom: 'Hajar B.',
}
