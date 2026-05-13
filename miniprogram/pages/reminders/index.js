const api = require('../../services/api')
const { nowDateTimeInput } = require('../../utils/format')

const typeOptions = [
  { label: '用药提醒', value: 'medication' },
  { label: '复诊提醒', value: 'follow_up' },
  { label: '常备检查', value: 'stock_check' },
]

const emptyForm = {
  type: 'medication',
  title: '',
  remindAt: '',
  note: '',
}

Page({
  data: {
    typeOptions,
    typeIndex: 0,
    reminders: [],
    form: { ...emptyForm, remindAt: nowDateTimeInput() },
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const home = await api.getHome()
      this.setData({
        reminders: (home.reminders || []).map((item) => ({
          ...item,
          typeLabel: typeOptions.find((option) => option.value === item.type)?.label || '提醒',
        })),
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value)
    this.setData({
      typeIndex,
      'form.type': this.data.typeOptions[typeIndex].value,
    })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  async save() {
    if (!this.data.form.title || !this.data.form.remindAt) {
      wx.showToast({ title: '请填写标题和时间', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      await api.saveReminder({
        ...this.data.form,
        status: 'active',
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存' })
      this.setData({
        typeIndex: 0,
        form: { ...emptyForm, remindAt: nowDateTimeInput() },
      })
      this.load()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },
})
