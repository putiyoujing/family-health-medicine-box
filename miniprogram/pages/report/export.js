const api = require('../../services/api')

const rangeOptions = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
]

Page({
  data: {
    loading: false,
    rangeOptions,
    rangeIndex: 1,
    rangeLabel: rangeOptions[1].label,
    reportText: '',
  },

  onRangeChange(event) {
    const rangeIndex = Number(event.detail.value)
    this.setData({
      rangeIndex,
      rangeLabel: this.data.rangeOptions[rangeIndex].label,
    })
  },

  async generate() {
    this.setData({ loading: true })
    wx.showLoading({ title: '整理中' })
    try {
      const days = this.data.rangeOptions[this.data.rangeIndex].value
      const data = await api.exportReport({ days })
      wx.hideLoading()
      this.setData({
        loading: false,
        reportText: data.reportText || '',
      })
      wx.setClipboardData({ data: data.reportText || '' })
    } catch (error) {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    }
  },
})
