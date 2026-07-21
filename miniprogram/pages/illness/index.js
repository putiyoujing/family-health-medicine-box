const api = require('../../services/api')
const { formatDateTime, memberName } = require('../../utils/format')
const { ensureHasMembers, ensureLoginReady } = require('../../utils/operation-guards')

Page({
  data: {
    loading: true,
    family: null,
    members: [],
    records: [],
  },

  onShow() {
    const app = getApp()
    if (app.globalData && app.globalData.openQuickIllness) {
      app.globalData.openQuickIllness = false
      this.shouldOpenQuickIllness = true
    }
    if (this.homeLoaded && api.isHomeCacheFresh()) {
      this.openQuickIllness()
      return
    }
    this.load({ silent: this.homeLoaded })
  },

  async load(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
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
      })
      this.homeLoaded = true
      this.openQuickIllness(home)
    } catch (error) {
      if (options.silent) {
        console.warn('illness refresh failed', error)
        return
      }
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  openQuickIllness(home = getHomeSnapshot(this.data)) {
    if (!this.shouldOpenQuickIllness) {
      return
    }
    this.shouldOpenQuickIllness = false
    if (ensureHasMembers(home)) {
      wx.navigateTo({ url: '/pages/illness/form' })
    }
  },

  createRecord() {
    if (!ensureHasMembers(getHomeSnapshot(this.data))) {
      return
    }
    wx.navigateTo({ url: '/pages/illness/form' })
  },

  editRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/form?id=${id}` })
  },

  appendRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}&action=add` })
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/detail?id=${id}` })
  },

  quickSimilar(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/illness/form?similarId=${id}` })
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
