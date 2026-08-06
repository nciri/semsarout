export const reportTargets = [
  { value: 'profil', label: 'Un profil' },
  { value: 'annonce', label: 'Une annonce' },
  { value: 'message', label: 'Un message' },
]

export const reportReasons = [
  { value: 'avance', label: "Demande d'avance avant visite" },
  { value: 'photo', label: 'Annonce ou photo suspecte' },
  { value: 'comportement', label: 'Comportement déplacé' },
  { value: 'sortie-plateforme', label: 'Tentative de sortie de la plateforme' },
  { value: 'discrimination', label: 'Contenu discriminatoire' },
  { value: 'autre', label: 'Autre' },
]

export const blockedUsers = [
  { id: 'usr-48213', initials: 'XZ', name: 'Utilisateur #48213' },
  { id: 'usr-51022', initials: 'KM', name: 'Utilisateur #51022' },
]

export const safetyTips = [
  { id: 'tip-avance', text: "Ne versez jamais d'argent avant d'avoir visité le logement en personne." },
  { id: 'tip-messagerie', text: "Restez sur la messagerie interne jusqu'à ce que l'identité soit vérifiée des deux côtés." },
  { id: 'tip-badge', text: 'Vérifiez le badge « Vérifié » et l’ancienneté du profil avant d’échanger des informations sensibles.' },
  { id: 'tip-paiement', text: 'Signalez toute demande de paiement en dehors du parcours contrat et séquestre.' },
]
