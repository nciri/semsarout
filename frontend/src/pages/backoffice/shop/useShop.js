import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import api from '../../../services/api'
import { shopService } from '../../../services/shopService'
import { teamService } from '../../../services/teamService'
import { useFormat } from '../../../utils/format'

/** Montant exact en dirhams : la boutique compte à l'unité, pas en « k Dh ». */
export function useDh() {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  const dh = (v) => `${fmtNumber(Math.round(v || 0))} ${t('dashboard.units.dirham')}`
  dh.parts = (v) => [fmtNumber(Math.round(v || 0)), t('dashboard.units.dirham')]
  return dh
}

export const useProducts = () => useQuery('shop-products-all', () => shopService.products(), { staleTime: 60000 })
export const useCategories = () => useQuery('shop-categories', () => shopService.categories(), { staleTime: 3600000 })
export const useCart = () => useQuery('shop-cart', () => shopService.getCart())
export const useTeamCarts = () => useQuery('shop-carts', () => shopService.teamCarts(), { retry: false })
export const useOrders = () => useQuery('shop-orders-full', () => shopService.listOrders({ with_items: true }))
export const useSpending = () => useQuery('shop-summary', () => shopService.summary(), { retry: false })
export const useProperties = () => useQuery('bo-properties-shop', async () => (await api.get('/backoffice/properties?per_page=100')).data, { staleTime: 300000 })

/** Nom des membres de l'agence, pour « commandée par » et les paniers de l'équipe. */
export function useMembers() {
  const { data } = useQuery('team', teamService.getTeam, { retry: false, staleTime: 300000 })
  return new Map((data?.members || []).map((m) => [m.id, m.full_name || [m.first_name, m.last_name].filter(Boolean).join(' ')]))
}

const errorOf = (e, fallback) => e?.response?.data?.error || fallback

export function useShopActions() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const onError = (e) => toast.error(errorOf(e, t('common:errors.short')))
  const refreshCart = () => { qc.invalidateQueries('shop-cart'); qc.invalidateQueries('shop-carts') }
  const refreshOrders = () => {
    qc.invalidateQueries('shop-orders-full')
    qc.invalidateQueries('shop-summary')
    qc.invalidateQueries('shop-order')
    qc.invalidateQueries('shop-products-all')
  }
  return {
    add: useMutation(({ id, quantity = 1 }) => shopService.addToCart(id, quantity), {
      onSuccess: () => { toast.success(t('backoffice:shop.toasts.added')); refreshCart() }, onError,
    }),
    update: useMutation(({ id, quantity }) => shopService.updateCartItem(id, quantity), { onSuccess: refreshCart, onError }),
    remove: useMutation((id) => shopService.removeCartItem(id), { onSuccess: refreshCart, onError }),
    checkout: useMutation((body) => shopService.checkout(body), {
      onSuccess: () => { toast.success(t('backoffice:shop.toasts.orderCreated')); refreshCart(); refreshOrders() }, onError,
    }),
    pay: useMutation((id) => shopService.payOrder(id), {
      onSuccess: () => { toast.success(t('backoffice:shop.toasts.paid')); refreshOrders() },
      onError: (e) => toast.error(errorOf(e, t('backoffice:shop.toasts.payError'))),
    }),
    cancel: useMutation((id) => shopService.cancelOrder(id), {
      onSuccess: () => { toast.success(t('backoffice:shop.toasts.cancelled')); refreshOrders() }, onError,
    }),
  }
}
