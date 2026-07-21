const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: {
    planId: '',
    couponCode: '',
    coupons: [],
  },

  onLoad(options) {
    this.setData({
      planId: options.planId || 'yearly_pro',
      couponCode: options.code || '',
    })
    this.load()
  },

  async load() {
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        return
      }
      const data = await api.listCouponsForUser({ planId: this.data.planId })
      this.setData({ coupons: data.coupons || [] })
    } catch (error) {
      this.setData({ coupons: [] })
    }
  },

  onInput(event) {
    this.setData({ couponCode: String(event.detail.value || '').trim().toUpperCase() })
  },

  useInput() {
    if (!this.data.couponCode) {
      wx.showToast({ title: '请输入优惠码', icon: 'none' })
      return
    }
    this.useCoupon(this.data.couponCode)
  },

  chooseCoupon(event) {
    this.useCoupon(event.currentTarget.dataset.code)
  },

  useCoupon(code) {
    const app = getApp()
    if (app.globalData) {
      app.globalData.selectedCouponCode = code || ''
    }
    wx.navigateBack()
  },
})
