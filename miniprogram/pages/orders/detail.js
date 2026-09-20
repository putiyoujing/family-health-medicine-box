const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: { loading: true, order: {} },
  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },
  onLoad(options) { this.orderId = options.orderId || ''; this.load() },
  async load() {
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try { const result = await api.getOrderForUser({ orderId: this.orderId }); this.setData({ loading: false, order: normalizeOrder(result.order || {}) }) }
    catch (error) { this.setData({ loading: false }); wx.showToast({ title: error.message || '订单加载失败', icon: 'none' }) }
  },
})
function normalizeOrder(order) { return { ...order, amountText: (Number(order.payableAmount || 0) / 100).toFixed(2), originalText: (Number(order.originalAmount || 0) / 100).toFixed(2), discountText: (Number(order.discountAmount || 0) / 100).toFixed(2), statusText: ({ pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款', failed: '支付失败' })[order.status] || order.status || '处理中' } }
