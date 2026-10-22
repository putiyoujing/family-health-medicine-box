const api = require('../../services/api')

Page({
  data: { verified: false, checking: true, seconds: 5, planName: '', message: '' },

  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },

  onLoad(options = {}) {
    this.orderId = String(options.orderId || '')
    return this.verifyOrder()
  },

  onUnload() { this.stopCountdown() },

  async verifyOrder() {
    this.stopCountdown()
    if (!this.orderId) { this.setData({ checking: false, message: '订单信息不完整，请在订单记录中查看。' }); return }
    this.setData({ checking: true, message: '' })
    try {
      const result = await api.getOrderForUser({ orderId: this.orderId })
      const order = result.order || {}
      if (order.status !== 'paid') throw new Error('支付结果仍在确认，请稍后重试。')
      this.setData({ verified: true, checking: false, planName: order.planName || '会员', seconds: 5 })
      this.timer = setInterval(() => {
        const seconds = this.data.seconds - 1
        this.setData({ seconds })
        if (seconds <= 0) this.goMembership()
      }, 1000)
    } catch (error) {
      this.setData({ verified: false, checking: false, message: error.message || '订单暂未确认，请稍后重试。' })
    }
  },

  stopCountdown() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  goMembership() {
    this.stopCountdown()
    if (this._navigating) return
    this._navigating = true
    wx.reLaunch({ url: '/pages/membership/index' })
  },

  openOrder() {
    if (this.orderId) wx.redirectTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(this.orderId)}` })
  },
})
