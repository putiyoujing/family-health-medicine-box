const api = require('../../services/api')
const { nowDateTimeInput } = require('../../utils/format')
const { ensureHasMembers, ensureLoginReady } = require('../../utils/operation-guards')
const { getImageUploadErrorMessage, getMediaSourceType, isImageSelectionCanceled } = require('../../utils/image-upload')
const {
  EVENT_IDS,
  countBucket,
  inputType,
  track,
  trackServiceError,
} = require('../../utils/analytics')

const MAX_IMAGES_PER_SLOT = 3

const slotDefinitions = [
  { label: '病例 / 问诊单', hint: '门诊病历、问诊记录、医生诊断', imageKind: 'medical_record' },
  { label: '检查报告', hint: '血常规、化验单、影像报告等', imageKind: 'examination' },
  { label: '处方 / 医嘱', hint: '处方单、医生开的药和医嘱', imageKind: 'prescription' },
  { label: '药品图片', hint: '药盒、药瓶或药袋', imageKind: 'medicine_box' },
]

Page({
  onShareAppMessage() {
    return require('../../utils/share').getDefaultShareConfig()
  },

  data: {
    loading: true,
    loadError: '',
    saving: false,
    members: [],
    memberIndex: 0,
    selectedMemberText: '请选择成员',
    selectedMemberInitial: '家',
    inputText: '',
    imageParsingEnabled: false,
    entitlement: { tier: 'free', planName: '基础版' },
    quickRecordUsage: { used: 0, limit: 3, remaining: 3, period: 'lifetime', exhausted: false },
    quickRecordLocked: false,
    quickRecordNotice: '基础版最多可体验三次',
    totalImageLimit: MAX_IMAGES_PER_SLOT,
    totalFileCount: 0,
    slots: buildSlots(),
    previewVisible: false,
    previewImageUrl: '',
    previewSlotIndex: -1,
    previewImageIndex: -1,
  },

  onLoad() {
    track(EVENT_IDS.QUICK_RECORD_START, { entry: 'quick' })
    this.load()
  },

  async load() {
    if (this.loadingRequest) {
      return
    }
    this.loadingRequest = true
    this.setData({ loading: true, loadError: '' })
    try {
      const loggedIn = await ensureLoginReady({ silent: true })
      if (!loggedIn) {
        this.setData({ loading: false, loadError: '请先登录后使用快速记录' })
        return
      }
      const home = await api.getHome()
      if (!ensureHasMembers(home)) {
        this.setData({ loading: false })
        return
      }
      const app = getApp()
      const memberIndex = 0
      const selectedMember = home.members[memberIndex]
      const quickRecordUsage = home.quickRecordUsage || {
        used: 0,
        limit: 3,
        remaining: 3,
        period: 'lifetime',
        exhausted: false,
      }
      const entitlement = home.entitlement || this.data.entitlement
      const imageParsingEnabled = Boolean(
        (home.features && home.features.imageParsingEnabled)
        || (app.globalData && app.globalData.useDemoData),
      )
      this.setData({
        loading: false,
        loadError: '',
        members: home.members,
        memberIndex,
        selectedMemberText: formatMemberLabel(selectedMember),
        selectedMemberInitial: memberInitial(selectedMember),
        entitlement,
        quickRecordUsage,
        quickRecordLocked: Boolean(quickRecordUsage.exhausted),
        quickRecordNotice: formatQuickRecordNotice(quickRecordUsage, entitlement),
        imageParsingEnabled,
      })
      if (app.globalData) {
        app.globalData.imageParsingEnabled = imageParsingEnabled
      }
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '加载失败，请稍后重试' })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.loadingRequest = false
    }
  },

  goAddMember() {
    const app = getApp()
    if (app.globalData) {
      app.globalData.openMemberModal = true
    }
    wx.switchTab({ url: '/pages/profile/index' })
  },

  onMemberChange(event) {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const memberIndex = Number(event.detail.value)
    const member = this.data.members[memberIndex]
    if (!member) {
      return
    }
    this.setData({
      memberIndex,
      selectedMemberText: formatMemberLabel(member),
      selectedMemberInitial: memberInitial(member),
    })
  },

  onInput(event) {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const inputText = event.detail.value
    this.setData({ inputText })
    if (String(inputText || '').trim()) {
      this.reportContentAdded()
    }
  },

  async chooseImages(event) {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const slotIndex = Number(event.currentTarget.dataset.slot)
    const slot = this.data.slots[slotIndex]
    if (!slot) {
      return
    }
    const remaining = MAX_IMAGES_PER_SLOT - slot.files.length
    if (remaining <= 0) {
      wx.showToast({ title: `这一类最多上传 ${MAX_IMAGES_PER_SLOT} 张`, icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '上传健康图片？',
        content: '图片可能包含健康或身份信息，请先遮挡无关姓名、证件号等内容。',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) {
      return
    }
    const uploaded = []
    let duplicateCount = 0
    try {
      const sourceResult = await wx.showActionSheet({ itemList: ['拍照', '从相册选择'] })
      const chooseResult = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: getMediaSourceType(sourceResult.tapIndex, 1),
      })
      wx.showLoading({ title: '上传中' })
      for (const file of chooseResult.tempFiles) {
        const filePath = file.tempFilePath
        if (hasImage(this.data.slots, filePath) || uploaded.some((item) => item.sourcePath === filePath)) {
          duplicateCount += 1
          continue
        }
        const uploadResult = await uploadImageOrDemo(
          `illness/quick-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
          filePath,
        )
        uploaded.push({
          ...uploadResult,
          tempFilePath: uploadResult.tempFilePath || filePath,
          sourcePath: filePath,
          imageKind: slot.imageKind,
        })
      }
      wx.hideLoading()
      if (uploaded.length) {
        this.updateSlotFiles(slotIndex, [...slot.files, ...uploaded])
        this.reportContentAdded()
        track(EVENT_IDS.IMAGE_UPLOAD_RESULT, {
          image_type: slot.imageKind,
          status: 'success',
          count_bucket: countBucket(uploaded.length),
        })
      }
      wx.showToast({
        title: duplicateCount ? `已添加 ${uploaded.length} 张，跳过重复图片` : `已添加 ${uploaded.length} 张`,
        icon: 'none',
      })
    } catch (error) {
      wx.hideLoading()
      if (isImageSelectionCanceled(error)) {
        return
      }
      if (uploaded.length) {
        this.updateSlotFiles(slotIndex, [...slot.files, ...uploaded])
      }
      track(EVENT_IDS.IMAGE_UPLOAD_RESULT, {
        image_type: slot.imageKind,
        status: 'fail',
        count_bucket: '0',
      })
      trackServiceError('quick_image_upload')
      wx.showModal({
        title: '图片上传失败',
        content: getImageUploadErrorMessage(error, '健康图片'),
        showCancel: false,
      })
    }
  },

  removeImage(event) {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const slotIndex = Number(event.currentTarget.dataset.slot)
    const imageIndex = Number(event.currentTarget.dataset.index)
    const slot = this.data.slots[slotIndex]
    if (!slot || !Number.isInteger(imageIndex)) {
      return
    }
    this.updateSlotFiles(slotIndex, slot.files.filter((item, index) => index !== imageIndex))
  },

  previewImage(event) {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const slotIndex = Number(event.currentTarget.dataset.slot)
    const imageIndex = Number(event.currentTarget.dataset.index)
    const slot = this.data.slots[slotIndex]
    const file = slot && slot.files[imageIndex]
    if (!file) {
      return
    }
    this.setData({
      previewVisible: true,
      previewImageUrl: file.fileID || file.tempFilePath,
      previewSlotIndex: slotIndex,
      previewImageIndex: imageIndex,
    })
  },

  closePreview() {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    this.setData({
      previewVisible: false,
      previewImageUrl: '',
      previewSlotIndex: -1,
      previewImageIndex: -1,
    })
  },

  removePreviewImage() {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    const slotIndex = this.data.previewSlotIndex
    const imageIndex = this.data.previewImageIndex
    this.closePreview()
    this.removeImage({ currentTarget: { dataset: { slot: slotIndex, index: imageIndex } } })
  },

  updateSlotFiles(slotIndex, files) {
    const slots = this.data.slots.map((slot, index) => (
      index === slotIndex ? { ...slot, files } : slot
    ))
    this.setData({ slots, totalFileCount: countFiles(slots) })
  },

  reportContentAdded() {
    if (this.contentAddedTracked) {
      return
    }
    this.contentAddedTracked = true
    track(EVENT_IDS.RECORD_CONTENT_ADD, {
      input_type: inputType({
        inputText: this.data.inputText,
        imageCount: this.data.totalFileCount,
      }),
    })
  },

  async submit() {
    if (!this.guardQuickRecordAccess()) {
      return
    }
    if (this.data.saving) {
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    const member = this.data.members[this.data.memberIndex]
    const inputText = String(this.data.inputText || '').trim()
    const files = this.data.slots.flatMap((slot) => slot.files.map((file) => ({
      ...file,
      imageKind: slot.imageKind,
    })))
    if (!member) {
      wx.showToast({ title: '请选择家庭成员', icon: 'none' })
      return
    }
    if (!inputText && !files.length) {
      wx.showToast({ title: '请先输入内容或上传图片', icon: 'none' })
      return
    }

    const shouldReviewAi = Boolean(this.data.imageParsingEnabled && (files.length || inputText))
    const basePayload = buildBasePayload(member._id, inputText)
    this.setData({ saving: true })
    wx.showLoading({ title: '保存病程' })
    try {
      const saved = await api.saveIllness(basePayload)
      track(EVENT_IDS.RECORD_CREATED, { entry: 'quick', status: 'success' })
      const savedAttachments = []
      for (const file of files) {
        const attachment = await api.saveAttachment({
          relatedType: 'illness',
          relatedId: saved.id,
          fileType: 'image',
          fileId: file.fileID,
          imageKind: file.imageKind,
          ocrText: '',
          aiSummary: '等待智能整理。',
        })
        savedAttachments.push({
          ...attachment,
          fileId: file.fileID,
          tempFilePath: file.tempFilePath || '',
          imageKind: file.imageKind,
        })
      }

      wx.hideLoading()
      this.setData({ saving: false })
      const detailUrl = `/pages/illness/detail?id=${saved.id}`
      if (shouldReviewAi) {
        const app = getApp()
        if (app.globalData) {
          app.globalData.pendingIllnessReview = {
            illnessId: saved.id,
            memberId: member._id,
            inputText,
            attachments: savedAttachments,
            returnUrl: detailUrl,
          }
        }
        wx.redirectTo({ url: '/pages/illness/review' })
      } else {
        wx.redirectTo({ url: detailUrl })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ saving: false })
      trackServiceError('quick_record_save')
      if (String(error.message || '').includes('快速记录次数已用完')) {
        track(EVENT_IDS.RECORD_QUOTA_BLOCKED, { entry: 'quick', status: 'blocked', source: 'server' })
        this.setData({ quickRecordLocked: true, quickRecordUsage: { ...this.data.quickRecordUsage, exhausted: true } })
        this.promptQuickRecordUpgrade()
        return
      }
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  guardQuickRecordAccess() {
    if (!this.data.quickRecordLocked) {
      return true
    }
    track(EVENT_IDS.RECORD_QUOTA_BLOCKED, { entry: 'quick', status: 'blocked', source: 'client' })
    this.promptQuickRecordUpgrade()
    return false
  },

  promptQuickRecordUpgrade() {
    if (!this.data.quickRecordLocked) {
      return
    }
    wx.showModal({
      title: '快速记录次数已用完',
      content: '请升级会员',
      showCancel: false,
      confirmText: '确定',
      success: (result) => {
        if (result.confirm) {
          wx.navigateTo({ url: '/pages/membership/index?focus=redeem' })
        }
      },
    })
  },
})

function formatQuickRecordNotice(usage = {}, entitlement = {}) {
  if (entitlement.tier === 'unlimited' || usage.limit === null) {
    return '畅享版，快速记录不限次数'
  }
  if (usage.period === 'monthly') {
    return `安心版本月还可记录 ${usage.remaining || 0} 次`
  }
  return '基础版最多可体验三次'
}

function buildSlots() {
  return slotDefinitions.map((slot) => ({
    ...slot,
    files: [],
  }))
}

function countFiles(slots = []) {
  return slots.reduce((count, slot) => count + slot.files.length, 0)
}

function hasImage(slots, sourcePath) {
  return slots.some((slot) => slot.files.some((file) => (
    file.sourcePath === sourcePath || file.tempFilePath === sourcePath || file.fileID === sourcePath
  )))
}

function buildBasePayload(memberId, inputText) {
  const payload = {
    entrySource: 'quick',
    memberId,
    startedAt: nowDateTimeInput(),
    endedAt: '',
    symptoms: [],
    symptomDescription: inputText,
    temperatureMax: null,
    hospitalName: '',
    doctorDiagnosis: '',
    doctorAdvice: '',
    examinationResult: '',
    prescribedMedicineIds: [],
    status: '观察中',
    summary: inputText || '快速记录一次生病',
    quickInputText: inputText,
    initialEventType: 'symptom',
    initialEventNote: inputText || '快速记录一次生病',
  }
  return payload
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

async function uploadImageOrDemo(cloudPath, filePath) {
  const app = getApp()
  if (app.globalData && app.globalData.useDemoData) {
    return {
      fileID: filePath,
      tempFilePath: filePath,
    }
  }
  return wx.cloud.uploadFile({ cloudPath, filePath })
}

module.exports = {
  buildBasePayload,
  buildSlots,
  countFiles,
  formatMemberLabel,
  hasImage,
  memberInitial,
}
