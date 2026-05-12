const api = require('../../services/api')

const emptyMember = {
  name: '',
  relation: '孩子',
  gender: 'female',
  birthday: '',
  allergyHistory: '',
  medicalHistory: '',
  note: '',
}

Page({
  data: {
    family: {},
    entitlement: {
      planName: '免费版',
      limits: {
        maxMembers: 3,
      },
    },
    members: [],
    form: { ...emptyMember },
    exportText: '',
    memberLimit: 3,
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const home = await api.getHome()
      this.setData({
        family: home.family,
        entitlement: home.entitlement,
        members: (home.members || []).map((member) => ({
          ...member,
          initial: (member.name || '家').slice(0, 1),
        })),
        memberLimit: home.entitlement && home.entitlement.limits ? home.entitlement.limits.maxMembers : 3,
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  async saveMember() {
    const form = this.data.form
    if (!form.name) {
      wx.showToast({ title: '请填写成员名称', icon: 'none' })
      return
    }
    await api.saveMember(form)
    wx.showToast({ title: '已添加' })
    this.setData({ form: { ...emptyMember } })
    this.load()
  },

  async exportData() {
    wx.showLoading({ title: '导出中' })
    try {
      const data = await api.exportData()
      wx.hideLoading()
      this.setData({
        exportText: JSON.stringify(data, null, 2),
      })
      wx.setClipboardData({
        data: JSON.stringify(data, null, 2),
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    }
  },

  openFamily() {
    wx.navigateTo({
      url: '/pages/family/index',
    })
  },

  openMembership() {
    wx.navigateTo({
      url: '/pages/membership/index',
    })
  },

  openReport() {
    wx.navigateTo({
      url: '/pages/report/export',
    })
  },

  openReminders() {
    wx.navigateTo({
      url: '/pages/reminders/index',
    })
  },
})
