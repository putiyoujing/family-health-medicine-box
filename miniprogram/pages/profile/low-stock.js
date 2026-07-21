const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const options = [10, 20, 25, 30, 50].map((value) => ({
  value,
  label: `${value}%`,
}))

Page({
  data: {
    options,
    threshold: 25,
    saving: false,
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        return
      }
      const home = await api.getHome()
      this.setData({ threshold: normalizeLowStockThreshold(home.user && home.user.lowStockThreshold) })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  selectThreshold(event) {
    this.setData({ threshold: normalizeLowStockThreshold(event.currentTarget.dataset.value) })
  },

  async save() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn || this.data.saving) {
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const result = await api.updateUserProfile({ lowStockThreshold: this.data.threshold })
      const app = getApp()
      if (app.globalData && result && result.user) {
        app.globalData.userProfile = result.user
      }
      wx.hideLoading()
      wx.showToast({ title: '提醒设置已保存' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})

function normalizeLowStockThreshold(value) {
  const threshold = Number(value)
  return options.some((item) => item.value === threshold) ? threshold : 25
}
