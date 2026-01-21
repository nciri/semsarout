import { Link } from 'react-router-dom'
import { FiHome } from 'react-icons/fi'

function NotFound() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-200">404</h1>
        <h2 className="font-display text-2xl font-bold text-gray-900 mt-4">
          Page non trouvée
        </h2>
        <p className="text-gray-600 mt-2 mb-8">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <Link to="/" className="btn-primary">
          <FiHome className="w-4 h-4 mr-2" />
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}

export default NotFound
