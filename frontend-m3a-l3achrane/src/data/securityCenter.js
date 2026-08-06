// Libellés (cibles de signalement, motifs, conseils de sécurité) vivent dans app.json
// (namespace app, section securite) ; ce fichier ne garde que les valeurs brutes.
export const reportTargets = [
  { value: 'profil' },
  { value: 'annonce' },
  { value: 'message' },
]

export const reportReasons = [
  { value: 'avance' },
  { value: 'photo' },
  { value: 'comportement' },
  { value: 'sortie-plateforme' },
  { value: 'discrimination' },
  { value: 'autre' },
]

export const blockedUsers = [
  { id: 'usr-48213', initials: 'XZ', name: 'Utilisateur #48213' },
  { id: 'usr-51022', initials: 'KM', name: 'Utilisateur #51022' },
]

export const safetyTips = [
  { id: 'tip-avance' },
  { id: 'tip-messagerie' },
  { id: 'tip-badge' },
  { id: 'tip-paiement' },
]
