import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiFacebook, FiInstagram, FiLinkedin, FiTwitter, FiYoutube } from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import StayManagerWordmark from '../common/StayManagerWordmark'
import Wordmark from '../common/Wordmark'

const SOCIAL_NETWORKS = [
  { icon: FiFacebook, name: 'Facebook' },
  { icon: FiInstagram, name: 'Instagram' },
  { icon: FiLinkedin, name: 'LinkedIn' },
  { icon: FiTwitter, name: 'Twitter' },
  { icon: FiYoutube, name: 'YouTube' }
]

function Footer() {
  const { t } = useTranslation(['common'])
  return (
    <footer className="bg-midnight text-ivory/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex mb-4">
              <Wordmark dark />
            </Link>
            <p className="text-sm mb-4 max-w-xs">
              {t('common:footer.tagline')}
            </p>
            <div className="flex gap-4">
              {SOCIAL_NETWORKS.map(({ icon: Icon, name }) => (
                <span
                  key={name}
                  className="text-ivory/30 cursor-not-allowed"
                  aria-label={t('common:footer.socialAria', { network: name })}
                  title={t('common:footer.comingSoon')}
                >
                  <Icon className="w-5 h-5" />
                </span>
              ))}
            </div>
          </div>

          {/* Vente */}
          <div>
            <h4 className="font-semibold text-white mb-4">{t('common:footer.saleTitle')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/nos-services" className="hover:text-white transition-colors">{t('common:footer.salePackage', { price: formatPrice(4900) })}</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">{t('common:footer.professionalPhotos')}</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">{t('common:footer.freeEstimate')}</Link></li>
              <li><Link to="/annonces?transaction_type=sale" className="hover:text-white transition-colors">{t('common:footer.buyProperty')}</Link></li>
              <li><Link to="/simulateur-credit" className="hover:text-white transition-colors">{t('common:footer.mortgageSimulator')}</Link></li>
            </ul>
          </div>

          {/* Location */}
          <div>
            <h4 className="font-semibold text-white mb-4">{t('common:footer.rentTitle')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/nos-services" className="hover:text-white transition-colors">{t('common:footer.listForRent')}</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">{t('common:footer.fullPropertyManagement')}</Link></li>
              <li>
                <Link to="/nos-services" className="hover:text-white transition-colors">
                  {t('common:footer.shortTermRental')}
                  <span className="ms-1 text-xs text-[#AFCFBC]">StayManager</span>
                </Link>
              </li>
              <li><Link to="/annonces?transaction_type=rent" className="hover:text-white transition-colors">{t('common:footer.rentProperty')}</Link></li>
            </ul>
          </div>

          {/* Professionnels & À propos */}
          <div>
            <h4 className="font-semibold text-white mb-4">{t('common:footer.professionalsTitle')}</h4>
            <ul className="space-y-2 text-sm mb-6">
              <li><Link to="/agences" className="hover:text-white transition-colors">{t('common:footer.partnerAgencies')}</Link></li>
              <li><Link to="/dashboard/agence" className="hover:text-white transition-colors">{t('common:footer.becomePartner')}</Link></li>
              <li><Link to="/agences/tarifs" className="hover:text-white transition-colors">{t('common:footer.agencyPricing')}</Link></li>
            </ul>

            <h4 className="font-semibold text-white mb-4">{t('common:footer.aboutTitle')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/a-propos" className="hover:text-white transition-colors">{t('common:footer.whoWeAre')}</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">{t('common:footer.contactUs')}</Link></li>
              <li>
                <a
                  href="https://www.staymanager.ma"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  <StayManagerWordmark light className="text-sm" />
                  <span className="ms-1 text-xs">↗</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">
              {t('common:footer.copyright', { year: new Date().getFullYear() })}
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <Link to="/mentions-legales" className="hover:text-white transition-colors">{t('common:footer.legalNotice')}</Link>
              <Link to="/cgu" className="hover:text-white transition-colors">{t('common:footer.termsOfUse')}</Link>
              <Link to="/politique-de-confidentialite" className="hover:text-white transition-colors">{t('common:footer.privacyPolicy')}</Link>
              <Link to="/cookies" className="hover:text-white transition-colors">{t('common:footer.cookies')}</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
