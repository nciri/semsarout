import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiPackage, FiShoppingBag } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import { PageHeader, StatCard, DataTable, StatusBadge, EmptyState } from '../../../components/backoffice/ui'
import { useFormat } from '../../../utils/format'

const STATUS_TONE = {
  pending: 'bg-gray-100 text-gray-700',
  paid: 'bg-blue-100 text-blue-700',
  preparing: 'bg-amber-100 text-amber-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'

function OrdersList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const { data, isLoading } = useQuery('shop-orders', () => shopService.listOrders())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orders = data?.orders || []
  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    paid: orders.filter((o) => ['paid', 'preparing', 'shipped'].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }), [orders])

  const columns = [
    { header: t('backoffice:shop.order.columns.reference'), cell: (o) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium font-mono" to={`/backoffice/mes-commandes/${o.id}`}>{o.reference}</Link>
    ) },
    { header: t('backoffice:shop.order.columns.items'), cell: (o) => <span className="text-gray-600">{o.items_count}</span> },
    { header: t('backoffice:shop.order.columns.total'), cell: (o) => <span className="font-medium text-gray-900">{o.total} Đh</span> },
    { header: t('backoffice:shop.order.columns.status'), cell: (o) => <StatusBadge label={t(`backoffice:shop.order.status.${o.status}`, { defaultValue: o.status })} className={STATUS_TONE[o.status]} /> },
    { header: t('backoffice:shop.order.columns.date'), cell: (o) => <span className="text-gray-500">{o.created_at ? fmtDate(o.created_at) : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:shop.order.pageTitle')} subtitle={t('backoffice:shop.order.subtitle')}>
        <Link to="/backoffice/boutique" className={PRIMARY_BTN}>
          <FiShoppingBag className="w-5 h-5" /> {t('backoffice:shop.order.shopButton')}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('backoffice:shop.order.stats.total')} value={stats.total} icon={FiPackage} />
        <StatCard label={t('backoffice:shop.order.stats.pending')} value={stats.pending} tone="default" />
        <StatCard label={t('backoffice:shop.order.stats.inProgress')} value={stats.paid} tone="blue" />
        <StatCard label={t('backoffice:shop.order.stats.delivered')} value={stats.delivered} tone="green" />
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiPackage}
            title={t('backoffice:shop.order.empty.title')}
            description={t('backoffice:shop.order.empty.description')}
            action={<Link to="/backoffice/boutique" className={PRIMARY_BTN}><FiShoppingBag className="w-5 h-5" /> {t('backoffice:shop.order.empty.action')}</Link>}
          />
        )}
      />
    </div>
  )
}
export default OrdersList
