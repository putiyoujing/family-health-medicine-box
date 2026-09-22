const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: { loading: true, orders: [] },
  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },
  onShow() { this.load() },
  async load() {
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try {
      const result = await api.listOrdersForUser()
      this.setData({ loading: false, orders: (result.orders || []).map(normalizeOrder) })
    } catch (error) { this.setData({ loading: false }); wx.showToast({ title: error.message || '订单加载失败', icon: 'none' }) }
  },
  openOrder(event) { const id = event.currentTarget.dataset.id; if (id) wx.navigateTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(id)}` }) },
})

function normalizeOrder(order) { return { ...order, amountText: (Number(order.payableAmount || 0) / 100).toFixed(2), statusText: ({ pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款', failed: '支付失败' })[order.status] || order.status || '处理中', createdText: formatDate(order.createdAt) } }
function formatDate(value) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
