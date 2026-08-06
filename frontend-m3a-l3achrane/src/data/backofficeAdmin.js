// Mock data for the back-office admin dashboard surface.
// Status/enum fields are keyed on raw values (never on display text) —
// the surface maps them to labels/tones locally.

export const BACKOFFICE_NAV = [
  { id: 'overview', icon: 'layout-grid', label: "Vue d'ensemble", title: "Vue d'ensemble", subtitle: 'Activité de la plateforme — 30 derniers jours' },
  { id: 'verif', icon: 'shield-check', label: 'Vérifications', count: 23, title: 'Vérifications d’identité', subtitle: 'File KYC — CIN, statut étudiant, attestation employeur' },
  { id: 'listings', icon: 'building-2', label: 'Annonces', count: 8, title: 'Modération des annonces', subtitle: 'Contrôle qualité et conformité des logements publiés' },
  { id: 'users', icon: 'users', label: 'Utilisateurs', title: 'Utilisateurs', subtitle: 'Chercheurs, hôtes et partenaires institutionnels' },
  { id: 'contracts', icon: 'file-signature', label: 'Contrats & paiements', title: 'Contrats & paiements', subtitle: 'Baux signés en ligne et dépôts de garantie séquestrés' },
  { id: 'reports', icon: 'flag', label: 'Signalements', count: 5, title: 'Signalements', subtitle: 'Litiges et contenus signalés par la communauté' },
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

export const OVERVIEW_KPIS = [
  { id: 'verified-profiles', label: 'Profils vérifiés', value: '8 412', delta: '6,2 %', trend: 'up' },
  { id: 'active-listings', label: 'Annonces actives', value: '1 284', delta: '3,1 %', trend: 'up' },
  { id: 'matches', label: 'Mises en relation', value: '396', delta: '18,4 %', trend: 'up' },
  { id: 'verif-delay', label: 'Délai de vérification', value: '4 h 12', delta: '11 %', trend: 'down' },
]

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
  { id: 'pending', label: 'En attente' },
  { id: 'relaunched', label: 'Relancés' },
  { id: 'rejected', label: 'Refusés' },
  { id: 'validated', label: 'Validés' },
]

