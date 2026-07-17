import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import {
  FiArrowRight, FiCheck, FiCamera, FiDollarSign,
  FiShield, FiTrendingUp, FiUsers, FiZap, FiX, FiKey
} from 'react-icons/fi'
import AdvancedSearch from '../components/search/AdvancedSearch'
import PropertyCard from '../components/common/PropertyCard'
import { propertyService } from '../services/propertyService'
import { DIRHAM_SYMBOL, formatPrice } from '../utils/currency'

function Home() {
  const { data: featuredData } = useQuery(
    'featured-properties',
    () => propertyService.getProperties({ per_page: 6, sort: 'newest' })
  )

  return (
    <div>
      {/* Hero Section — midnight avec glows or/émeraude (design system) */}
      <section
        className="relative text-ivory overflow-hidden"
        style={{
          background:
            'radial-gradient(1100px 520px at 12% -20%, rgba(214,168,95,.24), transparent 55%), radial-gradient(820px 420px at 100% -10%, rgba(15,118,110,.20), transparent 50%), #0B1220'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-[70px] pb-20 lg:pb-[110px]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-[14px] py-[7px] bg-white/[.08] border border-white/[.14] rounded-full text-[13px] font-semibold mb-6">
              <FiZap className="w-4 h-4 text-primary-400 fill-primary-400" />
              <span>La nouvelle ère de l'immobilier au Maroc</span>
            </div>

            <h1 className="font-display text-4xl lg:text-[64px] font-extrabold mb-6 leading-[1.02] tracking-[-.03em] text-ivory">
              L'immobilier,<br />
              enfin sans <span className="text-[#EA4A4A]">intermédiaire.</span>
            </h1>

            <p className="text-lg lg:text-[19px] text-ivory/[.82] mb-7 leading-relaxed max-w-2xl">
              SemsarOut élimine l'intermédiaire pour une expérience plus simple, plus
              transparente et plus juste. Tarif fixe, zéro commission cachée.
            </p>

            <div className="flex flex-wrap gap-6 mb-10">
              {['Tarif fixe, pas de commission', 'Photos professionnelles incluses', 'Accompagnement personnalisé'].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm text-ivory/90">
                  <span className="inline-flex w-5 h-5 rounded-full bg-emerald-500 items-center justify-center flex-shrink-0">
                    <FiCheck className="w-3 h-3 text-white" />
                  </span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search Form */}
          <div className="max-w-5xl">
            <AdvancedSearch />
          </div>

          {/* Stats */}
          <div className="mt-11 flex flex-wrap gap-x-14 gap-y-6">
            {[['0%', 'Commission'], [formatPrice(4900), 'Forfait fixe'], ['100%', 'Transparent'], ['24h', 'Publication']].map(([n, l]) => (
              <div key={l}>
                <div className="font-display font-extrabold text-[34px] text-primary-400">{n}</div>
                <div className="text-[13px] text-ivory/70">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              Pourquoi nous court-circuitons les intermédiaires traditionnels ?
            </h2>
            <p className="text-xl text-gray-600">
              Le marché immobilier marocain mérite mieux que des pratiques opaques et des commissions exorbitantes.
              Nous rendons l'immobilier accessible à tous, avec des prix justes et une transparence totale.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                t: 'Commissions abusives',
                p: <>Les agences traditionnelles prélèvent 2,5% à 5% du prix de vente. Sur un bien à 2M {DIRHAM_SYMBOL}, c'est jusqu'à {formatPrice(100000)} !</>,
                s: <>Forfait fixe de {formatPrice(4900)}</>
              },
              {
                t: 'Manque de transparence',
                p: 'Annonces gonflées, informations cachées, négociations opaques… Difficile de faire confiance.',
                s: 'Tout est visible et vérifié'
              },
              {
                t: 'Photos amateur',
                p: 'Des photos floues prises au téléphone qui ne mettent pas votre bien en valeur.',
                s: 'Shooting professionnel inclus'
              }
            ].map((c) => (
              <div key={c.t} className="bg-white border border-slate-200 rounded-ds-lg p-7 shadow-ds-md">
                <span className="inline-flex w-11 h-11 rounded-xl bg-redcard-50 items-center justify-center mb-[18px]">
                  <FiX className="w-[22px] h-[22px] text-redcard-500" strokeWidth={2.2} />
                </span>
                <h3 className="font-display font-semibold text-[19px] mb-2.5 text-midnight">{c.t}</h3>
                <p className="text-[15px] text-slate-500 mb-4 leading-relaxed">{c.p}</p>
                <div className="pt-3.5 border-t border-slate-200 flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                  <FiCheck className="w-4 h-4" />
                  {c.s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Services */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Nos services d'agence en ligne
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Un accompagnement professionnel à tarif fixe, sans surprise
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Service 1 - Vente */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-4">
                    Vente de bien
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    Forfait Vente
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary-600">{formatPrice(4900)}</div>
                  <div className="text-sm text-gray-500">tarif fixe TTC</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Shooting photo professionnel (15-20 photos HD)</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Estimation gratuite de votre bien</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Annonce premium diffusée sur SemsarOut</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Gestion des contacts et visites</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Accompagnement jusqu'à la vente</span>
                </li>
              </ul>

              <Link to="/nos-services/vente" className="btn-primary w-full justify-center">
                Vendre mon bien
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>

            {/* Service 2 - Gestion Locative */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
                    Location longue durée
                  </span>
                  <h3 className="font-display text-2xl font-bold text-gray-900">
                    Gestion Locative Complète
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">À partir de 5%</div>
                  <div className="text-sm text-gray-500">du loyer mensuel</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Recherche et sélection rigoureuse des locataires</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Vérification des dossiers et garants</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Encaissement et suivi des loyers</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Gestion des charges et travaux</span>
                </li>
                <li className="flex items-start">
                  <FiCheck className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Médiation et gestion des litiges</span>
                </li>
              </ul>

              <Link to="/nos-services/gestion-locative" className="btn bg-blue-600 text-white hover:bg-blue-700 w-full justify-center">
                Gérer mon bien
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>

          {/* Comparison — panneau midnight (design system) */}
          <div className="mt-16 rounded-ds-xl p-10 lg:p-12" style={{ background: 'linear-gradient(120deg, #0B1220, #16233b)' }}>
            <h3 className="font-display text-[30px] font-bold mb-10 text-center text-ivory">
              Comparez et économisez
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-ivory/60 mb-2">سمسار</div>
                <div className="font-display text-[38px] font-extrabold text-[#EA6A6A]">{formatPrice(30000)}</div>
                <div className="text-[13px] text-ivory/50">Négociation, heures perdues, services incomplets</div>
              </div>
              <div className="text-center">
                <div className="mb-2">
                  <span className="inline-flex items-baseline gap-[5px] font-display font-extrabold text-[22px] tracking-tight text-primary-400">
                    <span>Semsar</span>
                    <span className="inline-flex items-center text-white text-[18px] px-[9px] py-[2px] rounded-[5px] shadow-red -rotate-[4deg]" style={{ background: 'linear-gradient(150deg, rgb(193, 18, 31) 0%, rgb(135, 11, 21) 100%)' }}>Out</span>
                  </span>
                </div>
                <div className="font-display text-[46px] font-extrabold text-primary-400">{formatPrice(4900)}</div>
                <div className="text-[13px] text-ivory/50">Forfait fixe, tout compris</div>
              </div>
              <div className="text-center">
                <div className="text-ivory/60 mb-2">Vous économisez</div>
                <div className="font-display text-[38px] font-extrabold text-[#3FC79A]">{formatPrice(25100)}</div>
                <div className="text-[13px] text-ivory/50">Plus d'efficacité, moins de stress</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex justify-between items-end mb-7">
          <div>
            <h2 className="font-display text-[32px] font-bold text-midnight mb-1">Dernières annonces</h2>
            <p className="text-slate-500">Découvrez les biens récemment ajoutés</p>
          </div>
          <Link to="/annonces" className="text-emerald-500 hover:text-emerald-600 flex items-center font-semibold text-[15px]">
            Voir tout <FiArrowRight className="ml-1.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredData?.properties?.map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-white py-[88px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-[32px] font-bold text-midnight mb-12 text-center">
            Pourquoi choisir SemsarOut ?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-7">
            {[
              [FiDollarSign, 'text-primary-600', 'bg-primary-50', 'Tarif fixe', 'Pas de commission, un prix clair et définitif.'],
              [FiShield, 'text-emerald-500', 'bg-emerald-50', 'Transparence', 'Toutes les informations sont vérifiées et accessibles.'],
              [FiTrendingUp, 'text-redcard-500', 'bg-redcard-50', 'Efficacité', 'Publication en 24h, accompagnement personnalisé.'],
              [FiUsers, 'text-blue-600', 'bg-blue-50', 'Accessibilité', "L'immobilier pour tous, sans barrière."]
            ].map(([IconCmp, color, bg, t, d]) => (
              <div key={t} className="text-center">
                <div className={`w-16 h-16 ${bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <IconCmp className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2 text-midnight">{t}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for Agencies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-ds-xl p-8 lg:p-11 text-white" style={{ background: 'linear-gradient(135deg,#0F766E 0%,#14B8A6 100%)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold mb-4">
                Vous êtes une agence immobilière ?
              </h2>
              <p className="text-white/90 mb-6">
                Rejoignez SemsarOut et bénéficiez d'outils puissants pour gérer vos annonces :
                intégration API, import CSV, synchronisation avec vos logiciels métiers.
              </p>
              <ul className="space-y-2 mb-8">
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  Plans d'abonnement flexibles
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  API REST pour synchronisation
                </li>
                <li className="flex items-center">
                  <FiCheck className="w-5 h-5 mr-2" />
                  Tableau de bord analytics
                </li>
              </ul>
              <Link to="/agences/inscription" className="btn bg-white text-midnight hover:bg-slate-50 border-[1.5px] border-transparent">
                Créer mon espace agence
                <FiArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
            <div className="hidden lg:block">
              <img
                src="/agency-dashboard.svg"
                alt="Dashboard agence"
                className="w-full opacity-90"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
