const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: { loading: true, plan: {}, family: {}, coupon: null, originalAmount: 0, discountAmount: 0, payableAmount: 0, originalText: '0.00', discountText: '0.00', payableText: '0.00', submitting: false, paymentMessage: '' },

  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },

  onLoad(options) {
    this.planId = decodeURIComponent(options.planId || '')
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (eventChannel) eventChannel.on('couponSelected', (coupon) => this.setData({ coupon }, () => this.refreshPreview()))
    this.load()
  },

  async load() {
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try {
      const [membership, planData] = await Promise.all([api.getMembershipStatus(), api.getPlans()])
      const plan = (planData.plans || []).find((item) => item.planId === this.planId) || {}
      this.setData({ family: membership.family || {}, plan, loading: false }, () => this.refreshPreview())
    } catch (error) {
      this.setData({ loading: false, paymentMessage: error.message || '订单信息加载失败' })
    }
  },

  async refreshPreview() {
    if (!this.data.plan.planId) return
    try {
      const result = await api.previewOrder({ planId: this.data.plan.planId, couponCode: this.data.coupon && this.data.coupon.code })
      this.setData({ originalAmount: result.originalAmount, discountAmount: result.discountAmount, payableAmount: result.payableAmount, originalText: formatMoney(result.originalAmount), discountText: formatMoney(result.discountAmount), payableText: formatMoney(result.payableAmount) })
    } catch (error) {
      this.setData({ coupon: null, discountAmount: 0, payableAmount: this.data.plan.price, discountText: '0.00', payableText: formatMoney(this.data.plan.price), paymentMessage: error.message || '优惠券不可用' })
    }
  },

  chooseCoupon() {
    wx.navigateTo({
      url: `/pages/coupons/index?selectFor=${encodeURIComponent(this.data.plan.planId || '')}`,
      success: (res) => res.eventChannel && res.eventChannel.on('couponSelected', (coupon) => this.setData({ coupon }, () => this.refreshPreview())),
    })
  },

  clearCoupon() { this.setData({ coupon: null }, () => this.refreshPreview()) },

  async confirmPayment() {
    if (this.data.submitting || !this.data.plan.planId) return
    if (!await ensureLoginReady()) return
    this.setData({ submitting: true, paymentMessage: '' })
    try {
      const result = await api.createOrder({ planId: this.data.plan.planId, couponCode: this.data.coupon && this.data.coupon.code, idempotencyKey: `mini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
      const app = getApp()
      if (app.globalData && app.globalData.useDemoData && result.status === 'paid') {
        wx.showToast({ title: '支付成功' })
        setTimeout(() => wx.navigateBack({ delta: 2 }), 600)
        return
      }
      if (result.payment && result.payment.ready && result.payment.requestPaymentArgs) {
        await new Promise((resolve, reject) => wx.requestPayment({ ...result.payment.requestPaymentArgs, success: resolve, fail: reject }))
        wx.showToast({ title: '支付结果确认中' })
        setTimeout(() => wx.navigateBack({ delta: 2 }), 600)
        return
      }
      this.setData({ submitting: false, paymentMessage: '官方虚拟支付参数尚未配置，订单已保存为待支付，请稍后重试。' })
    } catch (error) {
      this.setData({ submitting: false, paymentMessage: error.message || '支付未完成，请稍后重试' })
    }
  },
})

function formatMoney(value) { return (Number(value || 0) / 100).toFixed(2) }
