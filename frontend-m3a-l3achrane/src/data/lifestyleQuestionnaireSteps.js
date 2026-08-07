// Libellés (titre/intro/label/options) vivent dans app.json (namespace app, section questionnaire) ;
// seules les valeurs brutes (id/cle/options-key) sont conservées ici.
export const IMPORTANCE_LEVELS = ['neutral', 'preference', 'decisive']

export const lifestyleQuestionnaireSteps = [
  {
    id: 'rythme',
    questions: [
      { cle: 'coucher', options: ['avant22', '22h-minuit', 'apres-minuit'] },
      { cle: 'travail', options: ['jour', 'decale', 'teletravail'] },
      { cle: 'weekend', options: ['maison', 'sorti', 'ca-depend'] },
    ],
  },
  {
    id: 'proprete',
    questions: [
      { cle: 'menage', options: ['quotidien', '2-3-semaine', 'hebdomadaire'] },
      { cle: 'vaisselle', options: ['immediat', 'jour-meme', 'beaucoup'] },
    ],
  },
  {
    id: 'tabac-alcool',
    questions: [
      { cle: 'tabac', options: ['non-fumeur', 'balcon', 'interieur'] },
      { cle: 'alcool', options: ['jamais', 'occasionnel', 'regulier'] },
    ],
  },
  {
    id: 'invites-bruit',
    questions: [
      { cle: 'invites', options: ['rarement', 'mensuel', 'souvent'] },
      { cle: 'bruit', options: ['casque', 'modere', 'sans-contrainte'] },
    ],
  },
  {
    id: 'cuisine',
    questions: [
      { cle: 'cuisine', options: ['separee', 'parfois', 'ensemble'] },
      { cle: 'charges', options: ['chacun', 'commune', 'a-definir'] },
    ],
  },
  {
    id: 'sociabilite',
    questions: [
      { cle: 'social', options: ['amis', 'voisinage', 'peu-importe'] },
      { cle: 'langue', options: ['darija', 'francais', 'indifferent'] },
    ],
  },
]
