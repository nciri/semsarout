import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { FiCreditCard, FiAlertTriangle } from 'react-icons/fi'
import { formatPrice } from '../utils/currency'

/**
 * Placeholder payment gateway page. The real CMI/Stripe integration is not
 * yet configured (see backend TODO in payments.py) — this page simulates a
 * successful confirmation so the checkout flow can be completed end-to-end
 * during development.
 */
function PaymentGateway() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [processing, setProcessing] = useState(false)

  const reference = searchParams.get('ref')
  const amount = searchParams.get('amount')

  useEffect(() => {
    if (!reference) {
      navigate('/dashboard')
    }
  }, [reference, navigate])

  const handleConfirm = () => {
    setProcessing(true)
    setTimeout(() => {
      navigate('/checkout/confirmation', {
        state: { paymentId: reference, method: 'card' }
      })
    }, 1200)
  }

  if (!reference) return null

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full card p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4 text-yellow-600 bg-yellow-50 rounded-lg py-2 px-3 text-xs">
          <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
          Passerelle de paiement en mode démo (intégration CMI à venir)
        </div>
        <FiCreditCard className="w-12 h-12 text-primary-600 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-gray-900 mb-2">
          Confirmer le paiement
        </h1>
        <p className="text-gray-600 mb-6">
          Référence <span className="font-mono">{reference}</span>
          {amount && <> — Montant : {formatPrice(parseFloat(amount))}</>}
        </p>
        <button
          onClick={handleConfirm}
          disabled={processing}
          className="btn-primary w-full justify-center"
        >
          {processing ? 'Traitement...' : 'Confirmer le paiement'}
        </button>
      </div>
    </div>
  )
}

export default PaymentGateway
