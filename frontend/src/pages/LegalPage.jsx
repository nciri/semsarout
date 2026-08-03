const LEGAL_CONTENT = {
  mentions: {
    title: 'Mentions légales',
    sections: [
      { heading: 'Éditeur du site', body: 'SemsarOut est édité par SemsarOut SARL, société immatriculée au Maroc. Le site est destiné à faciliter la mise en relation entre particuliers, professionnels de l\'immobilier et agences partenaires.' },
      { heading: 'Hébergement', body: 'Le site est hébergé sur une infrastructure cloud sécurisée. Pour toute question relative à l\'hébergement, contactez-nous via notre page Contact.' },
      { heading: 'Propriété intellectuelle', body: 'L\'ensemble des contenus présents sur ce site (textes, images, logos, marques) sont la propriété de SemsarOut ou de ses partenaires et sont protégés par le droit d\'auteur.' }
    ]
  },
  cgu: {
    title: 'Conditions Générales d\'Utilisation',
    sections: [
      { heading: 'Objet', body: 'Les présentes conditions générales d\'utilisation régissent l\'accès et l\'utilisation de la plateforme SemsarOut par tout utilisateur, particulier ou professionnel.' },
      { heading: 'Accès au service', body: 'L\'accès à certaines fonctionnalités (recherches sauvegardées, favoris, publication d\'annonces) nécessite la création d\'un compte utilisateur avec des informations exactes et à jour.' },
      { heading: 'Responsabilités', body: 'SemsarOut agit en tant qu\'intermédiaire technique. Les utilisateurs sont seuls responsables de l\'exactitude des informations publiées sur leurs annonces.' },
      { heading: 'Modification des conditions', body: 'SemsarOut se réserve le droit de modifier les présentes conditions à tout moment. Les utilisateurs seront informés de tout changement substantiel.' }
    ]
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    sections: [
      { heading: 'Données collectées', body: 'Nous collectons les données nécessaires à la création de votre compte (nom, email, téléphone) ainsi que vos recherches et interactions sur la plateforme afin d\'améliorer votre expérience.' },
      { heading: 'Utilisation des données', body: 'Vos données sont utilisées pour vous fournir nos services (mise en relation, recherches sauvegardées, notifications) et ne sont jamais vendues à des tiers.' },
      { heading: 'Vos droits', body: 'Conformément à la réglementation applicable, vous disposez d\'un droit d\'accès, de rectification et de suppression de vos données personnelles. Contactez-nous pour exercer ces droits.' },
      { heading: 'Sécurité', body: 'Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre tout accès non autorisé.' }
    ]
  },
  cookies: {
    title: 'Politique de cookies',
    sections: [
      { heading: 'Qu\'est-ce qu\'un cookie ?', body: 'Un cookie est un petit fichier texte déposé sur votre appareil lors de la visite de notre site, permettant de mémoriser certaines informations.' },
      { heading: 'Cookies utilisés', body: 'Nous utilisons des cookies essentiels au fonctionnement du site (authentification, préférences de recherche) ainsi que des cookies de mesure d\'audience anonymisés.' },
      { heading: 'Gestion des cookies', body: 'Vous pouvez à tout moment configurer votre navigateur pour refuser les cookies. Cela peut cependant limiter certaines fonctionnalités du site.' }
    ]
  }
}

function LegalPage({ type }) {
  const content = LEGAL_CONTENT[type] || LEGAL_CONTENT.mentions

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-2xl font-bold text-gray-900 mb-8">
        {content.title}
      </h1>
      <div className="space-y-8">
        {content.sections.map((section) => (
          <div key={section.heading}>
            <h2 className="font-semibold text-lg text-gray-900 mb-2">{section.heading}</h2>
            <p className="text-gray-600 leading-relaxed">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LegalPage
