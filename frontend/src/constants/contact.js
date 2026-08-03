// Coordonnées de contact affichées publiquement sur le site — SOURCE UNIQUE.
//
// Pour changer un numéro de téléphone ou un email affiché sur le site, il suffit de
// modifier ce fichier (ou de définir les variables d'environnement VITE_CONTACT_* au
// build, qui priment sur les valeurs par défaut ci-dessous).
//
// NB : les emails/téléphones issus des DONNÉES (lead.email, agency.phone, …) ne sont pas
// concernés — ils viennent de l'API. Ici, uniquement NOS coordonnées institutionnelles.

const env = import.meta.env

export const CONTACT = {
  // Numéro de téléphone — format lisible affiché à l'écran.
  phone: env.VITE_CONTACT_PHONE || '+212 6 94 46 18 07',
  // Même numéro, sans espaces, pour les liens `tel:`.
  phoneTel: env.VITE_CONTACT_PHONE_TEL || '+212694461807',
  // Email de contact général.
  email: env.VITE_CONTACT_EMAIL || 'contact@semsarout.com',
  // Email de facturation (apparaît sur les factures PDF).
  billingEmail: env.VITE_CONTACT_BILLING_EMAIL || 'contact@semsarout.com',
}
