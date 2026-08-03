import { Link, useLocation, Navigate } from 'react-router-dom'
import { FiCheckCircle, FiCopy, FiArrowRight } from 'react-icons/fi'
import { useState } from 'react'

function CheckoutConfirmation() {
  const location = useLocation()
  const { paymentId, method } = location.state || {}
  const [copied, setCopied] = useState(false)

  if (!paymentId) {
    return <Navigate to="/dashboard" replace />
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="card p-8 text-center">
        <FiCheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />

        {method === 'transfer' ? (
          <>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-3">
              Commande enregistrée
            </h1>
            <p className="text-gray-600 mb-6">
              Merci ! Votre commande a bien été enregistrée. Pour la finaliser,
              veuillez effectuer un virement bancaire en indiquant la référence
              ci-dessous dans le libellé du virement.
            </p>
            <div className="flex items-center justify-center gap-2 bg-gray-50 rounded-lg p-4 mb-6">
              <span className="font-mono text-sm text-gray-900">{paymentId}</span>
              <button
                onClick={handleCopy}
                className="p-1.5 text-gray-500 hover:text-primary-600 transition-colors"
                title="Copier la référence"
              >
                <FiCopy className="w-4 h-4" />
              </button>
              {copied && <span className="text-xs text-green-600">Copié !</span>}
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Votre commande sera activée dès réception du virement (délai habituel : 1 à 3 jours ouvrés).
              Un email de confirmation vous sera envoyé.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-gray-900 mb-3">
              Paiement confirmé
            </h1>
            <p className="text-gray-600 mb-6">
              Merci ! Votre paiement a bien été enregistré (référence {paymentId}).
            </p>
          </>
        )}

        <Link to="/dashboard" className="btn-primary inline-flex">
          Accéder à mon espace
          <FiArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </div>
    </div>
  )
}

export default CheckoutConfirmation
