const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const typeOptions = ['使用问题', '功能建议', '数据错误', '账号与数据请求', '其他反馈']

Page({
  data: {
    submitting: false,
    typeOptions,
    typeIndex: 0,
    form: {
      type: typeOptions[0],
      content: '',
    },
  },

  onLoad(options = {}) {
    const requestedType = decodeURIComponent(options.type || '')
    const typeIndex = typeOptions.indexOf(requestedType)
    if (typeIndex >= 0) {
      this.setData({
        typeIndex,
        'form.type': typeOptions[typeIndex],
      })
    }
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value)
    this.setData({
      typeIndex,
      'form.type': this.data.typeOptions[typeIndex],
    })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  async submit() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    const form = this.data.form
    if (!String(form.content || '').trim()) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中' })
    try {
      await api.saveFeedback({
        type: form.type,
        content: form.content,
        page: 'profile',
      })
      wx.hideLoading()
      wx.showToast({ title: '已提交' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
