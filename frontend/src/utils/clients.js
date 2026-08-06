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
