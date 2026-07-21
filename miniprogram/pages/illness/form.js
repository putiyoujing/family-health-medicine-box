const api = require('../../services/api')
const { nowDateTimeInput, todayDate } = require('../../utils/format')
const { ensureHasMembers, ensureLoginReady } = require('../../utils/operation-guards')

const emptyForm = {
  _id: '',
  memberId: '',
  endedAt: '',
  symptomsText: '',
  symptomDescription: '',
  temperatureMax: '',
  hospitalName: '',
  doctorDiagnosis: '',
  doctorAdvice: '',
  examinationResult: '',
  prescribedMedicineIds: [],
  status: '观察中',
  summary: '',
}

const symptomTags = ['发烧', '咳嗽', '流涕', '鼻塞', '呕吐', '腹泻', '皮疹', '头痛']
const statusOptions = ['观察中', '已就医']
const MAX_VISIT_ATTACHMENTS = 5
const VISIT_DRAFT_PREFIX = 'illness-form-visit-draft:'

Page({
  data: {
    loading: true,
    saving: false,
    family: null,
    members: [],
    records: [],
    memberIndex: 0,
    selectedMemberText: '请选择成员',
    selectedMemberInitial: '家',
    memberSelectionHint: '',
    statusOptions,
    showVisitFields: false,
    isCompletedRecord: false,
    symptomTagOptions: buildTagOptions(symptomTags, ''),
    recentSymptomOptions: [],
    recordDate: '',
    recordTime: '',
    today: todayDate(),
    pendingAttachments: [],
    prescribedMedicines: [],
    form: { ...emptyForm },
  },

  onLoad(options = {}) {
    this.recordId = options.id || ''
    this.similarId = options.similarId || ''
    this.visitDraftKey = String(options.visitDraftKey || `${VISIT_DRAFT_PREFIX}${this.recordId || Date.now()}`)
    wx.setNavigationBarTitle({ title: this.recordId ? '编辑病程' : '记录病程' })
    this.load()
  },

  onShow() {
    if (!this.refreshVisitDraftOnShow) {
      return
    }
    this.refreshVisitDraftOnShow = false
    return this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
      if (!ensureHasMembers(home)) {
        this.setData({ loading: false })
        return
      }

      const record = this.recordId
        ? home.illnessRecords.find((item) => item._id === this.recordId)
        : null
      const similarRecord = this.similarId
        ? home.illnessRecords.find((item) => item._id === this.similarId)
        : null
      if (this.recordId && !record) {
        throw new Error('未找到要编辑的病程记录')
      }
      if (this.similarId && !similarRecord) {
        throw new Error('未找到参考的病程记录')
      }

      const visitDraft = readVisitDraft(this.visitDraftKey)
      const now = nowDateTimeInput()
      const sourceTime = record && record.startedAt ? record.startedAt : now
      const timeParts = visitDraft && visitDraft.recordDate && visitDraft.recordTime
        ? { date: visitDraft.recordDate, time: visitDraft.recordTime }
        : splitDateTime(sourceTime)
      const preferredMemberId = record
        ? record.memberId
        : similarRecord
          ? similarRecord.memberId
          : ''
      const memberId = resolveDefaultMemberId(
        home.members,
        home.illnessRecords,
        visitDraft && visitDraft.form && visitDraft.form.memberId || preferredMemberId,
      )
      let form = record
        ? formFromRecord(record)
        : {
            ...emptyForm,
            memberId,
            symptomsText: similarRecord ? (similarRecord.symptoms || []).join('、') : '',
          }
      if (!record && visitDraft && visitDraft.kind === 'illness_form') {
        form = {
          ...form,
          ...visitDraft.form,
          prescribedMedicineIds: uniqueIds(visitDraft.form && visitDraft.form.prescribedMedicineIds),
        }
      }
      form.memberId = memberId

      const memberIndex = Math.max(0, home.members.findIndex((item) => item._id === memberId))
      const selectedMember = home.members[memberIndex]
      const recentSymptoms = Array.from(
        new Set(home.illnessRecords.flatMap((item) => item.symptoms || []).filter(Boolean)),
      ).slice(0, 5)

      this.setData({
        loading: false,
        family: home.family,
        members: home.members,
        records: home.illnessRecords,
        memberIndex,
        selectedMemberText: formatMemberLabel(selectedMember),
        selectedMemberInitial: memberInitial(selectedMember),
        memberSelectionHint: buildMemberSelectionHint({
          record,
          similarRecord,
          visitDraft,
          selectedMember,
        }),
        showVisitFields: form.status === '已就医' || hasVisitDetails(record),
        isCompletedRecord: isCompleted(record),
        recordDate: timeParts.date,
        recordTime: timeParts.time,
        pendingAttachments: visitDraft && Array.isArray(visitDraft.pendingAttachments)
          ? visitDraft.pendingAttachments
          : this.data.pendingAttachments,
        prescribedMedicines: visitDraft && Array.isArray(visitDraft.prescribedMedicines)
          ? visitDraft.prescribedMedicines
          : this.data.prescribedMedicines,
        symptomTagOptions: buildTagOptions(symptomTags, form.symptomsText),
        recentSymptomOptions: buildTagOptions(
          recentSymptoms.filter((item) => !symptomTags.includes(item)),
          form.symptomsText,
        ),
        form,
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value)
    const selectedMember = this.data.members[memberIndex]
    if (!selectedMember) {
      return
    }
    this.setData({
      memberIndex,
      selectedMemberText: formatMemberLabel(selectedMember),
      selectedMemberInitial: memberInitial(selectedMember),
      'form.memberId': selectedMember._id,
    })
  },

  onDateChange(event) {
    this.setData({ recordDate: event.detail.value })
  },

  onTimeChange(event) {
    this.setData({ recordTime: event.detail.value })
  },

  onStatusChange(event) {
    const status = event.currentTarget.dataset.status
    if (!statusOptions.includes(status)) {
      return
    }
    this.setData({
      'form.status': status,
      showVisitFields: status === '已就医',
    })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    this.setData({ [`form.${field}`]: value })
    if (field === 'symptomsText') {
      this.refreshTagState(value)
    }
  },

  goAddPrescriptionMedicine() {
    const form = this.data.form
    if (!form.memberId) {
      wx.showToast({ title: '请先选择家庭成员', icon: 'none' })
      return
    }
    if (!writeVisitDraft(this.visitDraftKey, {
      kind: 'illness_form',
      form: {
        ...form,
        prescribedMedicineIds: uniqueIds(form.prescribedMedicineIds),
      },
      recordDate: this.data.recordDate,
      recordTime: this.data.recordTime,
      pendingAttachments: this.data.pendingAttachments || [],
      prescribedMedicines: this.data.prescribedMedicines || [],
    })) {
      return
    }
    this.refreshVisitDraftOnShow = true
    wx.navigateTo({
      url: `/pages/medicines/form?memberId=${form.memberId}&visitDraftKey=${encodeURIComponent(this.visitDraftKey)}`,
    })
  },

  toggleSymptomTag(event) {
    const tag = event.currentTarget.dataset.tag
    const values = parseSymptoms(this.data.form.symptomsText)
    const next = values.includes(tag)
      ? values.filter((item) => item !== tag)
      : [...values, tag]
    const symptomsText = next.join('、')
    this.setData({ 'form.symptomsText': symptomsText })
    this.refreshTagState(symptomsText)
  },

  refreshTagState(symptomsText) {
    this.setData({
      symptomTagOptions: buildTagOptions(
        this.data.symptomTagOptions.map((item) => item.label),
        symptomsText,
      ),
      recentSymptomOptions: buildTagOptions(
        this.data.recentSymptomOptions.map((item) => item.label),
        symptomsText,
      ),
    })
  },

  async save() {
    if (this.data.saving) {
      return
    }
    const form = this.data.form
    const symptoms = parseSymptoms(form.symptomsText)
    const temperatureText = String(form.temperatureMax || '').trim()
    const prescribedMedicineIds = form.status === '已就医'
      ? uniqueIds(form.prescribedMedicineIds)
      : []
    if (!form.memberId) {
      wx.showToast({ title: '请选择家庭成员', icon: 'none' })
      return
    }
    if (!this.data.recordDate) {
      wx.showToast({ title: '请选择记录日期', icon: 'none' })
      return
    }
    if (!this.data.recordTime) {
      wx.showToast({ title: '请选择记录时间', icon: 'none' })
      return
    }
    if (!symptoms.length && !temperatureText && !String(form.symptomDescription || '').trim()) {
      wx.showToast({ title: '请填写症状、最高体温或症状描述', icon: 'none' })
      return
    }
    if (temperatureText && (!Number.isFinite(Number(temperatureText)) || Number(temperatureText) <= 0)) {
      wx.showToast({ title: '最高体温请输入有效数字', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const saved = await api.saveIllness({
        _id: form._id,
        memberId: form.memberId,
        startedAt: `${this.data.recordDate} ${this.data.recordTime}`,
        endedAt: form.endedAt,
        symptoms,
        symptomDescription: String(form.symptomDescription || '').trim(),
        temperatureMax: temperatureText ? Number(temperatureText) : null,
        hospitalName: form.hospitalName,
        doctorDiagnosis: String(form.doctorDiagnosis || '').trim(),
        doctorAdvice: String(form.doctorAdvice || '').trim(),
        examinationResult: form.examinationResult,
        status: form.status,
        summary: String(form.summary || '').trim() || buildSummary(symptoms, temperatureText, form.symptomDescription),
        initialEventType: form.status === '已就医' ? 'visit' : temperatureText ? 'temperature' : 'symptom',
        initialEventNote: form.status === '已就医' ? buildVisitEventNote(form) : '',
        prescribedMedicineIds,
      })
      for (const attachment of this.data.pendingAttachments) {
        await api.saveAttachment({
          relatedType: 'illness',
          relatedId: saved.id,
          fileType: 'image',
          fileId: attachment.fileID,
          ocrText: '',
          aiSummary: 'OCR 待处理：已保存图片，后续可接入微信 OCR 或腾讯云 OCR。',
        })
      }
      wx.hideLoading()
      this.setData({ saving: false })
      clearVisitDraft(this.visitDraftKey)
      wx.showToast({ title: form._id ? '已修改' : '已保存' })
      wx.navigateBack()
    } catch (error) {
      wx.hideLoading()
      this.setData({ saving: false })
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
      const chooseResult = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
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
      if (error.errMsg && error.errMsg.includes('cancel')) {
        return
      }
      if (uploaded.length) {
        this.setData({ pendingAttachments: [...pendingAttachments, ...uploaded] })
      }
      wx.showToast({ title: '上传失败', icon: 'none' })
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
})

function formFromRecord(record) {
  return {
    ...emptyForm,
    _id: record._id,
    memberId: record.memberId,
    endedAt: record.endedAt || '',
    symptomsText: (record.symptoms || []).join('、'),
    symptomDescription: record.symptomDescription || '',
    temperatureMax: hasValue(record.temperatureMax) ? String(record.temperatureMax) : '',
    hospitalName: record.hospitalName || '',
    doctorDiagnosis: record.doctorDiagnosis || '',
    doctorAdvice: record.doctorAdvice || '',
    examinationResult: record.examinationResult || '',
    status: record.status || '观察中',
    summary: record.summary || '',
  }
}

function resolveDefaultMemberId(members = [], records = [], preferredMemberId = '') {
  if (preferredMemberId && members.some((item) => item._id === preferredMemberId)) {
    return preferredMemberId
  }
  if (members.length <= 1) {
    return members.length ? members[0]._id : ''
  }
  const childIds = new Set(members.filter(isChildMember).map((item) => item._id))
  if (childIds.size) {
    const recentChildRecord = records.find((item) => childIds.has(item.memberId))
    return recentChildRecord ? recentChildRecord.memberId : members.find((item) => childIds.has(item._id))._id
  }
  return members[0]._id
}

function isChildMember(member = {}) {
  const relation = String(member.relation || '').trim()
  if (/孩子|儿子|女儿|儿女|子女|小孩|小朋友|宝宝|宝贝|孙子|孙女|外孙/.test(relation)) {
    return true
  }
  if (!member.birthday) {
    return false
  }
  const birthday = new Date(`${member.birthday}T00:00:00`)
  if (Number.isNaN(birthday.getTime())) {
    return false
  }
  const now = new Date()
  let age = now.getFullYear() - birthday.getFullYear()
  const beforeBirthday = now.getMonth() < birthday.getMonth()
    || (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())
  if (beforeBirthday) {
    age -= 1
  }
  return age >= 0 && age < 18
}

function buildMemberSelectionHint({ record, similarRecord, visitDraft, selectedMember } = {}) {
  if (record) {
    return '编辑病程时会保留原来的家庭成员。'
  }
  if (visitDraft && visitDraft.kind === 'illness_form') {
    return '已保留未完成草稿中的家庭成员，可点击切换。'
  }
  if (similarRecord) {
    return '参考相似病程时会沿用原家庭成员，可点击切换。'
  }
  if (isChildMember(selectedMember)) {
    return '新增病程默认优先选择子女；需要记录其他成员时可点击切换。'
  }
  return '未识别到子女，已选择成员列表第一位；可点击切换。'
}

function formatMemberLabel(member) {
  if (!member) {
    return '请选择成员'
  }
  return member.relation && member.relation !== member.name
    ? `${member.name}（${member.relation}）`
    : member.name
}

function memberInitial(member) {
  return member && member.name ? String(member.name).slice(0, 1) : '家'
}

function splitDateTime(value) {
  const fallback = nowDateTimeInput()
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (!match) {
    return { date: fallback.slice(0, 10), time: fallback.slice(11, 16) }
  }
  return {
    date: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
    time: match[4] ? `${match[4].padStart(2, '0')}:${match[5]}` : '00:00',
  }
}

function parseSymptoms(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[、,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function buildTagOptions(tags, symptomsText) {
  const selected = new Set(parseSymptoms(symptomsText))
  return tags.map((label) => ({ label, selected: selected.has(label) }))
}

function hasVisitDetails(record) {
  return !!(record && (
    record.doctorDiagnosis
    || record.doctorAdvice
    || record.hospitalName
    || record.examinationResult
  ))
}

function readVisitDraft(key) {
  try {
    return wx.getStorageSync(key) || null
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

function clearVisitDraft(key) {
  try {
    wx.removeStorageSync(key)
  } catch (error) {
    // 忽略草稿清理失败，避免影响已保存的病程记录。
  }
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)))
}

function isCompleted(record) {
  return !!(record && (record.status === '已恢复' || record.status === '已关闭' || record.endedAt))
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function buildSummary(symptoms, temperature, note) {
  const parts = []
  if (symptoms.length) {
    parts.push(symptoms.join('、'))
  }
  if (temperature) {
    parts.push(`最高体温 ${temperature}℃`)
  }
  if (String(note || '').trim()) {
    parts.push(String(note).trim())
  }
  return parts.join('，') || '新病程记录'
}

function buildVisitEventNote(form) {
  return [
    form.hospitalName ? `医院：${String(form.hospitalName).trim()}` : '',
    form.doctorDiagnosis ? `诊断：${String(form.doctorDiagnosis).trim()}` : '',
    form.examinationResult ? `检查：${String(form.examinationResult).trim()}` : '',
    form.doctorAdvice ? `医嘱：${String(form.doctorAdvice).trim()}` : '',
  ].filter(Boolean).join('；')
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

module.exports = {
  formatMemberLabel,
  isChildMember,
  resolveDefaultMemberId,
  buildMemberSelectionHint,
  splitDateTime,
}
