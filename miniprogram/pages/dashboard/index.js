const api = require('../../services/api')
const { SAFETY_NOTICE } = require('../../utils/constants')
const { daysUntil, formatDateTime, memberName } = require('../../utils/format')

Page({
  data: {
    loading: true,
    family: null,
    stats: {},
    members: [],
    medicines: [],
    illnessRecords: [],
    medicationLogs: [],
    expiringMedicines: [],
    lowStockMedicines: [],
    safetyNotice: SAFETY_NOTICE,
  },

  onShow() {
    this.loadHome()
  },

  async loadHome() {
    this.setData({ loading: true })
    try {
      const home = await api.getHome()
      const expiringMedicines = home.medicines
        .filter((item) => daysUntil(item.expireDate) <= 60)
        .slice(0, 3)
      const lowStockMedicines = home.medicines
        .filter((item) => Number(item.remainingQuantity || 0) <= Math.max(1, Number(item.totalQuantity || 0) * 0.25))
        .slice(0, 3)
      this.setData({
        loading: false,
        family: home.family,
        stats: home.stats,
        members: home.members,
        medicines: home.medicines,
        illnessRecords: home.illnessRecords.slice(0, 3).map((item) => ({
          ...item,
          memberName: memberName(home.members, item.memberId),
          timeText: formatDateTime(item.startedAt),
          symptomText: (item.symptoms || []).join('、') || '未填症状',
        })),
        medicationLogs: home.medicationLogs.slice(0, 3).map((item) => ({
          ...item,
          memberName: memberName(home.members, item.memberId),
          timeText: formatDateTime(item.takenAt),
        })),
        expiringMedicines,
        lowStockMedicines,
        safetyNotice: home.safetyNotice || SAFETY_NOTICE,
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none',
      })
    }
  },

  goMedicines() {
    wx.switchTab({ url: '/pages/medicines/index' })
  },

  goIllness() {
    wx.switchTab({ url: '/pages/illness/index' })
  },

  goMedication() {
    wx.switchTab({ url: '/pages/medication/index' })
  },

  goAssistant() {
    wx.navigateTo({ url: '/pages/assistant/index' })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' })
  },
})
