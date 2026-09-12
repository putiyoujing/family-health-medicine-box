const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { buildFields, fieldsToObject, kindOptions } = require('../../utils/ai-image-fields')

Page({
  onShareAppMessage() {
    return require('../../utils/share').getDefaultShareConfig()
  },

  data: {
    parsing: false,
    confirming: false,
    source: '',
    attachment: null,
    kindOptions,
    kindIndex: 0,
    kindLabel: kindOptions[0].label,
    task: null,
    fields: [],
    featureEnabled: false,
  },

  onLoad(options) {
    const app = getApp()
    const attachment = app.globalData && app.globalData.pendingParseAttachment
    const imageKind = (attachment && attachment.imageKind) || options.kind || 'medicine_box'
    const kindIndex = Math.max(0, kindOptions.findIndex((item) => item.value === imageKind))
    this.setData({
      source: options.source || '',
      attachment,
      kindIndex,
      kindLabel: kindOptions[kindIndex].label,
      fields: buildFields(imageKind, {}),
      featureEnabled: !!(app.globalData && app.globalData.imageParsingEnabled),
    })
  },

  onKindChange(event) {
    const kindIndex = Number(event.detail.value)
    const imageKind = this.data.kindOptions[kindIndex].value
    this.setData({
      kindIndex,
      kindLabel: this.data.kindOptions[kindIndex].label,
      fields: buildFields(imageKind, fieldsToObject(this.data.fields)),
    })
  },

  onFieldInput(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    this.setData({
      fields: this.data.fields.map((field) => (field.key === key ? { ...field, value } : field)),
    })
  },

  async startParse() {
    if (this.data.parsing) {
      return
    }
    if (!this.data.featureEnabled) {
      wx.showModal({
        title: '图片整理暂未开放',
        content: '当前版本未连接真实图片识别服务。请返回后手动填写，并保留原图供核对。',
        showCancel: false,
      })
      return
    }
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    if (!this.data.attachment || !this.data.attachment.fileId) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }
    this.setData({ parsing: true })
    wx.showLoading({ title: '整理中' })
    try {
      const imageKind = this.data.kindOptions[this.data.kindIndex].value
      const result = await api.parseAttachment({
        fileId: this.data.attachment.fileId,
        attachmentIds: this.data.attachment.attachmentIds || [],
        imageKind,
        relatedType: this.data.attachment.relatedType || this.data.source || '',
      })
      wx.hideLoading()
      const task = {
        ...result.task,
        statusText: result.task.status === 'success' ? '已生成待确认字段' : '已创建整理任务',
      }
      this.setData({
        parsing: false,
        task,
        fields: buildFields(imageKind, result.output || {}),
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ parsing: false })
      wx.showToast({ title: error.message || '整理失败', icon: 'none' })
    }
  },

  async confirmResult() {
    if (this.data.confirming) {
      return
    }
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    if (!this.data.task || !this.data.task._id) {
      wx.showToast({ title: '请先整理图片', icon: 'none' })
      return
    }
    this.setData({ confirming: true })
    wx.showLoading({ title: '保存中' })
    try {
      await api.confirmAiParseResult({
        taskId: this.data.task._id,
        output: fieldsToObject(this.data.fields),
        relatedType: this.data.attachment.relatedType || this.data.source || '',
      })
      wx.hideLoading()
      this.setData({ confirming: false })
      wx.showToast({ title: '已保存确认结果' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.hideLoading()
      this.setData({ confirming: false })
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  onUnload() {
    const app = getApp()
    if (app.globalData && app.globalData.pendingParseAttachment === this.data.attachment) {
      app.globalData.pendingParseAttachment = null
    }
  },
})
