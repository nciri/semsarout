import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiPackage, FiShoppingBag } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import { PageHeader, StatCard, DataTable, StatusBadge, EmptyState } from '../../../components/backoffice/ui'

const STATUS = {
  pending: ['En attente', 'bg-gray-100 text-gray-700'],
  paid: ['Payée', 'bg-blue-100 text-blue-700'],
  preparing: ['Préparation', 'bg-amber-100 text-amber-700'],
  shipped: ['Expédiée', 'bg-indigo-100 text-indigo-700'],
  delivered: ['Livrée', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Annulée', 'bg-red-100 text-red-700'],
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'

function OrdersList() {
  const { data, isLoading } = useQuery('shop-orders', () => shopService.listOrders())
  const orders = data?.orders || []
  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    paid: orders.filter((o) => ['paid', 'preparing', 'shipped'].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }), [orders])

  const columns = [
    { header: 'Référence', cell: (o) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium font-mono" to={`/backoffice/mes-commandes/${o.id}`}>{o.reference}</Link>
    ) },
    { header: 'Articles', cell: (o) => <span className="text-gray-600">{o.items_count}</span> },
    { header: 'Total', cell: (o) => <span className="font-medium text-gray-900">{o.total} Đh</span> },
    { header: 'Statut', cell: (o) => <StatusBadge label={STATUS[o.status]?.[0] || o.status} className={STATUS[o.status]?.[1]} /> },
    { header: 'Date', cell: (o) => <span className="text-gray-500">{o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Mes commandes" subtitle="Suivez vos commandes de mobilier et d'électroménager">
        <Link to="/backoffice/boutique" className={PRIMARY_BTN}>
          <FiShoppingBag className="w-5 h-5" /> Boutique
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiPackage} />
        <StatCard label="En attente" value={stats.pending} tone="default" />
        <StatCard label="En cours" value={stats.paid} tone="blue" />
        <StatCard label="Livrées" value={stats.delivered} tone="green" />
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiPackage}
            title="Aucune commande"
            description="Vos commandes passées depuis la boutique apparaîtront ici."
            action={<Link to="/backoffice/boutique" className={PRIMARY_BTN}><FiShoppingBag className="w-5 h-5" /> Aller à la boutique</Link>}
          />
        )}
      />
    </div>
  )
}
export default OrdersList