export const VERIFICATIONS = [
  {
    id: 'v-1', initials: 'YB', name: 'Youssef Benali', meta: 'Étudiant — ENCG Casablanca',
    doc: 'CIN + carte étudiant', age: 'il y a 42 min',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'warn' },
    ],
  },
  {
    id: 'v-2', initials: 'IM', name: 'Imane Mrabet', meta: 'Salariée — OCP Group',
    doc: 'CIN + attestation', age: 'il y a 1 h 10',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
  {
    id: 'v-3', initials: 'AK', name: 'Anas El Khattabi', meta: 'Hôte — 3 annonces',
    doc: 'Titre de propriété', age: 'il y a 2 h 05',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'warn' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
  {
    id: 'v-4', initials: 'SL', name: 'Salma Lahlou', meta: 'Étudiante — UM6P Benguerir',
    doc: 'CIN + carte étudiant', age: 'il y a 3 h 30',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
  {
    id: 'v-5', initials: 'MR', name: 'Mehdi Raji', meta: 'Salarié — Attijariwafa',
    doc: 'CIN + bulletin de paie', age: 'il y a 4 h 48',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'warn' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
  {
    id: 'v-6', initials: 'NC', name: 'Nada Cherkaoui', meta: 'Hôte — 1 annonce',
    doc: 'Bail + CIN', age: 'il y a 6 h 12',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'ok' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
  {
    id: 'v-7', initials: 'OT', name: 'Omar Tazi', meta: 'Étudiant — EMI Rabat',
    doc: 'CIN + carte étudiant', age: 'il y a 8 h 03',
    checks: [
      { id: 'c1', label: 'Lisibilité du document', status: 'ok' },
      { id: 'c2', label: 'Concordance nom / prénom', status: 'ok' },
      { id: 'c3', label: 'Validité (date d’expiration)', status: 'warn' },
      { id: 'c4', label: 'Selfie de correspondance', status: 'ok' },
    ],
  },
]

export const LISTINGS = [
  { id: 'ANN-4482', title: 'Chambre lumineuse — Maârif, proche BD Zerktouni', city: 'Casablanca', rent: '2 400 MAD', host: 'A. El Khattabi', status: 'published' },
  { id: 'ANN-4479', title: 'Colocation 3 chambres — Agdal', city: 'Rabat', rent: '1 900 MAD', host: 'N. Cherkaoui', status: 'review' },
  { id: 'ANN-4476', title: 'Studio meublé — Hivernage', city: 'Marrakech', rent: '3 200 MAD', host: 'K. Benjelloun', status: 'published' },
  { id: 'ANN-4470', title: 'Chambre en résidence étudiante — Benguerir', city: 'Benguerir', rent: '1 500 MAD', host: 'Résidence UM6P', status: 'published' },
  { id: 'ANN-4471', title: 'Appartement partagé — Gueliz, 2e étage', city: 'Marrakech', rent: '2 800 MAD', host: 'S. Fassi', status: 'unpublished' },
  { id: 'ANN-4468', title: 'Chambre chez l’habitant — Souissi', city: 'Rabat', rent: '2 100 MAD', host: 'L. Berrada', status: 'review' },
  { id: 'ANN-4465', title: 'Duplex 4 places — Californie', city: 'Casablanca', rent: '2 650 MAD', host: 'Y. Sqalli', status: 'published' },
]
export const LISTINGS_TOTAL = 1284

export const USER_STATS = [
  { id: 'active-accounts', label: 'Comptes actifs', value: '11 903' },
  { id: 'seekers', label: 'Chercheurs', value: '9 470' },
  { id: 'hosts', label: 'Hôtes', value: '2 218' },
  { id: 'partners', label: 'Partenaires', value: '215' },
]

export const USERS = [
  { id: 'u-1', initials: 'KA', name: 'Kenza Amrani', email: 'kenza.amrani@um6p.ma', role: 'Chercheuse', joined: '12 juil. 2026', verification: 'verified', flags: 0 },
  { id: 'u-2', initials: 'AK', name: 'Anas El Khattabi', email: 'a.khattabi@gmail.com', role: 'Hôte', joined: '04 juin 2026', verification: 'verified', flags: 1 },
  { id: 'u-3', initials: 'IM', name: 'Imane Mrabet', email: 'i.mrabet@ocpgroup.ma', role: 'Chercheuse', joined: '28 juil. 2026', verification: 'pending', flags: 0 },
  { id: 'u-4', initials: 'SF', name: 'Sofia Fassi', email: 'sofia.fassi@outlook.com', role: 'Hôte', joined: '19 mars 2026', verification: 'suspended', flags: 4 },
  { id: 'u-5', initials: 'RM', name: 'Résidence Al Manar', email: 'contact@almanar.ma', role: 'Partenaire', joined: '02 févr. 2026', verification: 'verified', flags: 0 },
  { id: 'u-6', initials: 'OT', name: 'Omar Tazi', email: 'omar.tazi@emi.ac.ma', role: 'Chercheur', joined: '30 juil. 2026', verification: 'pending', flags: 0 },
  { id: 'u-7', initials: 'LB', name: 'Leila Berrada', email: 'l.berrada@gmail.com', role: 'Hôte', joined: '11 janv. 2026', verification: 'verified', flags: 2 },
]

export const CONTRACTS_MONEY = [
  { id: 'escrow', label: 'Dépôts sous séquestre', value: '2,84 M MAD', note: '1 106 contrats en cours' },
  { id: 'commissions', label: 'Commissions du mois', value: '318 400 MAD', note: 'Taux moyen 4,2 %' },
  { id: 'disputes', label: 'Litiges ouverts', value: '7', note: '2 en arbitrage externe' },
]

export const CONTRACTS = [
  { id: 'CTR-1204', parties: 'K. Amrani ↔ A. El Khattabi', period: 'Sept. 26 – Juin 27', deposit: '4 800 MAD', status: 'active' },
  { id: 'CTR-1201', parties: 'O. Tazi ↔ Résidence Al Manar', period: 'Sept. 26 – Juil. 27', deposit: '3 000 MAD', status: 'signature' },
  { id: 'CTR-1198', parties: 'I. Mrabet ↔ N. Cherkaoui', period: 'Août 26 – Août 27', deposit: '3 800 MAD', status: 'active' },
  { id: 'CTR-1191', parties: 'M. Raji ↔ Y. Sqalli', period: 'Juil. 26 – Juin 27', deposit: '5 300 MAD', status: 'litigation' },
  { id: 'CTR-1187', parties: 'S. Lahlou ↔ K. Benjelloun', period: 'Juin 26 – Mai 27', deposit: '6 400 MAD', status: 'active' },
  { id: 'CTR-1180', parties: 'H. Alaoui ↔ L. Berrada', period: 'Sept. 25 – Juin 26', deposit: '4 200 MAD', status: 'closed' },
]

export const REPORTS = [
  {
    id: 'SIG-0442', age: 'il y a 3 h', priority: 'urgent', initials: 'IM', by: 'Imane Mrabet',
    title: 'Comportement inapproprié en messagerie',
    body: 'L’hôte insiste pour un paiement hors plateforme et refuse la signature du bail en ligne. Trois relances documentées dans la conversation.',
  },
  {
    id: 'SIG-0441', age: 'il y a 9 h', priority: 'normal', initials: 'OT', by: 'Omar Tazi',
    title: 'Annonce non conforme aux photos',
    body: 'La chambre visitée ne correspond pas aux visuels publiés : surface et exposition différentes. Demande de retrait de l’annonce ANN-4471.',
  },
  {
    id: 'SIG-0439', age: 'il y a 1 j', priority: 'urgent', initials: 'MR', by: 'Mehdi Raji',
    title: 'État des lieux contesté — retenue sur dépôt',
    body: 'Retenue de 2 000 MAD sur le dépôt sans justificatif photographique. Le locataire fournit un état des lieux d’entrée signé.',
  },
  {
    id: 'SIG-0436', age: 'il y a 2 j', priority: 'normal', initials: 'SL', by: 'Salma Lahlou',
    title: 'Profil dupliqué',
    body: 'Deux comptes hôtes utilisent les mêmes photos et le même numéro de téléphone pour des annonces distinctes à Marrakech.',
  },
]

export const MATCHING_RULES = [
  { id: 'rule-min-score', label: 'Score de compatibilité minimum', desc: 'Masquer les annonces sous 55 % de compatibilité dans les résultats du chercheur.', enabled: true },
  { id: 'rule-verif-required', label: 'Vérification obligatoire avant contact', desc: 'Le chercheur doit avoir une CIN validée pour ouvrir une conversation.', enabled: true },
  { id: 'rule-auto-publish', label: 'Publication automatique des annonces', desc: 'Publier sans revue humaine si l’hôte a déjà 3 baux clôturés sans litige.', enabled: false },
  { id: 'rule-escrow', label: 'Séquestre du dépôt de garantie', desc: 'Bloquer le dépôt jusqu’à confirmation de l’état des lieux par les deux parties.', enabled: true },
]

export const TEAM = [
  { id: 't-1', initials: 'SA', name: 'Salma Aït Bella', email: 's.aitbella@m3a-l3chrane.ma', role: 'Admin' },
  { id: 't-2', initials: 'RB', name: 'Rachid Bouzid', email: 'r.bouzid@m3a-l3chrane.ma', role: 'Modération' },
  { id: 't-3', initials: 'HL', name: 'Hind Lamrani', email: 'h.lamrani@m3a-l3chrane.ma', role: 'Conformité' },
  { id: 't-4', initials: 'ZT', name: 'Zakaria Tahiri', email: 'z.tahiri@m3a-l3chrane.ma', role: 'Support' },
]
