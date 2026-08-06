// Mock data — candidatures reçues côté propriétaire (écran Candidatures reçues)
//
// Flux de validation :
//  1. La candidature arrive chez le propriétaire (statut "received").
//  2. Le propriétaire présélectionne ("shortlisted").
//  3. Si la chambre est dans un logement déjà loué (colocataires en place),
//     la présélection est partagée aux colocataires pour validation
//     ("pending_roommate") avant d'être acceptée ("accepted").
//     Sinon le propriétaire valide directement ("accepted").
//  4. À tout moment avant acceptation, le propriétaire peut refuser ("refused").
export const applicationsInbox = {
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
      statut: 'received',
      slotId: null,
      annonce: {
        titre: 'Chambre privée',
        quartier: 'Maârif',
        ville: 'Casablanca',
        chambreDejaLouee: true,
        colocataires: [
          { nom: 'Sara Idrissi', avatar: null },
          { nom: 'Mehdi Alaoui', avatar: null },
        ],
      },
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
      annonce: {
        titre: 'Appartement entier T2',
        quartier: 'Gauthier',
        ville: 'Casablanca',
        chambreDejaLouee: false,
        colocataires: [],
      },
    },
    {
      id: 3,
      nom: 'Nada Chraibi',
      profil: 'Étudiante 1re année · EMSI',
      recue: 'Reçue il y a 3 jours',
      score: 69,
      message: 'Bonjour, première recherche de coloc pour moi, je suis flexible sur les visites.',
      statut: 'pending_roommate',
      slotId: null,
      annonce: {
        titre: 'Chambre privée',
        quartier: 'Maârif',
        ville: 'Casablanca',
        chambreDejaLouee: true,
        colocataires: [
          { nom: 'Sara Idrissi', avatar: null },
          { nom: 'Mehdi Alaoui', avatar: null },
        ],
      },
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
      annonce: {
        titre: 'Chambre avec balcon',
        quartier: "Racine",
        ville: 'Casablanca',
        chambreDejaLouee: true,
        colocataires: [{ nom: 'Karim Fassi', avatar: null }],
      },
    },
    {
      id: 5,
      nom: 'Hamza Tazi',
      profil: 'Étudiant 3e année · ENSAM',
      recue: 'Reçue il y a 6 jours',
      score: 77,
      message: 'Bonjour, je suis sérieux et non-fumeur, dispo pour visite quand vous voulez.',
      statut: 'shortlisted',
      slotId: null,
      annonce: {
        titre: 'Chambre avec balcon',
        quartier: 'Racine',
        ville: 'Casablanca',
        chambreDejaLouee: true,
        colocataires: [{ nom: 'Karim Fassi', avatar: null }],
      },
    },
    {
      id: 6,
      nom: 'Imane Sqalli',
      profil: 'Étudiante M1 · Université Hassan II',
      recue: 'Reçue il y a 1 semaine',
      score: 85,
      message: 'Bonjour, le studio correspond parfaitement à mon budget et à mes horaires de cours.',
      statut: 'shortlisted',
      slotId: null,
      annonce: {
        titre: 'Studio meublé',
        quartier: 'Bourgogne',
        ville: 'Casablanca',
        chambreDejaLouee: false,
        colocataires: [],
      },
    },
  ],
}
