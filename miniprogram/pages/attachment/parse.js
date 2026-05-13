const api = require('../../services/api')

const kindOptions = [
  { label: '外包装 / 药瓶', value: 'medicine_box' },
  { label: '药品说明书', value: 'instruction' },
  { label: '处方 / 医嘱', value: 'prescription' },
  { label: '检查单', value: 'examination' },
]

const fieldSets = {
  medicine_box: [
    { key: 'name', label: '药品名称', placeholder: '请确认药品名称' },
    { key: 'specification', label: '规格', placeholder: '例如 100ml/瓶' },
    { key: 'expireDate', label: '有效期', placeholder: '例如 2027-12-31' },
    { key: 'manufacturer', label: '厂家', placeholder: '可选' },
    { key: 'approvalNo', label: '批准文号', placeholder: '可选' },
  ],
  instruction: [
    { key: 'name', label: '药品名称', placeholder: '请确认药品名称' },
    { key: 'instructionText', label: '说明书重点', placeholder: '用法、注意事项等原文整理' },
    { key: 'contraindications', label: '禁忌/注意', placeholder: '可选' },
  ],
  prescription: [
    { key: 'doctorDiagnosis', label: '医生记录', placeholder: '按处方或医嘱原文整理' },
    { key: 'doctorAdvice', label: '医嘱', placeholder: '请人工确认' },
    { key: 'summary', label: '就医摘要', placeholder: '可选' },
  ],
  examination: [
    { key: 'examinationResult', label: '检查结果', placeholder: '检查项目、结果、单位、参考范围' },
    { key: 'summary', label: '检查摘要', placeholder: '可选' },
  ],
}

Page({
  data: {
    parsing: false,
    source: '',
    attachment: null,
    kindOptions,
    kindIndex: 0,
    kindLabel: kindOptions[0].label,
    task: null,
    fields: [],
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
    if (!this.data.task || !this.data.task._id) {
      wx.showToast({ title: '请先整理图片', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      await api.confirmAiParseResult({
        taskId: this.data.task._id,
        output: fieldsToObject(this.data.fields),
        relatedType: this.data.attachment.relatedType || this.data.source || '',
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存确认结果' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },
})

function buildFields(imageKind, output) {
  return (fieldSets[imageKind] || fieldSets.medicine_box).map((field) => ({
    ...field,
    value: output[field.key] || '',
  }))
}

function fieldsToObject(fields) {
  return (fields || []).reduce((data, field) => {
    data[field.key] = field.value || ''
    return data
  }, {})
}
