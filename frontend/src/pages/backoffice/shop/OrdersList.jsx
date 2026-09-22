import { useTranslation } from 'react-i18next'
import { FiShoppingBag } from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import { IconAction } from '../components/kit'
import OrdersTracking from './OrdersTracking'
import { useMembers, useOrders, useProperties } from './useShop'

function OrdersList() {
  const { t } = useTranslation('backoffice')
  const { user } = useAuthStore()
  const { data, isLoading } = useOrders()
  const { data: propsData } = useProperties()
  const members = useMembers()
  const propertiesById = new Map((propsData?.properties || []).map((p) => [p.id, p]))

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('shop.orders.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">{t('shop.orders.pageSub')}</p>
        </div>
        <IconAction icon={FiShoppingBag} to="/backoffice/boutique" label={t('shop.orders.toShop')} tone="primary" tipAlign="end" />
      </div>
      <OrdersTracking orders={data?.orders || []} members={members} propertiesById={propertiesById} me={user?.id} isLoading={isLoading} />
    </div>
  )
}
export default OrdersList
