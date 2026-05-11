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
    family: null,
    members: [],
    form: { ...emptyMember },
    exportText: '',
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const home = await api.getHome()
      this.setData({
        family: home.family,
        members: home.members,
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

  openAdmin() {
    wx.navigateTo({
      url: '/pages/admin/index',
    })
  },
})
