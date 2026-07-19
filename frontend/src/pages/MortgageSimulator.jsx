import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiPercent, FiCalendar, FiDollarSign } from 'react-icons/fi'
import { formatPrice } from '../utils/currency'

function computeMonthlyPayment(principal, annualRatePct, years) {
  const months = years * 12
  const monthlyRate = (annualRatePct / 100) / 12

  if (months <= 0 || principal <= 0) return { monthlyPayment: 0, totalPaid: 0, totalInterest: 0, months: 0 }

  const monthlyPayment = monthlyRate === 0
    ? principal / months
    : principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1)

  const totalPaid = monthlyPayment * months
  return { monthlyPayment, totalPaid, totalInterest: totalPaid - principal, months }
}

function MortgageSimulator() {
  const [searchParams] = useSearchParams()
  const [price, setPrice] = useState(Number(searchParams.get('price')) || 1500000)
  const [downPaymentPct, setDownPaymentPct] = useState(20)
  const [rate, setRate] = useState(4.5)
  const [years, setYears] = useState(20)

  const downPayment = Math.round(price * (downPaymentPct / 100))
  const principal = price - downPayment

  const result = useMemo(
    () => computeMonthlyPayment(principal, rate, years),
    [principal, rate, years]
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">
          Simulateur de crédit immobilier
        </h1>
        <p className="text-gray-600">
          Estimez votre mensualité en quelques secondes. Simulation indicative, hors assurance et frais de dossier.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="card p-6 space-y-6">
          <div>
            <label className="label flex items-center gap-2">
              <FiDollarSign className="w-4 h-4" /> Prix du bien
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="input"
            />
          </div>

          <div>
            <label className="label">
              Apport personnel : {downPaymentPct}% ({formatPrice(downPayment)})
            </label>
            <input
              type="range"
              min="0"
              max="80"
              value={downPaymentPct}
              onChange={(e) => setDownPaymentPct(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </div>

          <div>
            <label className="label flex items-center gap-2">
              <FiPercent className="w-4 h-4" /> Taux d'intérêt annuel : {rate}%
            </label>
            <input
              type="range"
              min="2"
              max="8"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </div>

          <div>
            <label className="label flex items-center gap-2">
              <FiCalendar className="w-4 h-4" /> Durée du prêt : {years} ans
            </label>
            <input
              type="range"
              min="5"
              max="30"
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </div>
        </div>

        {/* Result */}
        <div className="card p-6 bg-gradient-to-br from-midnight to-[#1a2740] text-white flex flex-col justify-center">
          <p className="text-ivory/70 text-sm mb-2">Mensualité estimée</p>
          <p className="font-display text-4xl font-extrabold mb-6 text-primary-400">
            {formatPrice(Math.round(result.monthlyPayment))}
            <span className="text-lg font-normal text-ivory/70">/mois</span>
          </p>

          <div className="space-y-3 text-sm border-t border-white/10 pt-4">
            <div className="flex justify-between">
              <span className="text-ivory/70">Montant emprunté</span>
              <span className="font-semibold">{formatPrice(principal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ivory/70">Coût total du crédit</span>
              <span className="font-semibold">{formatPrice(Math.round(result.totalInterest))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ivory/70">Total remboursé</span>
              <span className="font-semibold">{formatPrice(Math.round(result.totalPaid))}</span>
            </div>
          </div>

          <p className="text-xs text-ivory/50 mt-6">
            Simulation à titre indicatif. Les conditions réelles dépendent de votre banque et de votre profil.
          </p>
        </div>
      </div>
    </div>
  )
}

export default MortgageSimulator
