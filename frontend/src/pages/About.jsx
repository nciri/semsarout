import { Link } from 'react-router-dom'
import { FiTarget, FiUsers, FiShield, FiTrendingUp, FiArrowRight } from 'react-icons/fi'

const VALUES = [
  {
    icon: FiShield,
    title: 'Transparence',
    description: 'Des tarifs fixes, sans commission cachée. Vous savez exactement ce que vous payez.'
  },
  {
    icon: FiTarget,
    title: 'Efficacité',
    description: 'Un accompagnement professionnel à chaque étape, sans intermédiaires inutiles.'
  },
  {
    icon: FiUsers,
    title: 'Proximité',
    description: 'Une équipe à l\'écoute de vos besoins, que vous soyez particulier ou agence.'
  },
  {
    icon: FiTrendingUp,
    title: 'Innovation',
    description: 'Des outils modernes (StayManager, estimation en ligne) pour simplifier l\'immobilier.'
  }
]

function About() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-4">
          Qui sommes-nous ?
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          SemsarOut réinvente l'immobilier au Maroc : sans intermédiaires douteux,
          à tarif fixe, avec un accompagnement professionnel du début à la fin.
        </p>
      </div>

      <div className="card p-8 mb-12">
        <h2 className="font-semibold text-xl mb-4">Notre mission</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Trop souvent, vendre, louer ou gérer un bien immobilier rime avec commissions
          opaques et démarches longues. SemsarOut a été créé pour changer cela : nous
          proposons des services à tarif fixe et transparent, que vous soyez un particulier
          qui vend son bien ou une agence qui souhaite digitaliser sa gestion locative.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Grâce à notre plateforme et à notre intégration StayManager pour la location
          courte durée, nous accompagnons les propriétaires et les professionnels de
          l'immobilier avec des outils modernes et un service humain de qualité.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
        {VALUES.map((value) => {
          const Icon = value.icon
          return (
            <div key={value.title} className="card p-6">
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-primary-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{value.title}</h3>
              <p className="text-sm text-gray-600">{value.description}</p>
            </div>
          )
        })}
      </div>

      <div className="card p-8 text-center bg-midnight text-white">
        <h2 className="font-display text-xl font-bold mb-3">
          Prêt à démarrer votre projet immobilier ?
        </h2>
        <p className="text-ivory/70 mb-6 max-w-xl mx-auto">
          Que vous souhaitiez vendre, louer, gérer votre bien ou rejoindre notre réseau
          d'agences partenaires, notre équipe vous accompagne.
        </p>
        <Link to="/contact" className="btn-primary inline-flex">
          Nous contacter
          <FiArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </div>
    </div>
  )
}

export default About
