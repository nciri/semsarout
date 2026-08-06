// Mock data — candidatures reçues pour une annonce (écran Candidatures reçues)
export const applicationsInbox = {
  listing: { titre: 'Chambre privée', quartier: 'Maârif', ville: 'Casablanca' },
  slots: [
    { id: 'sam-15h', label: 'Sam. 9 août, 15h' },
    { id: 'sam-17h', label: 'Sam. 9 août, 17h' },
    { id: 'dim-11h', label: 'Dim. 10 août, 11h' },
  ],
  applications: [
    {
      id: 1,
      nom: 'Yasmine Berrada',
      profil: 'Étudiante M2 · ENCG Casablanca',
      recue: 'Reçue il y a 2h',
      score: 94,
      message:
        "Bonjour, je suis très intéressée par la chambre, disponible dès le 1er septembre. Je peux passer samedi si besoin.",
      statut: 'pending',
      slotId: null,
    },
    {
      id: 2,
      nom: 'Salma Ouazzani',
      profil: 'Étudiante 2e année · ISCAE',
      recue: 'Reçue hier',
      score: 88,
      message:
        "Bonjour ! Le logement m'intéresse beaucoup, je cherche un cadre calme pour étudier. Dispo ce week-end.",
      statut: 'accepted',
      slotId: 'sam-17h',
    },
    {
      id: 3,
      nom: 'Nada Chraibi',
      profil: 'Étudiante 1re année · EMSI',
      recue: 'Reçue il y a 3 jours',
      score: 69,
      message: 'Bonjour, première recherche de coloc pour moi, je suis flexible sur les visites.',
      statut: 'waiting',
      slotId: null,
    },
    {
      id: 4,
      nom: 'Ilyas Benjelloun',
      profil: 'Doctorant · Université Hassan II',
      recue: 'Reçue il y a 5 jours',
      score: 81,
      message: 'Bonsoir, je recherche un logement calme pour la durée de ma thèse, budget aligné.',
      statut: 'refused',
      slotId: null,
    },
  ],
}
