const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const options = [7, 30, 60, 90].map((value) => ({
  value,
  label: `提前 ${value} 天`,
}))

Page({
  data: {
    options,
    reminderDays: 60,
    customDays: '',
    isCustom: false,
    customError: '',
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
      const reminderDays = normalizeExpiryReminderDays(home.user && home.user.expiryReminderDays)
      const isCustom = !options.some((item) => item.value === reminderDays)
      this.setData({
        reminderDays,
        customDays: isCustom ? String(reminderDays) : '',
        isCustom,
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  selectReminderDays(event) {
    this.setData({
      reminderDays: normalizeExpiryReminderDays(event.currentTarget.dataset.value),
      customDays: '',
      customError: '',
      isCustom: false,
    })
  },

  onCustomDaysInput(event) {
    this.setData({
      customDays: event.detail.value,
      customError: '',
      isCustom: true,
    })
  },

  async save() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn || this.data.saving) {
      return
    }
    const reminderDays = this.data.isCustom ? validateCustomReminderDays(this.data.customDays) : this.data.reminderDays
    if (!reminderDays) {
      this.setData({ customError: '请输入 1-365 之间的整数天数' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const result = await api.updateUserProfile({ expiryReminderDays: reminderDays })
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

function normalizeExpiryReminderDays(value) {
  const days = Number(value)
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 60
}

function validateCustomReminderDays(value) {
  const text = String(value || '').trim()
  if (!/^\d+$/.test(text)) {
    return 0
  }
  const days = Number(text)
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 0
}
