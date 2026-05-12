const api = require('../../services/api')
const { formatDateTime, memberName, nowDateTimeInput } = require('../../utils/format')

const emptyForm = {
  memberId: '',
  startedAt: '',
  endedAt: '',
  symptomsText: '',
  symptomDescription: '',
  temperatureMax: '',
  hospitalName: '',
  doctorDiagnosis: '',
  doctorAdvice: '',
  examinationResult: '',
  status: '观察中',
  summary: '',
}

Page({
  data: {
    loading: true,
    members: [],
    records: [],
    showForm: false,
    pendingAttachment: null,
    form: { ...emptyForm, startedAt: nowDateTimeInput() },
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const home = await api.getHome()
      const records = home.illnessRecords.map((item) => ({
        ...item,
        memberName: memberName(home.members, item.memberId),
        timeText: formatDateTime(item.startedAt),
        symptomText: (item.symptoms || []).join('、') || '未填症状',
      }))
      this.setData({
        loading: false,
        members: home.members,
        records,
        'form.memberId': this.data.form.memberId || getFirstId(home.members),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  toggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onMemberChange(event) {
    const index = Number(event.detail.value)
    this.setData({ 'form.memberId': this.data.members[index]._id })
  },

  onStatusChange(event) {
    const options = ['观察中', '已就医', '已恢复']
    this.setData({ 'form.status': options[Number(event.detail.value)] })
  },

  async save() {
    const form = this.data.form
    if (!form.memberId || !form.startedAt) {
      wx.showToast({ title: '请选择成员并填写时间', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      const saved = await api.saveIllness({
        memberId: form.memberId,
        startedAt: form.startedAt,
        endedAt: form.endedAt,
        symptoms: String(form.symptomsText || '')
          .split(/[、,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        symptomDescription: form.symptomDescription,
        temperatureMax: form.temperatureMax ? Number(form.temperatureMax) : null,
        hospitalName: form.hospitalName,
        doctorDiagnosis: form.doctorDiagnosis,
        doctorAdvice: form.doctorAdvice,
        examinationResult: form.examinationResult,
        status: form.status,
        summary: form.summary,
      })
      if (this.data.pendingAttachment) {
        await api.saveAttachment({
          relatedType: 'illness',
          relatedId: saved.id,
          fileType: 'image',
          fileId: this.data.pendingAttachment.fileID,
          ocrText: '',
          aiSummary: 'OCR 待处理：已保存图片，后续可接入微信 OCR 或腾讯云 OCR。',
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '已保存' })
      this.setData({
        showForm: false,
        pendingAttachment: null,
        form: {
          ...emptyForm,
          memberId: getFirstId(this.data.members),
          startedAt: nowDateTimeInput(),
        },
      })
      this.load()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirm('确认删除这条健康记录？')
    if (!confirmed) {
      return
    }
    await api.deleteIllness(id)
    wx.showToast({ title: '已删除' })
    this.load()
  },

  async chooseAttachment() {
    try {
      const chooseResult = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })
      const filePath = chooseResult.tempFiles[0].tempFilePath
      wx.showLoading({ title: '上传中' })
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `illness/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        filePath,
      })
      wx.hideLoading()
      this.setData({
        pendingAttachment: uploadResult,
      })
      wx.showToast({ title: '图片已暂存' })
    } catch (error) {
      wx.hideLoading()
      if (error.errMsg && error.errMsg.includes('cancel')) {
        return
      }
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },
})

function confirm(content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认操作',
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}

function getFirstId(list) {
  return list && list.length ? list[0]._id : ''
}
