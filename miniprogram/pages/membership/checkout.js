const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: { loading: true, plan: {}, family: {}, coupon: null, originalAmount: 0, discountAmount: 0, payableAmount: 0, originalText: '0.00', discountText: '0.00', payableText: '0.00', submitting: false, paymentMessage: '', paymentReady: false, paymentProvider: '', previewReady: false, couponsEnabled: false, awaitingConfirmation: false, paymentConfirmed: false },

  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },

  onLoad(options) {
    this.planId = decodeURIComponent(options.planId || '')
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (eventChannel) eventChannel.on('couponSelected', (coupon) => this.setData({ coupon }, () => this.refreshPreview()))
    return this.load()
  },

  async onShow() {
    if (this.pendingOrderId && !this._submitting) await this.refreshPaymentResult()
  },

  openOrderDetail() {
    if (this.pendingOrderId) wx.navigateTo({ url: `/pages/orders/detail?orderId=${encodeURIComponent(this.pendingOrderId)}` })
  },

  async refreshPaymentResult() {
    if (!this.pendingOrderId || this._checkingPayment) return
    this._checkingPayment = true
    try {
      const confirmation = await api.getOrderForUser({ orderId: this.pendingOrderId })
      const status = confirmation.order && confirmation.order.status
      if (['cancelled', 'closed', 'failed', 'refunded'].includes(status)) {
        if (this.paymentAttempt) {
          try { wx.removeStorageSync(this.paymentAttempt.storageKey) } catch (_) { /* 下次购买使用新订单 */ }
        }
        this.paymentAttempt = null
        this.pendingOrderId = ''
        this.setData({ awaitingConfirmation: false, paymentMessage: '订单已结束，可重新发起购买。' })
        return
      }
      if (status === 'refund_review') {
        this.setData({ paymentMessage: '订单退款处理中，请在订单记录中查看结果。' })
        return
      }
      if (status !== 'paid') {
        this.setData({ paymentMessage: '支付结果确认中，请勿重复付款，可刷新或查看订单详情。' })
        return
      }
      if (this.paymentAttempt) {
        try { wx.removeStorageSync(this.paymentAttempt.storageKey) } catch (_) { /* 订单已确认 */ }
      }
      this.pendingOrderId = ''
      this.setData({ paymentConfirmed: true, awaitingConfirmation: false, paymentMessage: '支付已确认，会员权益已开通。' })
      wx.showToast({ title: '会员已开通' })
    } catch (error) {
      this.setData({ paymentMessage: error.message || '支付结果暂未确认，请点击刷新支付结果。' })
    } finally { this._checkingPayment = false }
  },

  async load() {
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try {
      const [membership, planData] = await Promise.all([api.getMembershipStatus(), api.getPlans()])
      const plan = (planData.plans || []).find((item) => item.planId === this.planId) || {}
      const capability = planData.paymentCapability || {}
      const platform = getPlatform()
      const iosBlocked = platform === 'ios' && capability.iosEnabled !== true
      this.setData({ family: membership.family || {}, plan, loading: false, paymentReady: capability.ready === true && !iosBlocked, paymentProvider: capability.provider || '', couponsEnabled: capability.couponsEnabled !== false, coupon: capability.couponsEnabled === false ? null : this.data.coupon, paymentMessage: iosBlocked ? '当前暂未开通 iOS 支付，可使用已有兑换码。' : capability.ready ? '' : (capability.reason || '在线支付暂未开放，可使用已有兑换码。') })
      await this.refreshPreview()
    } catch (error) {
      this.setData({ loading: false, paymentMessage: error.message || '订单信息加载失败' })
    }
  },

  async refreshPreview() {
    if (!this.data.plan.planId) return
    this.setData({ previewReady: false })
    try {
      const result = await api.previewOrder({ planId: this.data.plan.planId, couponCode: this.data.coupon && this.data.coupon.code })
      this.setData({ previewReady: true, originalAmount: result.originalAmount, discountAmount: result.discountAmount, payableAmount: result.payableAmount, originalText: formatMoney(result.originalAmount), discountText: formatMoney(result.discountAmount), payableText: formatMoney(result.payableAmount) })
    } catch (error) {
      this.setData({ coupon: null, discountAmount: 0, payableAmount: this.data.plan.price, discountText: '0.00', payableText: formatMoney(this.data.plan.price), paymentMessage: error.message || '优惠券不可用' })
    }
  },

  chooseCoupon() {
    if (this.data.submitting || this.data.couponsEnabled === false) return
    wx.navigateTo({
      url: `/pages/coupons/index?selectFor=${encodeURIComponent(this.data.plan.planId || '')}`,
      success: (res) => res.eventChannel && res.eventChannel.on('couponSelected', (coupon) => this.setData({ coupon }, () => this.refreshPreview())),
    })
  },

  clearCoupon() { if (this.data.submitting) return; this.setData({ coupon: null }, () => this.refreshPreview()) },

  async confirmPayment() {
    if (this._submitting || this.data.submitting || this.data.paymentConfirmed || !this.data.plan.planId) return
    if (this.data.awaitingConfirmation) { await this.refreshPaymentResult(); return }
    if (!this.data.paymentReady || !this.data.previewReady) {
      this.setData({ paymentMessage: this.data.paymentMessage || '在线支付暂未开放，请稍后重试。' })
      return
    }
    this._submitting = true
    try {
      if (!await ensureLoginReady()) return
      this.setData({ submitting: true, paymentMessage: '' })
      if (getPlatform() === 'ios') {
        const device = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
        const app = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
        if (!versionAtLeast(String(device.system || '').replace(/^iOS\s*/i, ''), '15.0') || !versionAtLeast(app.version, '8.0.68')) throw new Error('iOS 支付需要 iOS 15 及以上、微信 8.0.68 及以上。')
        if (Number(this.data.payableAmount) < 100) throw new Error('iOS 支付金额不能低于 1 元。')
      }
      const couponCode = this.data.coupon && this.data.coupon.code
      const scope = JSON.stringify([this.data.family._id, this.data.plan.planId, couponCode || ''])
      if (!this.paymentAttempt || this.paymentAttempt.scope !== scope) {
        const storageKey = `membership-payment-${scope}`
        let key
        try { key = wx.getStorageSync(storageKey) } catch (_) { /* 使用当前页面幂等键 */ }
        if (typeof key !== 'string' || !key.startsWith('mini-')) key = `mini-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        this.paymentAttempt = { scope, key, storageKey }
        try { wx.setStorageSync(storageKey, key) } catch (_) { /* 当前页面重试仍复用幂等键 */ }
      }
      const loginCode = await new Promise((resolve, reject) => wx.login({ success: (result) => result.code ? resolve(result.code) : reject(new Error('登录凭证获取失败，请重试')), fail: reject }))
      const result = await api.createOrder({ loginCode, platform: getPlatform(), familyId: this.data.family._id, planId: this.data.plan.planId, couponCode, idempotencyKey: this.paymentAttempt.key })
      if (!result.orderId) throw new Error('订单信息不完整，请重试。')
      if (result.status !== 'paid' && !result.requiresConfirmation) {
        const payment = result.payment || {}
        if (!payment.ready) throw new Error(payment.reason || '支付服务尚未就绪，请稍后重试。')
        const provider = payment.provider || this.data.paymentProvider
        const request = provider === 'official_virtual_payment' ? wx.requestVirtualPayment : null
        const args = payment.requestVirtualPaymentArgs
        if (!request || !args) throw new Error('当前支付方式不可用，请稍后重试。')
        this.pendingOrderId = result.orderId
        this.setData({ awaitingConfirmation: true })
        await new Promise((resolve, reject) => request.call(wx, { ...args, success: resolve, fail: reject }))
      }
      this.pendingOrderId = result.orderId
      this.setData({ awaitingConfirmation: true })
      await this.refreshPaymentResult()
    } catch (error) {
      const message = error.message || error.errMsg || '支付未完成，请稍后重试'
      this.setData({ paymentMessage: /cancel/i.test(message) ? '已取消支付，请刷新订单状态；订单关闭后可重新购买。' : message })
    } finally {
      this._submitting = false
      this.setData({ submitting: false })
    }
  },
})

function formatMoney(value) { return (Number(value || 0) / 100).toFixed(2) }

function getPlatform() {
  try { return (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform || '' } catch (_) { return '' }
}

function versionAtLeast(value, minimum) {
  const actual = String(value || '').split('.').map(Number)
  const required = minimum.split('.').map(Number)
  if (!value || actual.some((part) => !Number.isFinite(part))) return false
  for (let index = 0; index < required.length; index++) {
    const difference = (actual[index] || 0) - required[index]
    if (difference) return difference > 0
  }
  return true
}
