import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft } from 'react-icons/fi'
import api from '../../services/api'
import DirIcon from '../../components/common/DirIcon'
import { IconAction } from './components/kit'
import ClientFiche, { FicheActions } from './clients/ClientFiche'
import { StatusChip } from './clients/ui'
import { P, useFicheSub } from './clients/labels'
import { buildDossiers } from './clients/model'

const BackIcon = ({ className }) => <DirIcon icon={FiArrowLeft} className={className} />

const get = async (url) => (await api.get(url)).data

export default function BackofficeClientDetail() {
  const { t } = useTranslation('backoffice')
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sub = useFicheSub()
  const now = useMemo(() => new Date(), [])

  const { data: client, isLoading } = useQuery(['backoffice-client', id], () => get(`/backoffice/clients/${id}`))
  const { data: history } = useQuery(['backoffice-client-history', Number(id)], () => get(`/backoffice/clients/${id}/history`), { retry: false })
  const { data: summary } = useQuery('backoffice-clients-summary', () => get('/backoffice/clients/summary'), { retry: false })
  const { data: txData } = useQuery(['backoffice-client-tx', id], () => get(`/backoffice/transactions?client_id=${id}&per_page=200`), { retry: false })

  const deleteMutation = useMutation(() => api.delete(`/backoffice/clients/${id}`), {
    onSuccess: () => {
      qc.invalidateQueries('backoffice-clients-all')
      qc.invalidateQueries('backoffice-clients-summary')
      navigate('/backoffice/clients')
    },
  })

  if (isLoading) {
    return <div aria-busy="true" aria-label={t('crm.shared.loading')} className="mx-auto h-64 w-full max-w-[1360px] animate-pulse rounded-xl border border-gray-200 bg-white motion-reduce:animate-none" />
  }
  if (!client) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <p className="mb-4 text-gray-500">{t('crm.shared.notFound')}</p>
        <Link to="/backoffice/clients" className="font-semibold text-primary-700">{t('crm.shared.back')}</Link>
      </div>
    )
  }

  const transactions = txData?.transactions || []
  const [d] = buildDossiers({ clients: [client], summary, transactions, now })
  const handleDelete = (c) => {
    if (window.confirm(t(`${P}.confirmDelete`, { name: `${c.first_name || ''} ${c.last_name || ''}`.trim() }))) deleteMutation.mutate()
  }

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <IconAction icon={BackIcon} label={t(`${P}.actions.backToList`)} to="/backoffice/clients" className="-ms-2 mt-0.5" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2.5 font-display text-[26px] font-extrabold leading-tight tracking-tight">
              {d.name}<StatusChip status={client.status} />
            </h1>
            <p className="mt-1 text-gray-500">{sub(client)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <FicheActions client={client} onDelete={handleDelete} />
        </div>
      </div>
      <section className="rounded-xl border border-gray-200 bg-white px-4 pb-6 pt-5 sm:px-6">
        <ClientFiche d={d} history={history} transactions={transactions} now={now} />
      </section>
    </div>
  )
}
