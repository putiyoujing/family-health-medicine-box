const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: { loading: true, activeTab: 'available', coupons: [], selectFor: '' },
  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },
  onLoad(options) { this.selectFor = options.selectFor || ''; this.setData({ selectFor: this.selectFor }); this.load() },
  async load() {
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try {
      const result = await api.listCouponsForUser({ planId: this.data.selectFor })
      this.setData({ loading: false, coupons: (result.coupons || []).map(normalizeCoupon) })
    } catch (error) { this.setData({ loading: false }); wx.showToast({ title: error.message || '优惠券加载失败', icon: 'none' }) }
  },
  switchTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }) },
  chooseCoupon(event) {
    const coupon = this.data.coupons.find((item) => item.code === event.currentTarget.dataset.code)
    if (!coupon) return
    if (this.selectFor) {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
      if (channel) channel.emit('couponSelected', coupon)
      wx.navigateBack({ delta: 1 }); return
    }
    wx.navigateTo({ url: '/pages/membership/index' })
  },
  goMembership() { wx.navigateTo({ url: '/pages/membership/index' }) },
})

function normalizeCoupon(coupon) {
  return { ...coupon, displayName: coupon.name || '未命名优惠券', validText: formatDate(coupon.endAt || coupon.expiresAt), statusGroup: coupon.statusGroup || coupon.status || 'active' }
}
function formatDate(value) { if (!value) return '长期有效'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
