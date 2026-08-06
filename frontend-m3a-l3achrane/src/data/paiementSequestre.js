// Données mock pour l'écran Paiement — statut séquestre + détail du montant.
// Les libellés d'étapes/lignes vivent dans app.json (namespace app, section paiement) ; ce fichier
// ne garde que les valeurs de données (montants, dates) et les identifiants stables.
export const paiementSequestre = {
  annonce: {
    titre: 'Chambre privée — Maârif, Casablanca',
    entree: '1er septembre 2026',
  },
  etapes: [
    { id: 'depot', statut: 'fait', mark: '✓' },
    { id: 'contrat', statut: 'en_cours', mark: '2' },
    { id: 'etat_lieux', statut: 'attente', mark: '3' },
    { id: 'liberation', statut: 'attente', mark: '4' },
  ],
  lignes: [
    { id: 'loyer', montant: 2400 },
    { id: 'charges', montant: 0 },
    { id: 'caution', montant: 2400 },
    { id: 'frais_service', montant: 1900 },
  ],
  total: 6700,
}
