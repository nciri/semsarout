// Rôles acceptés par le service contract (cf. `merge.ROLE_PLACEHOLDERS`) : un contrat peut
// nommer plusieurs vendeurs (copropriétaires, héritiers d'une indivision) ou plusieurs
// locataires (couple, colocataires). Les clés restent sans accent, seul l'affichage en porte.
export const PARTY_ROLES = ['vendeur', 'acquereur', 'bailleur', 'locataire', 'mandant']

export const emptyParty = (role = '') => ({ client_id: '', role })

// Seules les lignes complètes partent au serveur : il refuse un rôle vide, et une ligne
// à moitié remplie est une saisie en cours, pas une partie au contrat.
export const toPayload = (parties) => parties
  .filter((p) => p.client_id && p.role)
  .map((p) => ({ client_id: Number(p.client_id), role: p.role }))
