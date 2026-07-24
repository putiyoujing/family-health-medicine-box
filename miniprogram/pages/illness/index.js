const api = require('../../services/api')
const { formatDateTime, memberName } = require('../../utils/format')
const { canEditFamilyRecords, ensureFamilyWriteAccess, ensureHasMembers, ensureLoginReady } = require('../../utils/operation-guards')
const { syncTabBar } = require('../../utils/tab-bar')

Page({
  data: {
    loading: true,
    family: null,
    members: [],
    records: [],
    canEditRecords: false,
    showWriteEntries: true,
  },

  onShow() {
    syncTabBar(this, 1)
    const app = getApp()
    if (app.globalData && app.globalData.openQuickIllness) {
      app.globalData.openQuickIllness = false
      this.shouldOpenQuickIllness = true
    }
    this.load({ silent: this.homeLoaded, force: true })
  },

  async load(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      const loggedIn = await ensureLoginReady({ silent: true })
      if (!loggedIn) {
        this.showGuestState()
        return
      }
      const home = await api.getHome({ force: Boolean(options.force) })
      const canEditRecords = canEditFamilyRecords(home.family)
      const records = [...home.illnessRecords].sort(compareIllnessRecords).map((item) => ({
        ...item,
        completed: isCompleted(item),
        statusText: isCompleted(item) ? '已关闭' : item.status,
        memberName: memberName(home.members, item.memberId),
        timeText: formatDateTime(item.startedAt),
        symptomText: (item.symptoms || []).join('、') || '未填症状',
        temperatureText: hasValue(item.temperatureMax) ? `${item.temperatureMax}℃` : '未记录',
      }))
      this.setData({
        loading: false,
        family: home.family,
        members: home.members,
        records,
        canEditRecords,
        showWriteEntries: canEditRecords,
      })
      this.homeLoaded = true
      this.openQuickIllness(home, canEditRecords)
    } catch (error) {
      if (error && error.message === 'LOGIN_REQUIRED') {
        this.showGuestState()
        return
      }
      if (options.silent) {
        console.warn('illness refresh failed', error)
        return
      }
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  showGuestState() {
    this.homeLoaded = false
    this.setData({
      loading: false,
      family: null,
      members: [],
      records: [],
      canEditRecords: false,
      showWriteEntries: true,
    })
  },

  openQuickIllness(home = getHomeSnapshot(this.data), canEditRecords = this.data.canEditRecords) {
    if (!this.shouldOpenQuickIllness) {
      return
    }
    this.shouldOpenQuickIllness = false
    if (canEditRecords && ensureHasMembers(home)) {
      wx.navigateTo({ url: '/pages/illness/form' })
    }
  },

  async createRecord() {
    if (!await ensureFamilyWriteAccess(this.data.canEditRecords)) {
      return
    }
    if (!ensureHasMembers(getHomeSnapshot(this.data))) {
      return
    }
    wx.navigateTo({ url: '/pages/illness/form' })
  },

  async editRecord(event) {
    if (!await ensureFamilyWriteAccess(this.data.canEditRecords)) {
      return
    }
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/form?id=${id}` })
  },

  async appendRecord(event) {
    if (!await ensureFamilyWriteAccess(this.data.canEditRecords)) {
      return
    }
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}&action=add` })
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}` })
  },

  async quickSimilar(event) {
    if (!await ensureFamilyWriteAccess(this.data.canEditRecords)) {
      return
    }
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/form?similarId=${id}` })
  },

  onPullDownRefresh() {
    this.load({ silent: true, force: true }).finally(() => wx.stopPullDownRefresh())
  },
})

function getHomeSnapshot(data) {
  return {
    currentFamilyId: data.family && data.family._id,
    family: data.family,
    members: data.members || [],
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function compareIllnessRecords(left, right) {
  const completionDifference = Number(isCompleted(left)) - Number(isCompleted(right))
  if (completionDifference) {
    return completionDifference
  }
  const leftTime = isCompleted(left) ? left.endedAt || left.startedAt : left.startedAt
  const rightTime = isCompleted(right) ? right.endedAt || right.startedAt : right.startedAt
  return toTime(rightTime) - toTime(leftTime)
}

function isCompleted(record) {
  return !!(record && (record.status === '已恢复' || record.status === '已关闭' || record.endedAt))
}

function toTime(value) {
  const time = new Date(String(value || '').replace(' ', 'T')).getTime()
  return Number.isNaN(time) ? 0 : time
}
