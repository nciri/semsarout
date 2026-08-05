// Garde-fou : détecte les t('ns:clé') référencées mais absentes des JSON.
// failOnUpdate => échoue si le catalogue devrait changer (clé manquante).
// keepRemoved => n'efface pas les clés non détectées (interpolation dynamique tolérée).
module.exports = {
  locales: ['fr', 'ar'],
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{js,jsx}'],
  defaultNamespace: 'common',
  keySeparator: '.',
  namespaceSeparator: ':',
  keepRemoved: true,
  failOnUpdate: true,
  sort: true,
  createOldCatalogs: false,
}
