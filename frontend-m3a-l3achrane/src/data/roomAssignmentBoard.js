// Données mock pour l'écran back-office "Attribution des chambres" (glisser/sélectionner colocataires <-> chambres).
export const PROPERTIES = [
  {
    id: 'villa-anfa',
    name: 'Villa Anfa — colocation 5 chambres',
    place: 'Casablanca · Anfa Supérieur',
    anchorLabel: 'Pôle universitaire',
    anchorWord: 'campus',
    rooms: [
      { id: 'a', name: 'Chambre A', meta: 'Suite 18 m² · salle de bain privative · balcon', price: '2 400 Đh' },
      { id: 'b', name: 'Chambre B', meta: '14 m² · vue jardin · bureau intégré', price: '1 900 Đh' },
      { id: 'c', name: 'Chambre C', meta: '12 m² · salle de bain partagée', price: '1 650 Đh' },
      { id: 'd', name: 'Chambre D', meta: '16 m² · dressing · côté rue', price: '2 100 Đh' },
      { id: 'e', name: 'Chambre E', meta: '11 m² · mezzanine · lit simple', price: '1 500 Đh' },
    ],
    candidates: [
      { id: 'c1', name: 'Yasmine Berrada', profile: 'Étudiante M2 · ENCG Casablanca', anchor: 'ENCG Casablanca', distance: '1,8 km', commute: '11 min à pied', budget: '2 200–2 600 Đh', tags: ['Non-fumeuse', 'Lève-tôt', 'Dossier vérifié'], scores: { a: 94, b: 88, c: 71, d: 86, e: 64 } },
      { id: 'c2', name: 'Omar El Idrissi', profile: 'Étudiant L3 · Université Hassan II', anchor: 'Fac. sciences Aïn Chock', distance: '4,2 km', commute: '18 min en tram', budget: '1 500–1 900 Đh', tags: ['Sportif', 'Cuisine ensemble'], scores: { a: 68, b: 84, c: 90, d: 74, e: 82 } },
      { id: 'c3', name: 'Salma Ouazzani', profile: 'Étudiante 2e année · ISCAE', anchor: 'ISCAE Casablanca', distance: '2,6 km', commute: '14 min en bus', budget: '1 800–2 200 Đh', tags: ['Calme', 'Études le soir', 'Garante locale'], scores: { a: 81, b: 92, c: 79, d: 88, e: 70 } },
      { id: 'c4', name: 'Mehdi Tazi', profile: 'Salarié junior · Casanearshore', anchor: 'Casanearshore Park', distance: '6,1 km', commute: '24 min en voiture', budget: '2 000–2 400 Đh', tags: ['Horaires décalés', 'Télétravail 2j'], scores: { a: 86, b: 76, c: 66, d: 91, e: 61 } },
      { id: 'c5', name: 'Nada Chraibi', profile: 'Étudiante 1re année · EMSI', anchor: 'EMSI Maârif', distance: '3,4 km', commute: '20 min en tram', budget: '1 400–1 700 Đh', tags: ['Première location', 'Non-fumeuse'], scores: { a: 62, b: 73, c: 85, d: 69, e: 93 } },
      { id: 'c6', name: 'Ilyas Benjelloun', profile: 'Doctorant · Université Hassan II', anchor: 'Campus Aïn Chock', distance: '4,8 km', commute: '22 min en tram', budget: '1 600–2 000 Đh', tags: ['Très calme', 'Longue durée'], scores: { a: 75, b: 87, c: 83, d: 78, e: 80 } },
    ],
    initialAssignment: { a: 'c1', c: 'c5' },
  },
  {
    id: 'al-manar',
    name: 'Résidence Al Manar — 4 chambres',
    place: 'Casablanca · Sidi Maârouf',
    anchorLabel: 'Zone entreprises',
    anchorWord: 'lieu de travail',
    rooms: [
      { id: 'a', name: 'Chambre 1', meta: '15 m² · meublée · fibre 200 Mb', price: '2 300 Đh' },
      { id: 'b', name: 'Chambre 2', meta: '13 m² · coin bureau', price: '2 000 Đh' },
      { id: 'c', name: 'Chambre 3', meta: '17 m² · salle de bain privative', price: '2 600 Đh' },
      { id: 'd', name: 'Chambre 4', meta: '12 m² · côté cour, très calme', price: '1 800 Đh' },
    ],
    candidates: [
      { id: 'd1', name: 'Hamza Naciri', profile: 'Ingénieur · Capgemini Casanearshore', anchor: 'Casanearshore Park', distance: '1,2 km', commute: '9 min à pied', budget: '2 200–2 700 Đh', tags: ['CDI vérifié', 'Non-fumeur'], scores: { a: 92, b: 84, c: 95, d: 77 } },
      { id: 'd2', name: 'Aya Lamrani', profile: 'Consultante · Deloitte Casa Finance City', anchor: 'Casa Finance City', distance: '7,4 km', commute: '26 min en voiture', budget: '2 000–2 400 Đh', tags: ['Déplacements fréquents', 'Calme'], scores: { a: 83, b: 90, c: 79, d: 86 } },
      { id: 'd3', name: 'Rachid Amrani', profile: 'Technicien · Renault Nearshore', anchor: 'Sidi Maârouf', distance: '2,9 km', commute: '13 min en bus', budget: '1 700–2 000 Đh', tags: ['Horaires postés', 'Longue durée'], scores: { a: 71, b: 80, c: 68, d: 93 } },
      { id: 'd4', name: 'Khadija Sefrioui', profile: 'Analyste · Attijariwafa Bank', anchor: 'Siège Casa-Anfa', distance: '8,8 km', commute: '31 min en tram', budget: '2 100–2 500 Đh', tags: ['Dossier vérifié', 'Télétravail 3j'], scores: { a: 87, b: 82, c: 88, d: 74 } },
    ],
    initialAssignment: { c: 'd1' },
  },
  {
    id: 'riad-bab-doukkala',
    name: 'Riad Bab Doukkala — 3 chambres',
    place: 'Marrakech · Médina',
    anchorLabel: 'Écoles & université',
    anchorWord: 'campus',
    rooms: [
      { id: 'a', name: 'Chambre Zellige', meta: '16 m² · patio · plafond cèdre', price: '1 900 Đh' },
      { id: 'b', name: 'Chambre Menara', meta: '13 m² · fenêtre patio', price: '1 600 Đh' },
      { id: 'c', name: 'Chambre Terrasse', meta: '14 m² · accès terrasse privée', price: '1 750 Đh' },
    ],
    candidates: [
      { id: 'e1', name: 'Zineb Fassi', profile: 'Étudiante · UCA Semlalia', anchor: 'Université Cadi Ayyad', distance: '3,1 km', commute: '17 min en bus', budget: '1 500–1 900 Đh', tags: ['Non-fumeuse', 'Musique douce'], scores: { a: 91, b: 78, c: 85 } },
      { id: 'e2', name: 'Anas Bouhaddou', profile: 'Étudiant · ESITH Marrakech', anchor: 'ESITH Marrakech', distance: '4,6 km', commute: '21 min en bus', budget: '1 400–1 700 Đh', tags: ['Sportif', 'Cuisine ensemble'], scores: { a: 74, b: 89, c: 80 } },
      { id: 'e3', name: 'Lina Haddaoui', profile: 'Étudiante · École hôtelière', anchor: 'ISTAHT Marrakech', distance: '2,2 km', commute: '12 min à pied', budget: '1 600–1 900 Đh', tags: ['Stage en soirée', 'Calme'], scores: { a: 82, b: 76, c: 94 } },
    ],
    initialAssignment: {},
  },
]
