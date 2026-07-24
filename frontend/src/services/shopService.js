import api from './api'

export const shopService = {
  categories: async () => (await api.get('/backoffice/shop/categories')).data,
  products: async (params = {}) => (await api.get('/backoffice/shop/products', { params })).data,
  product: async (id) => (await api.get(`/backoffice/shop/products/${id}`)).data,
  getCart: async () => (await api.get('/backoffice/shop/cart')).data,
  addToCart: async (product_id, quantity = 1) => (await api.post('/backoffice/shop/cart/items', { product_id, quantity })).data,
  updateCartItem: async (id, quantity) => (await api.put(`/backoffice/shop/cart/items/${id}`, { quantity })).data,
  removeCartItem: async (id) => (await api.delete(`/backoffice/shop/cart/items/${id}`)).data,
  checkout: async (data) => (await api.post('/backoffice/shop/orders', data)).data,
  payOrder: async (id) => (await api.post(`/backoffice/shop/orders/${id}/pay`)).data,
  listOrders: async (params = {}) => (await api.get('/backoffice/shop/orders', { params })).data,
  getOrder: async (id) => (await api.get(`/backoffice/shop/orders/${id}`)).data,
  adminListProducts: async (params = {}) => (await api.get('/admin/products', { params })).data,
  adminCreateProduct: async (data) => (await api.post('/admin/products', data)).data,
  adminUpdateProduct: async (id, data) => (await api.put(`/admin/products/${id}`, data)).data,
  adminDeleteProduct: async (id) => (await api.delete(`/admin/products/${id}`)).data,
  adminListOrders: async (params = {}) => (await api.get('/admin/orders', { params })).data,
  adminGetOrder: async (id) => (await api.get(`/admin/orders/${id}`)).data,
  adminUpdateOrder: async (id, status) => (await api.put(`/admin/orders/${id}`, { status })).data,
}
