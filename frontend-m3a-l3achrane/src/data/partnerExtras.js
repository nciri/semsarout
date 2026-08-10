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

// Champs et valeurs de statut alignés sur services/partner/app/schemas.py (RESERVATION_STATUSES)
// pour que le mode mock reflète fidèlement le contrat de l'API réelle.
export const reservedOffers = [
  { id: 1, listing_id: 'LST-1042', affilie_id: 1, label: 'Studio meublé — Agdal', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RESERVED' },
  { id: 2, listing_id: 'LST-2087', affilie_id: 2, label: 'Colocation 3 chambres — Maarif', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RESERVED' },
  { id: 3, listing_id: 'LST-3310', affilie_id: 3, label: 'Chambre chez l’habitant — Hay Riad', start_date: '2026-10-01', end_date: '2027-03-31', status: 'CONVERTED' },
  { id: 4, listing_id: 'LST-4118', affilie_id: 4, label: 'Appartement 2 pièces — Bourgogne', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RELEASED' },
]

// Champs et valeurs de statut alignés sur GRANT_STATUSES (services/partner/app/schemas.py).
export const grants = [
  { id: 1, program: 'Bourse logement — Rectorat Rabat', affilie_id: 1, amount: 1500, status: 'PAID' },
  { id: 2, program: 'Aide sociale ENSA', affilie_id: 2, amount: 900, status: 'PLANNED' },
  { id: 3, program: 'Fonds solidarité OCP', affilie_id: 3, amount: 2000, status: 'CANCELLED' },
  { id: 4, program: 'Bourse logement — Rectorat Rabat', affilie_id: 1, amount: 1500, status: 'PAID' },
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
