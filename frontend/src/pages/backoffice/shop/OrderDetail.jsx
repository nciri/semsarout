import { useParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { shopService } from '../../../services/shopService'
import { useFormat } from '../../../utils/format'
import BackLink from './BackLink'
import OrderBody, { StatusChip } from './OrderBody'
import { useMembers, useProperties } from './useShop'

function OrderDetail() {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const { id } = useParams()
  const { data, isLoading, isError } = useQuery(['shop-order', id], () => shopService.getOrder(id))
  const { data: propsData } = useProperties()
  const members = useMembers()
  const back = <BackLink to="/backoffice/mes-commandes" label={t('shop.orders.backToList')} />

  if (isLoading) return <div aria-busy="true" className="mx-auto h-60 w-full max-w-4xl animate-pulse rounded-xl bg-white motion-reduce:animate-none" />
  if (isError || !data?.order) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-3">
        {back}
        <p className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">{t('shop.orders.notFound')}</p>
      </div>
    )
  }
  const o = data.order
  const property = o.property_id ? (propsData?.properties || []).find((p) => p.id === o.property_id) : null

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-3">
      {back}
      <section className="grid gap-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-xl font-bold">{o.reference}</h1>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              {t('shop.orders.orderedBy', {
                date: fmtDate(o.created_at, { day: 'numeric', month: 'long', year: 'numeric' }),
                name: members.get(o.buyer_id) || t('shop.orders.memberUnknown', { id: o.buyer_id ?? '—' }),
              })}
            </p>
          </div>
          <StatusChip status={o.status} />
        </div>
        <OrderBody order={o} property={property} />
      </section>
    </div>
  )
}
export default OrderDetail
