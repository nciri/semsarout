// Mock data — écran "Validation colocataire" (candidats partagés par le propriétaire)
//
// Vue du colocataire déjà en place : suite du flux propriétaire (Candidatures.jsx,
// statut "pending_roommate"). Le propriétaire a présélectionné ces profils pour une
// chambre de son logement déjà loué, le colocataire donne son avis avant acceptation
// finale par le propriétaire.
//
// Les points de mode de vie référencent le référentiel lifestyle (lifestyleQuestionnaireSteps.js) :
// { step, question, option } → libellé dans app:questionnaire.steps.<step>.questions.<question>.options.<option>
export const roommateValidation = {
  logement: {
    titre: 'Chambre privée',
    quartier: 'Maârif',
    ville: 'Casablanca',
    chambres: ['Chambre 2 — à côté du salon'],
  },
  candidats: [
    {
      id: 1,
      nom: 'Yasmine Berrada',
      age: 22,
      profil: 'Étudiante M2 · ENCG Casablanca',
      compatibilite: 91,
      lifestyle: [
        { step: 'tabac-alcool', question: 'tabac', option: 'non-fumeur' },
        { step: 'rythme', question: 'coucher', option: 'avant22' },
        { step: 'proprete', question: 'menage', option: 'quotidien' },
      ],
      noteProprietaire: 'Sérieuse, disponible immédiatement, très bon feeling au téléphone.',
      statut: 'to_validate',
    },
    {
      id: 2,
      nom: 'Salma Ouazzani',
      age: 21,
      profil: 'Étudiante 2e année · ISCAE',
      compatibilite: 78,
      lifestyle: [
        { step: 'tabac-alcool', question: 'alcool', option: 'jamais' },
        { step: 'invites-bruit', question: 'invites', option: 'rarement' },
        { step: 'cuisine', question: 'cuisine', option: 'parfois' },
      ],
      noteProprietaire: 'Calme et posée, cherche un cadre studieux.',
      statut: 'to_validate',
    },
    {
      id: 3,
      nom: 'Nada Chraibi',
      age: 19,
      profil: 'Étudiante 1re année · EMSI',
      compatibilite: 65,
      lifestyle: [
        { step: 'invites-bruit', question: 'bruit', option: 'modere' },
        { step: 'rythme', question: 'weekend', option: 'sorti' },
        { step: 'sociabilite', question: 'social', option: 'amis' },
      ],
      noteProprietaire: 'Première recherche de coloc pour elle, très flexible sur les visites.',
      statut: 'validated',
    },
    {
      id: 4,
      nom: 'Hamza Tazi',
      age: 23,
      profil: 'Étudiant 3e année · ENSAM',
      compatibilite: 55,
      lifestyle: [
        { step: 'tabac-alcool', question: 'tabac', option: 'non-fumeur' },
        { step: 'tabac-alcool', question: 'alcool', option: 'occasionnel' },
        { step: 'invites-bruit', question: 'bruit', option: 'sans-contrainte' },
      ],
      noteProprietaire: 'Sérieux, disponible pour une visite rapide.',
      statut: 'rejected',
    },
  ],
}
