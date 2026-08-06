// Données mock pour l'écran Paiement — statut séquestre + détail du montant.
export const paiementSequestre = {
  annonce: {
    titre: 'Chambre privée — Maârif, Casablanca',
    entree: '1er septembre 2026',
  },
  etapes: [
    { id: 'depot', label: 'Fonds déposés', statut: 'fait', mark: '✓' },
    { id: 'contrat', label: 'Contrat signé', statut: 'en_cours', mark: '2' },
    { id: 'etat_lieux', label: 'État des lieux', statut: 'attente', mark: '3' },
    { id: 'liberation', label: 'Fonds libérés', statut: 'attente', mark: '4' },
  ],
  lignes: [
    { label: 'Premier loyer', montant: 2400 },
    { label: 'Charges incluses', montant: 0 },
    { label: 'Caution (1 mois)', montant: 2400 },
    { label: 'Frais de service (1,5%)', montant: 1900 },
  ],
  total: 6700,
}
