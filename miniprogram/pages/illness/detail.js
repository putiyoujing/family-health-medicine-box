const api = require('../../services/api')
const { formatDateTime, memberName, nowDateTimeInput } = require('../../utils/format')
const { ensureLoginReady, ensureMedicationReady } = require('../../utils/operation-guards')
const { getImageUploadErrorMessage, getMediaSourceType, isImageSelectionCanceled } = require('../../utils/image-upload')

const eventTypes = [
  { label: '记录症状', value: 'symptom' },
  { label: '就诊记录', value: 'visit' },
]

const eventTypeLabels = {
  symptom: '症状变化',
  temperature: '体温记录',
  medication: '用药记录',
  note: '备注',
  visit: '就诊',
  exam: '检查',
}

const MAX_VISIT_ATTACHMENTS = 5
const VISIT_DRAFT_PREFIX = 'illness-visit-draft:'

const emptyEventForm = {
  eventType: 'symptom',
  recordedAt: '',
  recordedDate: '',
  recordedTime: '',
  temperature: '',
  symptomsText: '',
  note: '',
  hospitalName: '',
  doctorDiagnosis: '',
  examinationResult: '',
  doctorAdvice: '',
  prescribedMedicineIds: [],
}

Page({
  data: {
    id: '',
    loading: true,
    family: null,
    record: null,
    member: null,
    members: [],
    medicines: [],
    prescribedMedicines: [],
    timeline: [],
    medicationLogs: [],
    attachments: [],
    healthTodos: [],
    completing: false,
    showCompletionForm: false,
    completionReviewNote: '',
    savingEvent: false,
    showEventForm: false,
    pendingAttachments: [],
    eventTypes,
    eventForm: createEventForm(),
  },

  onLoad(options) {
    this.setData({
      id: options.id || '',
      showEventForm: options.action === 'add',
    })
  },

  onShow() {
    this.load()
  },

  async load() {
    if (!this.data.id) {
      wx.showToast({ title: '缺少病程 ID', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      const loggedIn = await ensureLoginReady({ silent: true })
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
      const record = home.illnessRecords.find((item) => item._id === this.data.id)
      if (!record) {
        throw new Error('未找到这次病程')
      }
      const member = home.members.find((item) => item._id === record.memberId) || {}
      const visitDraft = readVisitDraft(record._id)
      const eventForm = visitDraft
        ? {
            ...emptyEventForm,
            ...visitDraft.eventForm,
            prescribedMedicineIds: uniqueIds(visitDraft.eventForm && visitDraft.eventForm.prescribedMedicineIds),
          }
        : this.data.eventForm
      const prescribedMedicines = visitDraft && Array.isArray(visitDraft.prescribedMedicines)
        ? visitDraft.prescribedMedicines
        : this.data.prescribedMedicines
      const courseEvents = (home.courseEvents || [])
        .filter((item) => item.illnessRecordId === record._id)
        .map((item) => ({
          ...item,
          timeText: formatDateTime(item.recordedAt || item.createdAt),
          typeLabel: item.source === 'illness_completed' ? '恢复复盘' : eventTypeLabel(item.eventType),
          displayText: buildEventText(item),
        }))
      const medicationLogs = home.medicationLogs
        .filter((item) => item.illnessRecordId === record._id)
        .map((item) => ({
          ...item,
          timeText: formatDateTime(item.takenAt),
          displayText: `${item.medicineNameSnapshot || '未命名药品'} ${item.doseQuantity || 0}${item.doseUnit || ''}`,
        }))
      const timeline = mergeTimeline(courseEvents, medicationLogs)
      this.setData({
        loading: false,
        record: {
          ...record,
          completed: isCompleted(record),
          statusText: isCompleted(record) ? '已关闭' : record.status,
          memberName: memberName(home.members, record.memberId),
          timeText: formatDateTime(record.startedAt),
          symptomText: (record.symptoms || []).join('、') || '未填症状',
          temperatureText: hasValue(record.temperatureMax) ? `${record.temperatureMax}℃` : '未记录',
        },
        family: home.family,
        member,
        members: home.members || [],
        medicines: home.medicines || [],
        prescribedMedicines,
        timeline,
        medicationLogs,
        attachments: home.attachments.filter((item) => item.relatedType === 'illness' && item.relatedId === record._id),
        healthTodos: buildIllnessTodos(home, record._id),
        showEventForm: visitDraft ? true : this.data.showEventForm,
        pendingAttachments: visitDraft && Array.isArray(visitDraft.pendingAttachments)
          ? visitDraft.pendingAttachments
          : this.data.pendingAttachments,
        eventForm: createEventForm(eventForm),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  toggleEventForm() {
    const showEventForm = !this.data.showEventForm
    if (!showEventForm) {
      clearVisitDraft(this.data.id)
    }
    this.setData({ showEventForm })
  },

  selectEventType(event) {
    const eventType = event.currentTarget.dataset.type
    if (!eventTypes.some((item) => item.value === eventType)) {
      return
    }
    this.setData({ 'eventForm.eventType': eventType })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`eventForm.${field}`]: event.detail.value })
  },

  onRecordedDateChange(event) {
    const recordedDate = event.detail.value
    this.setData({
      'eventForm.recordedDate': recordedDate,
      'eventForm.recordedAt': joinDateTime(recordedDate, this.data.eventForm.recordedTime),
    })
  },

  onRecordedTimeChange(event) {
    const recordedTime = event.detail.value
    this.setData({
      'eventForm.recordedTime': recordedTime,
      'eventForm.recordedAt': joinDateTime(this.data.eventForm.recordedDate, recordedTime),
    })
  },

  goAddPrescriptionMedicine() {
    const record = this.data.record
    if (!record) {
      return
    }
    const key = visitDraftKey(record._id)
    const cached = writeVisitDraft(key, {
      eventForm: {
        ...this.data.eventForm,
        prescribedMedicineIds: uniqueIds(this.data.eventForm.prescribedMedicineIds),
      },
      pendingAttachments: this.data.pendingAttachments || [],
      prescribedMedicines: this.data.prescribedMedicines || [],
    })
    if (!cached) {
      return
    }
    wx.navigateTo({
      url: `/pages/medicines/form?memberId=${record.memberId}&visitDraftKey=${encodeURIComponent(key)}`,
    })
  },

  async saveEvent() {
    if (this.data.savingEvent) {
      return
    }
    const record = this.data.record
    const form = this.data.eventForm
    const symptoms = String(form.symptomsText || '')
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const prescribedMedicineIds = form.eventType === 'visit'
      ? uniqueIds(form.prescribedMedicineIds)
      : []
    const visitDetails = [
      form.hospitalName,
      form.doctorDiagnosis,
      form.examinationResult,
      form.doctorAdvice,
    ].some((value) => String(value || '').trim())
    const hasContent = form.eventType === 'visit'
      ? visitDetails || prescribedMedicineIds.length || this.data.pendingAttachments.length
      : form.temperature || symptoms.length || String(form.note || '').trim()
    if (!form.recordedAt || !hasContent) {
      wx.showToast({ title: '请填写时间和至少一项内容', icon: 'none' })
      return
    }
    this.setData({ savingEvent: true })
    wx.showLoading({ title: '保存中' })
    try {
      await api.saveCourseEvent({
        illnessRecordId: record._id,
        memberId: record.memberId,
        eventType: form.eventType,
        recordedAt: form.recordedAt,
        temperature: form.temperature ? Number(form.temperature) : null,
        symptoms,
        note: String(form.note || '').trim(),
        hospitalName: String(form.hospitalName || '').trim(),
        doctorDiagnosis: String(form.doctorDiagnosis || '').trim(),
        examinationResult: String(form.examinationResult || '').trim(),
        doctorAdvice: String(form.doctorAdvice || '').trim(),
        prescribedMedicineIds,
      })
      for (const attachment of this.data.pendingAttachments) {
        await api.saveAttachment({
          relatedType: 'illness',
          relatedId: record._id,
          fileType: 'image',
          fileId: attachment.fileID,
          ocrText: '',
          aiSummary: '就诊检查或处方附件',
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '已追加' })
      clearVisitDraft(record._id)
      this.setData({
        savingEvent: false,
        showEventForm: false,
        pendingAttachments: [],
        prescribedMedicines: [],
        eventForm: createEventForm(),
      })
      await this.load()
    } catch (error) {
      wx.hideLoading()
      this.setData({ savingEvent: false })
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async chooseAttachment() {
    const pendingAttachments = this.data.pendingAttachments || []
    const remaining = MAX_VISIT_ATTACHMENTS - pendingAttachments.length
    if (remaining <= 0) {
      wx.showToast({ title: `每次就诊最多 ${MAX_VISIT_ATTACHMENTS} 张`, icon: 'none' })
      return
    }
    const confirmed = await confirm(
      '图片可能包含敏感健康或身份信息。请先遮挡无关姓名、证件号等内容，确认后再选择并上传。',
      '上传健康图片？',
    )
    if (!confirmed) {
      return
    }
    const uploaded = []
    try {
      const sourceResult = await wx.showActionSheet({
        itemList: ['拍照', '从相册选择'],
      })
      const chooseResult = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: getMediaSourceType(sourceResult.tapIndex, 1),
      })
      wx.showLoading({ title: '上传中' })
      for (const file of chooseResult.tempFiles) {
        const filePath = file.tempFilePath
        const uploadResult = await uploadImageOrDemo(
          `illness/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
          filePath,
        )
        uploaded.push({
          ...uploadResult,
          tempFilePath: uploadResult.tempFilePath || filePath,
        })
      }
      wx.hideLoading()
      this.setData({ pendingAttachments: [...pendingAttachments, ...uploaded] })
      wx.showToast({ title: `已暂存 ${uploaded.length} 张` })
    } catch (error) {
      wx.hideLoading()
      if (isImageSelectionCanceled(error)) {
        return
      }
      if (uploaded.length) {
        this.setData({ pendingAttachments: [...pendingAttachments, ...uploaded] })
      }
      console.error('illness attachment upload failed', error)
      wx.showModal({
        title: '单据图片上传失败',
        content: getImageUploadErrorMessage(error, '单据图片'),
        showCancel: false,
      })
    }
  },

  removeAttachment(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) {
      return
    }
    this.setData({
      pendingAttachments: this.data.pendingAttachments.filter((item, itemIndex) => itemIndex !== index),
    })
  },

  goMedication() {
    if (!ensureMedicationReady({
      currentFamilyId: this.data.family && this.data.family._id,
      family: this.data.family,
      members: this.data.members || [],
      medicines: this.data.medicines || [],
    })) {
      return
    }
    wx.navigateTo({
      url: `/pages/medication/form?memberId=${this.data.record.memberId}&illnessRecordId=${this.data.record._id}`,
    })
  },

  goReport() {
    wx.navigateTo({ url: `/pages/report/export?illnessRecordId=${this.data.record._id}` })
  },

  goHealthTodo() {
    const record = this.data.record
    wx.navigateTo({
      url: `/pages/reminders/index?memberId=${record.memberId}&illnessRecordId=${record._id}`,
    })
  },

  closeCourse() {
    if (this.data.completing || !this.data.record || isCompleted(this.data.record)) {
      return
    }
    this.setData({ showCompletionForm: true })
  },

  cancelCloseCourse() {
    if (this.data.completing) {
      return
    }
    this.setData({ showCompletionForm: false, completionReviewNote: '' })
  },

  onCompletionReviewInput(event) {
    this.setData({ completionReviewNote: event.detail.value })
  },

  async submitCloseCourse() {
    if (this.data.completing || !this.data.record || isCompleted(this.data.record)) {
      return
    }
    const reviewNote = String(this.data.completionReviewNote || '').trim()
    if (reviewNote.length > 1000) {
      wx.showToast({ title: '恢复总结不能超过 1000 字', icon: 'none' })
      return
    }
    const endedAt = nowDateTimeInput()
    this.setData({ completing: true })
    wx.showLoading({ title: '正在完成' })
    try {
      await api.completeIllness({
        id: this.data.record._id,
        endedAt,
        reviewNote,
      })
      wx.hideLoading()
      this.setData({
        completing: false,
        showCompletionForm: false,
        completionReviewNote: '',
        record: {
          ...this.data.record,
          completed: true,
          status: '已关闭',
          statusText: '已关闭',
          endedAt,
        },
      })
      wx.showToast({ title: '病程已关闭' })
      await this.load()
    } catch (error) {
      wx.hideLoading()
      this.setData({ completing: false })
      wx.showToast({ title: error.message || '完成失败', icon: 'none' })
    }
  },

  async remove() {
    const confirmed = await confirm('删除后将无法查看这次病程及其跟踪记录，且无法恢复。确认删除吗？', '删除病程')
    if (!confirmed) {
      return
    }
    wx.showLoading({ title: '删除中' })
    try {
      await api.deleteIllness(this.data.record._id)
      wx.hideLoading()
      wx.showToast({ title: '已删除' })
      wx.navigateBack()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },

  editHealthTodo(event) {
    const id = event.currentTarget.dataset.id
    const record = this.data.record
    if (!id || !record) {
      return
    }
    wx.navigateTo({
      url: `/pages/reminders/index?memberId=${record.memberId}&illnessRecordId=${record._id}&reminderId=${id}`,
    })
  },

  async completeHealthTodo(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirm('完成后会取消尚未发送的提醒。确认已完成这项待办吗？', '完成待办')
    if (!id || !confirmed) {
      return
    }
    wx.showLoading({ title: '处理中' })
    try {
      await api.completeReminder(id)
      wx.showToast({ title: '待办已完成' })
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async deleteHealthTodo(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirm('删除后将不再显示，也不会发送尚未触发的提醒。确认删除吗？', '删除待办')
    if (!id || !confirmed) {
      return
    }
    wx.showLoading({ title: '删除中' })
    try {
      await api.deleteReminder(id)
      wx.showToast({ title: '待办已删除' })
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})

function mergeTimeline(events, medicationLogs) {
  const medicationEventKeys = new Set(
    events
      .filter((item) => item.eventType === 'medication')
      .map((item) => `${item.recordedAt || ''}-${item.medicineNameSnapshot || ''}-${item.doseQuantity || ''}`),
  )
  const medicationItems = medicationLogs
    .filter((item) => !medicationEventKeys.has(`${item.takenAt || ''}-${item.medicineNameSnapshot || ''}-${item.doseQuantity || ''}`))
    .map((item) => ({
      _id: `log-${item._id}`,
      timeText: item.timeText,
      sortTime: item.takenAt || item.createdAt || '',
      typeLabel: '用药记录',
      displayText: `${item.displayText}｜${item.reaction || '暂无反应记录'}`,
    }))
  return [...events.map((item) => ({ ...item, sortTime: item.recordedAt || item.createdAt || '' })), ...medicationItems].sort(
    (a, b) => String(b.sortTime || '').localeCompare(String(a.sortTime || '')),
  )
}

function buildEventText(item) {
  const parts = []
  if (item.temperature) {
    parts.push(`${item.temperature}℃`)
  }
  if (item.symptoms && item.symptoms.length) {
    parts.push(item.symptoms.join('、'))
  }
  if (item.medicineNameSnapshot) {
    parts.push(`${item.medicineNameSnapshot} ${item.doseQuantity || 0}${item.doseUnit || ''}`)
  }
  if (item.prescribedMedicines && item.prescribedMedicines.length) {
    parts.push(`开药：${item.prescribedMedicines.map((medicine) => medicine.medicineNameSnapshot).join('、')}`)
  }
  if (item.hospitalName) {
    parts.push(`医院：${item.hospitalName}`)
  }
  if (item.doctorDiagnosis) {
    parts.push(`诊断：${item.doctorDiagnosis}`)
  }
  if (item.examinationResult) {
    parts.push(`检查：${item.examinationResult}`)
  }
  if (item.doctorAdvice) {
    parts.push(`医嘱：${item.doctorAdvice}`)
  }
  if (item.note) {
    parts.push(item.note)
  }
  return parts.join('｜') || '已记录'
}

function eventTypeLabel(type) {
  return eventTypeLabels[type] || '记录'
}

function createEventForm(value = {}) {
  const recordedAt = value.recordedAt || nowDateTimeInput()
  const [recordedDate, recordedTime] = splitDateTime(recordedAt)
  return {
    ...emptyEventForm,
    ...value,
    recordedAt: joinDateTime(value.recordedDate || recordedDate, value.recordedTime || recordedTime),
    recordedDate: value.recordedDate || recordedDate,
    recordedTime: value.recordedTime || recordedTime,
  }
}

function splitDateTime(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/)
  return match ? [match[1], match[2]] : nowDateTimeInput().split(' ')
}

function joinDateTime(date, time) {
  return `${date || nowDateTimeInput().slice(0, 10)} ${time || nowDateTimeInput().slice(11)}`
}

function buildIllnessTodos(home, illnessRecordId) {
  const typeLabels = {
    medication: '用药事项',
    follow_up: '复诊事项',
    stock_check: '药箱检查事项',
    other: '其他',
  }
  return (home.reminders || [])
    .filter((item) => item.illnessRecordId === illnessRecordId)
    .map((item) => ({
      ...item,
      completed: item.status === 'completed',
      statusText: item.status === 'completed' ? '已完成' : '待完成',
      typeLabel: typeLabels[item.type] || '健康待办',
      remindAtText: formatDateTime(item.remindAt),
    }))
    .sort((a, b) => {
      const statusOrder = Number(a.completed) - Number(b.completed)
      return statusOrder || reminderTime(a) - reminderTime(b)
    })
}

function reminderTime(item) {
  const timestamp = Number(item.remindAtMs)
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp
  }
  const parsed = new Date(String(item.remindAt || '').replace(' ', 'T')).getTime()
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function isCompleted(record) {
  return !!(record && (record.status === '已恢复' || record.status === '已关闭' || record.endedAt))
}

function visitDraftKey(illnessRecordId) {
  return `${VISIT_DRAFT_PREFIX}${illnessRecordId}`
}

function readVisitDraft(illnessRecordId) {
  try {
    return wx.getStorageSync(visitDraftKey(illnessRecordId)) || null
  } catch (error) {
    return null
  }
}

function writeVisitDraft(key, draft) {
  try {
    wx.setStorageSync(key, draft)
    return true
  } catch (error) {
    wx.showToast({ title: '暂存就诊内容失败', icon: 'none' })
    return false
  }
}

function clearVisitDraft(illnessRecordId) {
  try {
    wx.removeStorageSync(visitDraftKey(illnessRecordId))
  } catch (error) {
    // 忽略本地草稿清理失败，避免影响已保存的病程记录。
  }
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)))
}

async function uploadImageOrDemo(cloudPath, filePath) {
  const app = getApp()
  if (app.globalData && app.globalData.useDemoData) {
    return {
      fileID: filePath,
      tempFilePath: filePath,
      demoLocal: true,
    }
  }
  return wx.cloud.uploadFile({ cloudPath, filePath })
}

function confirm(content, title = '确认操作') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}
