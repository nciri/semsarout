// Type de transaction déduit du type de client :
// acheteur / vendeur / investisseur → vente ; locataire / propriétaire → location.
export const CLIENT_TRANSACTION_TYPE = {
  buyer: 'sale',
  seller: 'sale',
  investor: 'sale',
  tenant: 'rent',
  landlord: 'rent',
}

export const transactionTypeForClient = (clientType) =>
  CLIENT_TRANSACTION_TYPE[clientType] || 'sale'

export const CLIENT_TYPE_LABELS = {
  buyer: 'Acheteur',
  seller: 'Vendeur',
  landlord: 'Propriétaire',
  tenant: 'Locataire',
  investor: 'Investisseur',
}

export const CLIENT_STATUS_LABELS = {
  active: 'Actif',
  prospect: 'Prospect',
  inactive: 'Inactif',
}
