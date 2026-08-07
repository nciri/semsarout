// Mock data pour l'écran Avis (évaluations mutuelles après séjour).

export const stayContext = {
  partnerName: 'Salma Ouazzani',
  listingTitle: 'Chambre, ISCAE Casablanca',
  endedDate: '28 juin 2026',
}

export const reviewCriteria = [
  { key: 'respect', label: 'Respect des horaires et des règles', initial: 5 },
  { key: 'proprete', label: 'Propreté des parties communes', initial: 4 },
  { key: 'communication', label: 'Communication', initial: 5 },
  { key: 'conformite', label: "Conformité avec l'annonce", initial: 4 },
]

export const receivedReviews = [
  {
    id: 1,
    name: 'Yasmine Berrada',
    stars: 5,
    text: 'Colocataire très respectueuse, ponctuelle sur le loyer, je recommande.',
    date: 'Publié le 12 juin 2026',
  },
]

export const pendingReviewsCount = 1
export const pendingReviewsDelayDays = 9
