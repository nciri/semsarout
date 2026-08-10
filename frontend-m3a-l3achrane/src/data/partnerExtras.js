// Mock data for the partner portal sub-screens (Lot E). No backend exists yet for these
// domains — everything here is static demo data, consumed directly by the surfaces/partner/*
// screens without going through the services/api layer (no network call to fake).

export const affiliates = [
  { id: 1, nom: 'Université Mohammed V', ville: 'Rabat', logementsEtudiants: 340, statut: 'actif' },
  { id: 2, nom: 'ENSA Casablanca', ville: 'Casablanca', logementsEtudiants: 128, statut: 'actif' },
  { id: 3, nom: 'OCP Group', ville: 'Khouribga', logementsEtudiants: 96, statut: 'actif' },
  { id: 4, nom: 'Université Hassan II', ville: 'Casablanca', logementsEtudiants: 212, statut: 'suspendu' },
  { id: 5, nom: 'École Centrale Casablanca', ville: 'Casablanca', logementsEtudiants: 54, statut: 'enAttente' },
]

export const verificationRequests = [
  { id: 1, etudiant: 'Youssef Benali', document: "Carte d'étudiant", statut: 'enAttente', date: '2026-08-05' },
  { id: 2, etudiant: 'Imane Mrabet', document: 'CIN', statut: 'enAttente', date: '2026-08-05' },
  { id: 3, etudiant: 'Nadia Chraibi', document: "Attestation d'inscription", statut: 'validee', date: '2026-08-03' },
  { id: 4, etudiant: 'Karim Idrissi', document: "Carte d'étudiant", statut: 'rejetee', date: '2026-08-02' },
  { id: 5, etudiant: 'Salma Ouazzani', document: 'CIN', statut: 'validee', date: '2026-08-01' },
]

export const reservedOffers = [
  { id: 1, annonce: 'Studio meublé — Agdal', reserveePour: 'Université Mohammed V', periode: 'Sept. 2026 — Juin 2027', statut: 'active' },
  { id: 2, annonce: 'Colocation 3 chambres — Maarif', reserveePour: 'ENSA Casablanca', periode: 'Sept. 2026 — Juin 2027', statut: 'active' },
  { id: 3, annonce: 'Chambre chez l’habitant — Hay Riad', reserveePour: 'OCP Group', periode: 'Oct. 2026 — Mars 2027', statut: 'expiree' },
  { id: 4, annonce: 'Appartement 2 pièces — Bourgogne', reserveePour: 'Université Hassan II', periode: 'Sept. 2026 — Juin 2027', statut: 'enAttente' },
]

export const grants = [
  { id: 1, programme: 'Bourse logement — Rectorat Rabat', beneficiaire: 'Youssef Benali', montant: 1500, statut: 'versee' },
  { id: 2, programme: 'Aide sociale ENSA', beneficiaire: 'Imane Mrabet', montant: 900, statut: 'enCours' },
  { id: 3, programme: 'Fonds solidarité OCP', beneficiaire: 'Karim Idrissi', montant: 2000, statut: 'enAttente' },
  { id: 4, programme: 'Bourse logement — Rectorat Rabat', beneficiaire: 'Nadia Chraibi', montant: 1500, statut: 'versee' },
]

export const reportingRows = [
  { periode: 'Mai 2026', verifications: 84, subventionsVersees: 12, montantTotal: 18500 },
  { periode: 'Juin 2026', verifications: 112, subventionsVersees: 18, montantTotal: 27200 },
  { periode: 'Juillet 2026', verifications: 96, subventionsVersees: 15, montantTotal: 22600 },
]

// No demo invoices — this shows the empty state rather than fabricating billing history.
export const invoices = []

export const apiKeys = [
  { id: 1, label: 'Clé de production', masked: 'sk_live_••••••••4f2a', creee: '2026-03-12', statut: 'active' },
  { id: 2, label: 'Clé de test', masked: 'sk_test_••••••••91c7', creee: '2026-01-20', statut: 'active' },
]

export const webhooks = [
  { id: 1, url: 'https://partenaire-univ.example.ma/hooks/verifications', evenements: ['verification.validee', 'verification.rejetee'], statut: 'actif' },
  { id: 2, url: 'https://ocp-rh.example.ma/hooks/subventions', evenements: ['subvention.versee'], statut: 'actif' },
  { id: 3, url: 'https://ensa-scolarite.example.ma/hooks/offres', evenements: ['offre.reservee', 'offre.expiree'], statut: 'inactif' },
]
