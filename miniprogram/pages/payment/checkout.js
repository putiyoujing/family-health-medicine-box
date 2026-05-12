const api = require('../../services/api')

Page({
  data: {
    orderId: '',
    orderNo: '',
    amount: 0,
    amountText: '0',
    paying: false,
  },

  onLoad(options) {
    const amount = Number(options.amount || 0)
    this.setData({
      orderId: options.orderId || '',
      orderNo: options.orderNo || '',
      amount,
      amountText: formatMoney(amount),
    })
  },

  async pay() {
    if (!this.data.orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      return
    }
    this.setData({ paying: true })
    wx.showLoading({ title: '开通中' })
    try {
      await api.mockPaymentSuccess({ orderId: this.data.orderId })
      wx.hideLoading()
      wx.showToast({ title: '会员已开通' })
      setTimeout(() => {
        wx.navigateBack({ delta: 2 })
      }, 600)
    } catch (error) {
      wx.hideLoading()
      this.setData({ paying: false })
      wx.showToast({ title: error.message || '开通失败', icon: 'none' })
    }
  },
})

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
}
