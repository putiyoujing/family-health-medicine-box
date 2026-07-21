const api = require('../../services/api')
const { SAFETY_NOTICE } = require('../../utils/constants')
const { daysUntil, formatDateTime, memberName } = require('../../utils/format')
const { ensureHasMembers, ensureLoginReady, ensureMedicationReady } = require('../../utils/operation-guards')
const { formatMedicineStockSummary } = require('../../utils/medicine-stock')

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
    expiryReminderDays: 60,
    lowStockMedicines: [],
    isDefaultHome: false,
    loadError: '',
    safetyNotice: SAFETY_NOTICE,
  },

  onShow() {
    this.loadHome({ silent: this.homeLoaded, force: true })
  },

  async loadHome(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true, loadError: '' })
    }
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome({ force: Boolean(options.force) })
      const lowStockThreshold = normalizeLowStockThreshold(home.user && home.user.lowStockThreshold)
      const expiryReminderDays = normalizeExpiryReminderDays(home.user && home.user.expiryReminderDays)
      const expiringMedicines = home.medicines
        .filter((item) => daysUntil(item.expireDate) <= expiryReminderDays)
        .slice(0, 3)
      const lowStockMedicines = home.medicines
        .filter((item) => Number(item.remainingQuantity || 0) <= Math.max(1, Number(item.totalQuantity || 0) * (lowStockThreshold / 100)))
        .slice(0, 3)
        .map((item) => ({ ...item, stockSummary: formatMedicineStockSummary(item) }))
      const activeCourses = home.illnessRecords
        .filter((item) => item.status !== '已恢复' && item.status !== '已关闭' && !item.endedAt)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          memberName: memberName(home.members, item.memberId),
          timeText: formatDateTime(item.startedAt),
          symptomText: (item.symptoms || []).join('、') || '未填症状',
        }))
      const isDefaultHome = !home.members.length
        && !home.medicines.length
        && !home.illnessRecords.length
        && !home.medicationLogs.length
        && !home.attachments.length
        && !home.reminders.length
      this.setData({
        loading: false,
        loadError: '',
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
          memberName: item.memberNameSnapshot || memberName(home.members, item.memberId),
          timeText: formatDateTime(item.takenAt),
        })),
        activeCourses,
        expiringMedicines,
        expiryReminderDays,
        lowStockMedicines,
        isDefaultHome,
        safetyNotice: home.safetyNotice || SAFETY_NOTICE,
      })
      this.homeLoaded = true
    } catch (error) {
      if (options.silent) {
        console.warn('dashboard refresh failed', error)
        return
      }
      this.setData({
        loading: false,
        loadError: error.message || '加载失败，请稍后重试',
      })
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none',
      })
    }
  },

  retryLoadHome() {
    api.invalidateHomeCache()
    this.loadHome()
  },

  goAddMember() {
    const app = getApp()
    if (app.globalData) {
      app.globalData.openMemberModal = true
    }
    wx.switchTab({ url: '/pages/profile/index' })
  },

  goMedicines() {
    wx.switchTab({ url: '/pages/medicines/index' })
  },

  goMembers() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  goByStat(event) {
    const target = event.currentTarget.dataset.target
    const map = {
      members: this.goMembers,
      medicines: this.goMedicines,
      illness: this.goIllness,
      medication: this.goMedication,
    }
    if (map[target]) {
      map[target].call(this)
    }
  },

  handleMedicine(event) {
    const id = event.currentTarget.dataset.id
    const reason = event.currentTarget.dataset.reason || ''
    const app = getApp()
    if (app.globalData) {
      app.globalData.focusMedicineId = id
      app.globalData.focusMedicineReason = reason
    }
    wx.switchTab({ url: '/pages/medicines/index' })
  },

  goMedicinePhoto() {
    const app = getApp()
    if (app.globalData) {
      app.globalData.openMedicineCamera = true
    }
    wx.switchTab({ url: '/pages/medicines/index' })
  },

  goIllness() {
    if (!ensureHasMembers(getHomeSnapshot(this.data))) {
      return
    }
    wx.switchTab({ url: '/pages/illness/index' })
  },

  goQuickIllness() {
    if (!ensureHasMembers(getHomeSnapshot(this.data))) {
      return
    }
    const app = getApp()
    if (app.globalData) {
      app.globalData.openQuickIllness = true
    }
    wx.switchTab({ url: '/pages/illness/index' })
  },

  goIllnessDetail(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}` })
  },

  addCourseEvent(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}&action=add` })
  },

  goCourseMedication(event) {
    if (!ensureMedicationReady(getHomeSnapshot(this.data))) {
      return
    }
    const id = event.currentTarget.dataset.id
    const memberId = event.currentTarget.dataset.member
    wx.navigateTo({
      url: `/pages/medication/form?memberId=${memberId || ''}&illnessRecordId=${id}`,
    })
  },

  goCourseReport(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/report/export?illnessRecordId=${id}` })
  },

  goMedication() {
    wx.switchTab({ url: '/pages/medication/index' })
  },

  createMedication() {
    if (!ensureMedicationReady(getHomeSnapshot(this.data))) {
      return
    }
    wx.navigateTo({ url: '/pages/medication/form' })
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' })
  },
})

function getHomeSnapshot(data) {
  return {
    currentFamilyId: data.family && data.family._id,
    family: data.family,
    members: data.members || [],
    medicines: data.medicines || [],
  }
}

function normalizeLowStockThreshold(value) {
  const threshold = Number(value)
  return [10, 20, 25, 30, 50].includes(threshold) ? threshold : 25
}

function normalizeExpiryReminderDays(value) {
  const days = Number(value)
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 60
}
