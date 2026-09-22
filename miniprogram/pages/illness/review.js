const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { buildFields, fieldsToObject, kindOptions } = require('../../utils/ai-image-fields')
const {
  EVENT_IDS,
  countBucket,
  latencyBucket,
  track,
  trackServiceError,
} = require('../../utils/analytics')

Page({
  onShareAppMessage() {
    return require('../../utils/share').getDefaultShareConfig()
  },

  data: {
    illnessId: '',
    featureEnabled: false,
    items: [],
    confirmedCount: 0,
    hasPending: false,
    currentIndex: 0,
    currentItem: null,
    kindOptions,
    kindIndex: 3,
    kindLabel: kindOptions[3].label,
    fields: [],
    task: null,
    parsing: false,
    parseError: '',
    confirming: false,
    inputText: '',
    textParseTask: null,
    textParseOutput: null,
    textFields: [],
    textParsing: false,
    textParseError: '',
    textConfirming: false,
    textConfirmed: false,
    textSkipped: false,
  },

  async onLoad() {
    const app = getApp()
    const pending = app.globalData && app.globalData.pendingIllnessReview
    const items = normalizeReviewItems(pending && pending.attachments)
    this.setData({
      illnessId: pending && pending.illnessId || '',
      featureEnabled: !!(app.globalData && app.globalData.imageParsingEnabled),
      inputText: pending && pending.inputText || '',
      items,
    })
    this.selectItem(0)
    await this.autoStartReview()
  },

  async autoStartReview() {
    if (this.autoReviewStarted || !this.data.featureEnabled) {
      return
    }
    this.autoReviewStarted = true
    if (this.data.inputText) {
      await this.startTextParse()
    }
    for (let index = 0; index < this.data.items.length; index += 1) {
      if (this.data.items[index].task) {
        continue
      }
      this.selectItem(index)
      await this.startParse()
    }
    if (this.data.items.length) {
      this.selectItem(0)
    }
  },

  onShow() {
    if (this.data.items.length) {
      this.applyMedicineConfirmations()
    }
  },

  selectItem(index) {
    const currentIndex = Number(index)
    const item = this.data.items[currentIndex]
    if (!item) {
      this.setData({ currentItem: null, fields: [], task: null })
      return
    }
    const kindIndex = Math.max(0, this.data.kindOptions.findIndex((option) => option.value === item.imageKind))
    this.setData({
      currentIndex,
      currentItem: item,
      confirmedCount: countConfirmed(this.data.items),
      hasPending: this.data.items.some((reviewItem) => !reviewItem.confirmed),
      kindIndex,
      kindLabel: this.data.kindOptions[kindIndex].label,
      fields: item.fields || buildFields(item.imageKind, item.output),
      task: item.task || null,
      parseError: item.parseError || '',
      parsing: false,
      confirming: false,
    })
  },

  onKindChange(event) {
    const kindIndex = Number(event.detail.value)
    const option = this.data.kindOptions[kindIndex]
    if (!option || !this.data.currentItem) {
      return
    }
    const items = updateItem(this.data.items, this.data.currentIndex, {
      imageKind: option.value,
      fields: buildFields(option.value, {}),
      output: null,
      task: null,
      parseError: '',
      confirmed: false,
      medicineCandidates: [],
    })
    this.setData({
      items,
      kindIndex,
      kindLabel: option.label,
      fields: buildFields(option.value, {}),
      task: null,
      currentItem: items[this.data.currentIndex],
    })
  },

  onFieldInput(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    const fields = this.data.fields.map((field) => (field.key === key ? { ...field, value } : field))
    const items = key === 'medicinesText' && this.data.currentItem.imageKind === 'prescription'
      ? updateItem(this.data.items, this.data.currentIndex, {
          medicineCandidates: buildMedicineCandidates(value),
        })
      : this.data.items
    this.setData({
      fields,
      items,
      currentItem: items[this.data.currentIndex],
    })
  },

  async startTextParse() {
    if (!this.data.featureEnabled || this.data.textParsing) {
      return
    }
    const text = String(this.data.inputText || '').trim()
    if (!text) {
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    this.setData({ textParsing: true, textParseError: '', textConfirmed: false, textSkipped: false })
    wx.showLoading({ title: '整理文字中' })
    const startedAt = Date.now()
    track(EVENT_IDS.RECORD_AI_START, { input_type: 'text' })
    try {
      const result = await api.parseIllnessText({ illnessId: this.data.illnessId, text })
      const output = result.output || {}
      track(EVENT_IDS.RECORD_AI_RESULT, {
        input_type: 'text',
        status: 'success',
        latency_bucket: latencyBucket(Date.now() - startedAt),
      })
      track(EVENT_IDS.RECORD_RESULT_VIEW, { input_type: 'text', status: 'success' })
      wx.hideLoading()
      this.setData({
        textParsing: false,
        textParseTask: result.task || null,
        textParseOutput: output,
        textFields: buildTextFields(output),
        textConfirmed: false,
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ textParsing: false, textParseError: error.message || '文字整理失败' })
      track(EVENT_IDS.RECORD_AI_RESULT, {
        input_type: 'text',
        status: 'fail',
        latency_bucket: latencyBucket(Date.now() - startedAt),
      })
      trackServiceError('illness_review_text_parse')
      wx.showToast({ title: error.message || '文字整理失败', icon: 'none' })
    }
  },

  onTextFieldInput(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    this.setData({
      textFields: this.data.textFields.map((field) => (
        field.key === key ? { ...field, value } : field
      )),
      textConfirmed: false,
    })
  },

  async confirmTextResult() {
    if (!this.data.textParseTask || this.data.textConfirming) {
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    this.setData({ textConfirming: true })
    wx.showLoading({ title: '保存文字修改' })
    try {
      const output = textFieldsToObject(this.data.textFields)
      const confirmed = await api.confirmAiParseResult({
        taskId: this.data.textParseTask._id,
        illnessId: this.data.illnessId,
        output,
      })
      const confirmedOutput = confirmed.output || output
      track(EVENT_IDS.RECORD_CONFIRM, { entry: 'text_ai_review', status: 'success' })
      wx.hideLoading()
      this.setData({
        textConfirming: false,
        textParseOutput: confirmedOutput,
        textFields: buildTextFields(confirmedOutput),
        textConfirmed: true,
      })
      wx.showToast({ title: '已保存文字修改' })
    } catch (error) {
      wx.hideLoading()
      this.setData({ textConfirming: false })
      trackServiceError('illness_review_text_confirm')
      wx.showToast({ title: error.message || '保存文字修改失败', icon: 'none' })
    }
  },

  skipText() {
    this.setData({ textSkipped: true })
  },

  async startParse() {
    if (!this.data.featureEnabled) {
      wx.showModal({
        title: '图片整理暂未开放',
        content: '当前版本未连接真实图片识别服务，请先保留原图并手动填写病程。',
        showCancel: false,
      })
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    const item = this.data.currentItem
    if (!item || !item.fileId || !item._id) {
      wx.showToast({ title: '图片附件信息不完整', icon: 'none' })
      return
    }
    this.setData({ parsing: true, parseError: '' })
    wx.showLoading({ title: '整理中' })
    const startedAt = Date.now()
    track(EVENT_IDS.RECORD_AI_START, {
      input_type: 'image',
      image_type: item.imageKind,
    })
    try {
      const result = await api.parseAttachment({
        fileId: item.fileId,
        attachmentIds: [item._id],
        imageKind: item.imageKind,
        relatedType: 'illness',
      })
      const fields = buildFields(item.imageKind, result.output || {})
      const medicineCandidates = item.imageKind === 'prescription'
        ? buildMedicineCandidates(result.output && result.output.medicinesText)
        : []
      track(EVENT_IDS.RECORD_AI_RESULT, {
        input_type: 'image',
        image_type: item.imageKind,
        status: 'success',
        latency_bucket: latencyBucket(Date.now() - startedAt),
      })
      track(EVENT_IDS.RECORD_RESULT_VIEW, {
        image_type: item.imageKind,
        status: 'success',
      })
      if (medicineCandidates.length) {
        track(EVENT_IDS.MEDICINE_SUGGEST_VIEW, {
          count_bucket: countBucket(medicineCandidates.length),
          status: 'success',
        })
      }
      const items = updateItem(this.data.items, this.data.currentIndex, {
        fields,
        output: result.output || {},
        task: result.task,
        confirmed: false,
        medicineCandidates,
        parseError: '',
        statusText: '已生成待确认字段',
      })
      wx.hideLoading()
      this.setData({
        items,
        currentItem: items[this.data.currentIndex],
        fields,
        task: { ...result.task, statusText: 'AI 结果待确认' },
        parsing: false,
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ parsing: false, parseError: error.message || '图片整理失败' })
      this.setData({
        items: updateItem(this.data.items, this.data.currentIndex, {
          parseError: error.message || '图片整理失败',
          statusText: '整理失败，可重试',
        }),
      })
      track(EVENT_IDS.RECORD_AI_RESULT, {
        input_type: 'image',
        image_type: item.imageKind,
        status: 'fail',
        latency_bucket: latencyBucket(Date.now() - startedAt),
      })
      trackServiceError('illness_review_parse')
      wx.showToast({ title: error.message || '整理失败', icon: 'none' })
    }
  },

  async confirmResult() {
    if (!this.data.task || !this.data.currentItem || this.data.confirming) {
      wx.showToast({ title: '请先整理图片', icon: 'none' })
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    if (this.data.task.status && !['success', 'confirmed'].includes(this.data.task.status)) {
      wx.showToast({ title: '图片整理尚未成功，请重新整理', icon: 'none' })
      return
    }
    this.setData({ confirming: true })
    wx.showLoading({ title: '保存修改' })
    try {
      const output = fieldsToObject(this.data.fields)
      await api.confirmAiParseResult({
        taskId: this.data.task._id,
        attachmentIds: [this.data.currentItem._id],
        illnessId: this.data.illnessId,
        imageKind: this.data.currentItem.imageKind,
        output,
      })
      track(EVENT_IDS.RECORD_CONFIRM, { entry: 'ai_review', status: 'success' })
      const items = updateItem(this.data.items, this.data.currentIndex, {
        output,
        fields: this.data.fields,
        confirmed: true,
        statusText: '已保存，可修改',
      })
      const nextIndex = items.findIndex((item) => !item.confirmed)
      wx.hideLoading()
      this.setData({
        items,
        confirmedCount: countConfirmed(items),
        hasPending: items.some((item) => !item.confirmed),
        confirming: false,
      })
      if (nextIndex >= 0) {
        this.selectItem(nextIndex)
        wx.showToast({ title: '已保存，继续下一张' })
      } else {
        this.selectItem(this.data.currentIndex)
        wx.showToast({ title: '图片结果已保存' })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ confirming: false })
      trackServiceError('illness_review_confirm')
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  addMedicineToCabinet(event) {
    const candidateIndex = Number(event.currentTarget.dataset.index)
    const candidate = this.data.currentItem
      && (this.data.currentItem.medicineCandidates || [])[candidateIndex]
    if (!candidate) {
      return
    }
    const app = getApp()
    const pending = app.globalData && app.globalData.pendingIllnessReview
    if (!pending || !pending.illnessId) {
      wx.showToast({ title: '病程草稿已失效，请重新打开整理', icon: 'none' })
      return
    }
    const token = `${this.data.currentItem._id}:${candidate.id}`
    pending.medicineConfirmations = pending.medicineConfirmations || {}
    app.globalData.pendingMedicinePrefill = {
      token,
      memberId: pending.memberId || '',
      name: candidate.name || candidate.text,
      specification: candidate.specification || '',
      note: `来自本次处方：${candidate.text}`,
    }
    wx.navigateTo({
      url: `/pages/medicines/form?memberId=${encodeURIComponent(pending.memberId || '')}&fromAiReview=1`,
    })
  },

  skipMedicine(event) {
    const candidateIndex = Number(event.currentTarget.dataset.index)
    const items = updateMedicineCandidate(this.data.items, this.data.currentIndex, candidateIndex, {
      action: 'skipped',
      actionText: '暂不加入药箱',
    })
    this.setData({ items })
    track(EVENT_IDS.MEDICINE_SKIP, { status: 'success' })
    this.selectItem(this.data.currentIndex)
  },

  applyMedicineConfirmations() {
    const app = getApp()
    const pending = app.globalData && app.globalData.pendingIllnessReview
    const confirmations = pending && pending.medicineConfirmations
    if (!confirmations) {
      return
    }
    const items = this.data.items.map((item) => ({
      ...item,
      medicineCandidates: (item.medicineCandidates || []).map((candidate) => {
        const confirmed = confirmations[`${item._id}:${candidate.id}`]
        return confirmed
          ? { ...candidate, action: 'added', actionText: '已加入药箱', medicineId: confirmed.medicineId }
          : candidate
      }),
    }))
    this.setData({ items })
    this.selectItem(this.data.currentIndex)
  },

  skipCurrent() {
    const nextIndex = this.data.items.findIndex((item, index) => index > this.data.currentIndex && !item.confirmed)
    if (nextIndex >= 0) {
      this.selectItem(nextIndex)
      return
    }
    const firstPending = this.data.items.findIndex((item) => !item.confirmed)
    if (firstPending >= 0 && firstPending !== this.data.currentIndex) {
      this.selectItem(firstPending)
      return
    }
    this.deferReview()
  },

  previewCurrent() {
    const item = this.data.currentItem
    const url = item && (item.fileId || item.tempFilePath)
    if (!url) {
      return
    }
    wx.previewImage({ urls: [url], current: url })
  },

  deferReview(clearPending = false) {
    const app = getApp()
    const pending = app.globalData && app.globalData.pendingIllnessReview
    const returnUrl = pending && pending.returnUrl
    if (app.globalData) {
      if (clearPending) {
        app.globalData.pendingIllnessReview = null
      }
    }
    if (returnUrl) {
      wx.redirectTo({ url: returnUrl })
    } else {
      wx.navigateBack()
    }
  },

  finishReview() {
    const pendingImages = this.data.items.some((item) => !item.confirmed)
    if (pendingImages) {
      this.deferReview(false)
      return
    }
    this.deferReview(true)
  },
})

function normalizeReviewItems(attachments) {
  return (Array.isArray(attachments) ? attachments : []).map((attachment, index) => ({
    _id: attachment._id || attachment.id || '',
    fileId: attachment.fileId || attachment.fileID || '',
    tempFilePath: attachment.tempFilePath || '',
    imageKind: attachment.imageKind || 'prescription',
    output: null,
    fields: buildFields(attachment.imageKind || 'prescription', {}),
    task: null,
    medicineCandidates: [],
    confirmed: false,
    statusText: '待整理',
    title: `第 ${index + 1} 张图片`,
  }))
}

function updateItem(items, index, patch) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
}

function countConfirmed(items) {
  return items.filter((item) => item.confirmed).length
}

function buildTextFields(output = {}) {
  return [
    { key: 'symptoms', label: '症状', placeholder: '仅保留原文明确提到的症状', value: Array.isArray(output.symptoms) ? output.symptoms.join('、') : '' },
    { key: 'temperatureMax', label: '最高体温', placeholder: '例如 38.6', value: output.temperatureMax === '' ? '' : String(output.temperatureMax || '') },
    { key: 'hospitalName', label: '就诊地点', placeholder: '可选', value: output.hospitalName || '' },
    { key: 'doctorDiagnosis', label: '医生记录', placeholder: '可选', value: output.doctorDiagnosis || '' },
    { key: 'doctorAdvice', label: '医嘱', placeholder: '可选', value: output.doctorAdvice || '' },
    { key: 'examinationResult', label: '检查结果', placeholder: '可选', value: output.examinationResult || '' },
    { key: 'medicinesText', label: '药品与用法', placeholder: '可选，仅记录原文明确内容', value: output.medicinesText || '' },
    { key: 'summary', label: '病程摘要', placeholder: '可选', value: output.summary || '' },
  ]
}

function textFieldsToObject(fields = []) {
  const output = fields.reduce((data, field) => {
    data[field.key] = String(field.value || '').trim()
    return data
  }, {})
  output.symptoms = output.symptoms ? output.symptoms.split(/[、,，\s]+/).filter(Boolean) : []
  const temperature = output.temperatureMax ? Number(output.temperatureMax) : NaN
  output.temperatureMax = Number.isFinite(temperature) ? temperature : ''
  return output
}

function buildMedicineCandidates(value) {
  return String(value || '')
    .split(/\n+|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text, index) => {
      const normalized = text.replace(/^\s*\d+[.、)）]\s*/, '')
      const nameMatch = normalized.match(/^([^（(\s]+)/)
      const name = nameMatch ? nameMatch[1] : normalized
      const specification = normalized.slice(name.length).replace(/^[：:，,\s]+/, '').trim()
      return {
        id: String(index),
        text: normalized,
        name,
        specification,
        action: 'pending',
        actionText: '待确认',
      }
    })
}

function updateMedicineCandidate(items, itemIndex, candidateIndex, patch) {
  return items.map((item, index) => {
    if (index !== itemIndex) {
      return item
    }
    return {
      ...item,
      medicineCandidates: (item.medicineCandidates || []).map((candidate, indexInItem) => (
        indexInItem === candidateIndex ? { ...candidate, ...patch } : candidate
      )),
    }
  })
}

module.exports = {
  normalizeReviewItems,
}
