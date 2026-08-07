// Mock data for the back-office admin dashboard surface.
// Status/enum fields are keyed on raw values (never on display text) —
// the surface maps them to labels/tones locally.

export const BACKOFFICE_NAV = [
  { id: 'overview', icon: 'layout-grid', label: "Vue d'ensemble", title: "Vue d'ensemble", subtitle: 'Activité de la plateforme — 30 derniers jours' },
  { id: 'verif', icon: 'shield-check', label: 'Vérifications', count: 23, title: 'Vérifications d’identité', subtitle: 'File KYC — CIN, statut étudiant, attestation employeur' },
  { id: 'listings', icon: 'building-2', label: 'Annonces', count: 8, title: 'Modération des annonces', subtitle: 'Contrôle qualité et conformité des logements publiés' },
  { id: 'users', icon: 'users', label: 'Utilisateurs', title: 'Utilisateurs', subtitle: 'Chercheurs, hôtes et partenaires institutionnels' },
  { id: 'contracts', icon: 'file-signature', label: 'Contrats & paiements', title: 'Contrats & paiements', subtitle: 'Contrats de colocation et paiements associés' },
  { id: 'reports', icon: 'flag', label: 'Signalements', title: 'Signalements', subtitle: 'Litiges et contenus signalés par la communauté' },
  { id: 'settings', icon: 'settings', label: 'Paramètres', title: 'Paramètres', subtitle: 'Règles de matching, équipe et permissions' },
]

export const ADMIN_PROFILE = {
  initials: 'SA',
  name: 'Salma Aït Bella',
  role: 'Admin — Conformité',
}

export const VERIFICATION_QUEUE_NOTE = {
  title: 'File de vérification',
  body: 'Délai moyen de traitement : 4 h 12. Objectif interne < 6 h.',
}

export const MATCHES_CHART = [
  { label: 'S1', value: 34 }, { label: 'S2', value: 41 }, { label: 'S3', value: 38 },
  { label: 'S4', value: 52 }, { label: 'S5', value: 47 }, { label: 'S6', value: 61 },
  { label: 'S7', value: 58 }, { label: 'S8', value: 72 }, { label: 'S9', value: 66 },
  { label: 'S10', value: 81 }, { label: 'S11', value: 88 }, { label: 'S12', value: 96 },
]

export const TODAY_TODO = [
  { id: 'todo-1', title: '23 dossiers KYC en attente', meta: '6 dépassent la cible de 6 h' },
  { id: 'todo-2', title: '8 annonces à modérer', meta: '2 signalées pour photos non conformes' },
  { id: 'todo-3', title: '3 dépôts de garantie à libérer', meta: 'Fin de bail confirmée par les deux parties' },
  { id: 'todo-4', title: '1 litige à arbitrer', meta: 'Dossier LIT-2291 — état des lieux contesté' },
]

export const ACTIVITY_LOG = [
  { id: 'act-1', time: '14:38', text: 'Profil vérifié — Kenza Amrani (CIN + carte étudiante)', actor: 'S. Aït Bella', status: 'validated' },
  { id: 'act-2', time: '14:11', text: 'Annonce ANN-4471 dépubliée — photos trompeuses', actor: 'R. Bouzid', status: 'rejected' },
  { id: 'act-3', time: '13:52', text: 'Dépôt de garantie libéré — contrat CTR-1180', actor: 'Automatique', status: 'validated' },
  { id: 'act-4', time: '13:20', text: 'Signalement SIG-0442 ouvert — comportement inapproprié', actor: 'Communauté', status: 'in_progress' },
  { id: 'act-5', time: '12:47', text: 'Partenaire ajouté — Résidence Al Manar (Rabat)', actor: 'S. Aït Bella', status: 'validated' },
  { id: 'act-6', time: '11:59', text: 'Compte suspendu 30 j — annonces dupliquées', actor: 'R. Bouzid', status: 'rejected' },
]

export const VERIF_TABS = [
  { id: 'pending', label: 'En attente', icon: 'clock' },
  { id: 'relaunched', label: 'Relancés', icon: 'rotate-cw' },
  { id: 'rejected', label: 'Refusés', icon: 'x-circle' },
  { id: 'validated', label: 'Validés', icon: 'check-circle' },
]

