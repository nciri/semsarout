export const IMPORTANCE_LEVELS = ['Indifférent', 'Préférence', 'Décisif']

export const lifestyleQuestionnaireSteps = [
  {
    titre: 'Votre rythme de vie',
    intro: 'Ça aide à trouver des colocataires sur le même tempo.',
    questions: [
      { cle: 'coucher', label: 'Vous vous couchez plutôt…', options: ['Avant 22h', '22h–minuit', 'Après minuit'] },
      { cle: 'travail', label: 'Votre semaine type', options: ['Cours/travail le jour', 'Horaires décalés', 'Télétravail fréquent'] },
      { cle: 'weekend', label: 'Le week-end, vous êtes plutôt', options: ['À la maison', 'Souvent sorti', 'Ça dépend'] },
    ],
  },
  {
    titre: 'Propreté et organisation',
    intro: 'La première source de friction en colocation.',
    questions: [
      { cle: 'menage', label: 'Fréquence de ménage des parties communes', options: ['Quotidien', '2–3×/semaine', 'Hebdomadaire'] },
      { cle: 'vaisselle', label: 'La vaisselle, vous la faites', options: ['Immédiatement', 'Le jour même', 'Quand il y en a beaucoup'] },
    ],
  },
  {
    titre: 'Tabac et alcool',
    intro: 'Des critères souvent décisifs, à préciser clairement.',
    questions: [
      { cle: 'tabac', label: 'Tabac', options: ['Non-fumeur', 'Fume au balcon', 'Fume à l’intérieur'] },
      { cle: 'alcool', label: 'Alcool dans le logement', options: ['Jamais', 'Occasionnellement', 'Régulièrement'] },
    ],
  },
  {
    titre: 'Invités et bruit',
    intro: 'Pour anticiper les attentes sur les parties communes.',
    questions: [
      { cle: 'invites', label: 'Invités à la maison', options: ['Rarement', 'Quelques fois/mois', 'Souvent'] },
      { cle: 'bruit', label: 'Musique / appels dans le logement', options: ['Casque uniquement', 'Volume modéré', 'Pas de contrainte'] },
    ],
  },
  {
    titre: 'Cuisine et partage',
    intro: 'Séparé ou en commun — puis comment les charges se répartissent.',
    questions: [
      { cle: 'cuisine', label: 'Cuisine', options: ['Séparée', 'Partagée parfois', 'On cuisine ensemble'] },
      { cle: 'charges', label: 'Courses et charges communes', options: ['Chacun le sien', 'Caisse commune', 'À définir ensemble'] },
    ],
  },
  {
    titre: 'Sociabilité et langue du foyer',
    intro: 'Dernière étape avant votre profil de compatibilité.',
    questions: [
      { cle: 'social', label: 'Vous cherchez plutôt des colocataires', options: ['Amis proches', 'Bon voisinage', 'Peu importe'] },
      { cle: 'langue', label: 'Langue de communication au foyer', options: ['Darija', 'Français', 'Indifférent'] },
    ],
  },
]
