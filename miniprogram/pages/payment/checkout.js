Page({
  data: {
    orderId: '',
    orderNo: '',
    amount: 0,
    amountText: '0',
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

  goToMembership() {
    const app = getApp()
    if (app.globalData) {
      app.globalData.focusMembershipRedeem = true
    }
    const pages = getCurrentPages()
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    if (previousPage && previousPage.route === 'pages/membership/index') {
      wx.navigateBack()
      return
    }
    wx.redirectTo({ url: '/pages/membership/index?focus=redeem' })
  },
})

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
}
