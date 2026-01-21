import { Link } from 'react-router-dom'
import { FiFacebook, FiInstagram, FiLinkedin, FiTwitter, FiYoutube } from 'react-icons/fi'

function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-terracotta-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <div className="flex items-baseline">
                <span className="font-display font-bold text-xl text-white">Semsar</span>
                <span className="font-display font-bold text-xl text-primary-400">Out</span>
              </div>
            </Link>
            <p className="text-sm mb-4 max-w-xs">
              L'immobilier sans les intermédiaires douteux. Vendez, louez et gérez votre bien
              à tarif fixe, sans commission, avec un accompagnement professionnel.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-white transition-colors" aria-label="Facebook">
                <FiFacebook className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="Instagram">
                <FiInstagram className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="LinkedIn">
                <FiLinkedin className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="Twitter">
                <FiTwitter className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors" aria-label="YouTube">
                <FiYoutube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Vente */}
          <div>
            <h4 className="font-semibold text-white mb-4">Vente</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/nos-services" className="hover:text-white transition-colors">Forfait Vente (4 900 Đ)</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">Photos Professionnelles</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">Estimation Gratuite</Link></li>
              <li><Link to="/annonces?transaction_type=sale" className="hover:text-white transition-colors">Acheter un bien</Link></li>
            </ul>
          </div>

          {/* Location */}
          <div>
            <h4 className="font-semibold text-white mb-4">Location</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/nos-services" className="hover:text-white transition-colors">Mise en Location</Link></li>
              <li><Link to="/nos-services" className="hover:text-white transition-colors">Gestion Locative Complète</Link></li>
              <li>
                <Link to="/nos-services" className="hover:text-white transition-colors">
                  Location Courte Durée
                  <span className="ml-1 text-xs text-purple-400">StayManager</span>
                </Link>
              </li>
              <li><Link to="/annonces?transaction_type=rent" className="hover:text-white transition-colors">Louer un bien</Link></li>
            </ul>
          </div>

          {/* Professionnels & À propos */}
          <div>
            <h4 className="font-semibold text-white mb-4">Professionnels</h4>
            <ul className="space-y-2 text-sm mb-6">
              <li><Link to="/agences" className="hover:text-white transition-colors">Agences partenaires</Link></li>
              <li><Link to="/agences/inscription" className="hover:text-white transition-colors">Devenir partenaire</Link></li>
              <li><Link to="/agences/tarifs" className="hover:text-white transition-colors">Tarifs agences</Link></li>
            </ul>

            <h4 className="font-semibold text-white mb-4">À propos</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/a-propos" className="hover:text-white transition-colors">Qui sommes-nous</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Nous contacter</Link></li>
              <li>
                <a
                  href="https://www.staymanager.ma"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  StayManager.ma
                  <span className="ml-1 text-xs">↗</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">
              © {new Date().getFullYear()} SemsarOut. Tous droits réservés.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <a href="#" className="hover:text-white transition-colors">Mentions légales</a>
              <a href="#" className="hover:text-white transition-colors">CGU</a>
              <a href="#" className="hover:text-white transition-colors">Politique de confidentialité</a>
              <a href="#" className="hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
