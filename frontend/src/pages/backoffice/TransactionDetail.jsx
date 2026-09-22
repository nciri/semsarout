import { useState } from 'react'
import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiGrid } from 'react-icons/fi'
import api from '../../services/api'
import { useFormat } from '../../utils/format'
import { Chip, IconAction } from './components/kit'
import { useMoney } from './components/kitTokens'
import Fiche from './transactions/Fiche'
import { isOverdue, statusTone } from './transactions/model'

export default function BackofficeTransactionDetail() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const d = (key, opts) => t(`crm.transactions.detail.${key}`, opts)
  const [now] = useState(() => new Date())
  const { id } = useParams()
  const { data: tx, isLoading, isError } = useQuery(
    ['bo-transaction', id],
    async () => (await api.get(`/backoffice/transactions/${id}`)).data,
  )

  if (isLoading) {
    return <div aria-busy="true" className="mx-auto h-64 w-full max-w-[1100px] animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />
  }
  if (isError || !tx) {
    return (
      <div className="mx-auto grid max-w-4xl justify-items-center gap-3 py-16 text-center">
        <p className="text-gray-500">{d('notFound')}</p>
        <Link to="/backoffice/transactions" className="text-primary-700 hover:text-primary-800">{d('backToList')}</Link>
      </div>
    )
  }

  const offers = tx.offers || []

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconAction icon={FiArrowLeft} label={d('backToList')} to="/backoffice/transactions" className="border border-gray-200 bg-white rtl:[&>svg]:rotate-180" />
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">
              <span className="font-mono text-[22px]">{tx.reference}</span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{t(`crm.transactions.type.${tx.transaction_type}`, { defaultValue: tx.transaction_type })}</span>
              <Chip tone={statusTone(tx.status)}>{t(`crm.transactions.status.${tx.status}`, { defaultValue: tx.status })}</Chip>
              {tx.priority && <Chip>{t(`crm.pipeline.pipeline.priority.${tx.priority}`, { defaultValue: tx.priority })}</Chip>}
            </div>
          </div>
        </div>
        <IconAction icon={FiGrid} label={d('pipelineLink')} to="/backoffice/pipeline" tipAlign="end" className="border border-gray-200 bg-white" />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <Fiche tx={tx} overdue={isOverdue(tx, now)} />
      </section>

      <section aria-labelledby="tx-offers" className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 id="tx-offers" className="font-display text-base font-bold">{d('offersTitle', { count: offers.length })}</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-500">{d('offersEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px]">
                <div>
                  <p className="font-semibold tabular-nums">{money(o.amount, tx.transaction_type)}</p>
                  <p className="text-xs text-gray-500">
                    {o.from_party ? t(`crm.transactions.offerParty.${o.from_party}`, { defaultValue: o.from_party }) : '—'}
                    {o.created_by_name ? d('offerCreatedBy', { name: o.created_by_name }) : ''}
                    {o.created_at ? ` · ${fmtDate(o.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <Chip>{t(`crm.transactions.offerStatus.${o.status}`, { defaultValue: o.status })}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
