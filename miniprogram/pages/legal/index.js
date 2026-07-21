const pageTitles = {
  privacy: '隐私说明',
  safety: '医疗安全说明',
  terms: '用户协议',
}

Page({
  data: {
    type: 'privacy',
    title: pageTitles.privacy,
    effectiveDate: '2026-07-12',
  },

  onLoad(options = {}) {
    const type = pageTitles[options.type] ? options.type : 'privacy'
    const title = pageTitles[type]
    this.setData({ type, title })
    wx.setNavigationBarTitle({ title })
  },

  openFeedback() {
    wx.navigateTo({
      url: `/pages/feedback/index?type=${encodeURIComponent('账号与数据请求')}`,
    })
  },
})
