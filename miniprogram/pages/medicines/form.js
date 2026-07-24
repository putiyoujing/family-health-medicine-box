const api = require('../../services/api')
const { todayDate } = require('../../utils/format')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { hasPackageConversion } = require('../../utils/medicine-stock')
const { getImageUploadErrorMessage, getMediaSourceType, isImageSelectionCanceled } = require('../../utils/image-upload')

const DEFAULT_TAG_OPTIONS = ['儿童用药', '老人父母', '常规用药', '退烧', '感冒咳嗽', '鼻腔护理', '肠胃', '过敏', '外用', '常备', '处方药', '低库存关注']
const DEFAULT_CATEGORY_OPTIONS = ['退热止痛', '感冒呼吸', '消化肠胃', '抗过敏', '外用皮肤', '五官口腔', '抗感染', '慢病长期', '急救备用', '其他']
const DEFAULT_UNIT_OPTIONS = ['片', '粒', 'ml', 'mg', 'g', '支', '袋', '包', '贴', '盒', '瓶', '板', '罐', '管', '个', '套']
const DEFAULT_PACKAGE_UNIT_OPTIONS = ['盒', '瓶', '袋', '板', '支', '包', '罐', '条', '管']
const MAX_MEDICINE_ATTACHMENTS = 5

const emptyForm = {
  _id: '',
  memberId: '',
  memberNameSnapshot: '全家通用',
  name: '',
  category: '',
  tagsText: '',
  specification: '',
  packageSize: '',
  packageUnit: '',
  packageCount: '',
  totalQuantity: '',
  remainingQuantity: '',
  unit: '',
  expireDate: '',
  location: '家庭药箱',
  source: '药箱',
  indicationsText: '',
  instructionText: '',
  note: '',
}

Page({
  data: {
    loading: true,
    saving: false,
    family: null,
    members: [],
    medicines: [],
    memberPickerOptions: [{ _id: '', name: '全家通用' }],
    memberIndex: 0,
    categoryOptions: DEFAULT_CATEGORY_OPTIONS,
    categoryIndex: 0,
    unitOptions: DEFAULT_UNIT_OPTIONS,
    unitIndex: 0,
    packageUnitOptions: DEFAULT_PACKAGE_UNIT_OPTIONS,
    packageUnitIndex: 0,
    hasPackageConversion: false,
    packageStockTotalText: '',
    formTagOptions: buildFormTagOptions(emptyForm.tagsText),
    pendingAttachments: [],
    imageParsingEnabled: false,
    fromPrescription: false,
    prescriptionMedicineCount: 0,
    today: todayDate(),
    errors: {},
    form: { ...emptyForm },
  },

  onLoad(options = {}) {
    this.recordId = options.id || ''
    this.focusReason = options.reason || ''
    this.autoOpenCamera = options.camera === '1'
    this.preferredMemberId = options.memberId || ''
    this.visitDraftKey = decodeVisitDraftKey(options.visitDraftKey)
    this.fromPrescription = !!this.visitDraftKey
    this.dirty = false
    this.unloadAlertEnabled = false
    wx.setNavigationBarTitle({ title: this.recordId ? '编辑药品' : '添加药品' })
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const loggedIn = await ensureLoginReady({ silent: true })
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
      const visitDraft = this.fromPrescription ? readVisitDraft(this.visitDraftKey) : null
      const medicines = home.medicines || []
      const medicine = this.recordId
        ? medicines.find((item) => item._id === this.recordId)
        : null
      if (this.recordId && !medicine) {
        throw new Error('未找到要编辑的药品')
      }

      const memberPickerOptions = [{ _id: '', name: '全家通用' }, ...(home.members || [])]
      const preferredMember = memberPickerOptions.find((item) => item._id === this.preferredMemberId)
      const form = medicine
        ? formFromMedicine(medicine)
        : {
            ...emptyForm,
            ...(this.fromPrescription
              ? {
                  category: '其他',
                  tagsText: '处方药',
                  totalQuantity: '1',
                  remainingQuantity: '1',
                  unit: '盒',
                  source: '处方',
                }
              : {}),
            memberId: preferredMember ? preferredMember._id : '',
            memberNameSnapshot: preferredMember ? preferredMember.name : '全家通用',
          }
      const memberIndex = Math.max(0, memberPickerOptions.findIndex((item) => item._id === form.memberId))
      const categoryOptions = buildCategoryOptions(form.category)
      const categoryIndex = Math.max(0, categoryOptions.indexOf(form.category))
      const unitOptions = buildUnitOptions(form.unit)
      const unitIndex = Math.max(0, unitOptions.indexOf(form.unit))
      const packageUnitOptions = buildPackageUnitOptions(form.packageUnit)
      const packageUnitIndex = Math.max(0, packageUnitOptions.indexOf(form.packageUnit))
      this.setData({
        loading: false,
        family: home.family,
        members: home.members || [],
        medicines,
        memberPickerOptions,
        memberIndex,
        categoryOptions,
        categoryIndex,
        unitOptions,
        unitIndex,
        packageUnitOptions,
        packageUnitIndex,
        ...buildPackageState(form),
        formTagOptions: buildFormTagOptions(form.tagsText),
        imageParsingEnabled: !!(getApp().globalData && getApp().globalData.imageParsingEnabled),
        fromPrescription: this.fromPrescription,
        prescriptionMedicineCount: visitDraft && Array.isArray(visitDraft.prescribedMedicines)
          ? visitDraft.prescribedMedicines.length
          : 0,
        errors: {},
        form,
      })
      this.dirty = false

      if (this.focusReason) {
        wx.showToast({
          title: this.focusReason === 'expire' ? '请处理有效期' : '请更新库存',
          icon: 'none',
        })
        this.focusReason = ''
      }
      if (this.autoOpenCamera) {
        this.autoOpenCamera = false
        await this.chooseMedicinePhoto()
      }
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    if (field === 'packageSize' || field === 'packageCount') {
      this.updatePackageStock({ [field]: value, [`errors.${field}`]: '' })
      this.markDirty()
      return
    }
    const updates = {
      [`form.${field}`]: value,
      [`errors.${field}`]: '',
    }
    if (field === 'tagsText') {
      updates.formTagOptions = buildFormTagOptions(value)
    }
    if (this.fromPrescription && field === 'totalQuantity') {
      updates['form.remainingQuantity'] = value
    }
    this.setData(updates)
    this.markDirty()
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value)
    const option = this.data.memberPickerOptions[memberIndex]
    if (!option) {
      return
    }
    this.setData({
      memberIndex,
      'form.memberId': option._id,
      'form.memberNameSnapshot': option.name,
    })
    this.markDirty()
  },

  onCategoryChange(event) {
    const categoryIndex = Number(event.detail.value)
    const category = this.data.categoryOptions[categoryIndex]
    if (!category) {
      return
    }
    this.setData({
      categoryIndex,
      'form.category': category,
      'errors.category': '',
    })
    this.markDirty()
  },

  onExpireDateChange(event) {
    this.setData({
      'form.expireDate': event.detail.value,
      'errors.expireDate': '',
    })
    this.markDirty()
  },

  onUnitChange(event) {
    const unitIndex = Number(event.detail.value)
    const unit = this.data.unitOptions[unitIndex]
    if (!unit) {
      return
    }
    this.updatePackageStock({ unit, unitIndex, 'errors.unit': '' })
    this.markDirty()
  },

  onPackageUnitChange(event) {
    const packageUnitIndex = Number(event.detail.value)
    const packageUnit = this.data.packageUnitOptions[packageUnitIndex]
    if (!packageUnit) {
      return
    }
    this.updatePackageStock({ packageUnit, packageUnitIndex, 'errors.packageUnit': '' })
    this.markDirty()
  },

  updatePackageStock(changes = {}) {
    const form = { ...this.data.form }
    Object.keys(changes).forEach((key) => {
      if (!key.startsWith('errors.') && !key.endsWith('Index')) {
        form[key] = changes[key]
      }
    })
    const packageState = buildPackageState(form)
    if (packageState.packageTotalQuantity !== null) {
      const previousTotal = Number(this.data.form.totalQuantity || 0)
      const previousRemaining = Number(this.data.form.remainingQuantity || 0)
      form.totalQuantity = String(packageState.packageTotalQuantity)
      if (!form._id || !this.data.form.remainingQuantity || previousRemaining === previousTotal) {
        form.remainingQuantity = String(packageState.packageTotalQuantity)
      }
    }
    this.setData({ form, ...changes, ...buildPackageState(form) })
  },

  clearExpireDate() {
    this.setData({ 'form.expireDate': '' })
    this.markDirty()
  },

  toggleFormTag(event) {
    const value = event.currentTarget.dataset.value
    if (!value) {
      return
    }
    const tags = normalizeTags(this.data.form.tagsText)
    const next = tags.includes(value)
      ? tags.filter((item) => item !== value)
      : [...tags, value]
    const tagsText = next.join('、')
    this.setData({
      'form.tagsText': tagsText,
      formTagOptions: buildFormTagOptions(tagsText),
    })
    this.markDirty()
  },

  markDirty() {
    this.dirty = true
    if (this.unloadAlertEnabled || typeof wx.enableAlertBeforeUnload !== 'function') {
      return
    }
    wx.enableAlertBeforeUnload({ message: '当前药品信息尚未保存，确定要离开吗？' })
    this.unloadAlertEnabled = true
  },

  disableUnloadAlert() {
    this.dirty = false
    if (typeof wx.disableAlertBeforeUnload === 'function') {
      wx.disableAlertBeforeUnload()
    }
    this.unloadAlertEnabled = false
  },

  async save() {
    return this.saveMedicine(false)
  },

  async saveAndContinue() {
    return this.saveMedicine(true)
  },

  async saveAndReturn() {
    if (this.fromPrescription && !String(this.data.form.name || '').trim()) {
      this.disableUnloadAlert()
      wx.navigateBack()
      return
    }
    return this.save()
  },

  async editPreviousPrescriptionMedicine() {
    if (this.data.saving) {
      return
    }
    const draft = readVisitDraft(this.visitDraftKey)
    const medicines = draft && Array.isArray(draft.prescribedMedicines) ? draft.prescribedMedicines : []
    const previousMedicine = medicines[medicines.length - 1]
    if (!previousMedicine || !previousMedicine.medicineId) {
      wx.showToast({ title: '还没有可修改的药品', icon: 'none' })
      return
    }
    if (this.dirty && !await confirm('当前药品尚未保存，修改上一种药品后不会保留这次输入。', '修改上一种药品')) {
      return
    }
    this.disableUnloadAlert()
    this.recordId = previousMedicine.medicineId
    await this.load()
  },

  async saveMedicine(continueAdding) {
    if (this.data.saving) {
      return
    }
    if (!await ensureLoginReady()) {
      return
    }
    const form = this.data.form
    const errors = validateForm(form)
    if (Object.keys(errors).length) {
      this.setData({ errors })
      wx.showToast({ title: '请检查标红字段', icon: 'none' })
      return
    }

    this.setData({ saving: true, errors: {} })
    wx.showLoading({ title: '保存中' })
    try {
      const medicineForm = { ...form }
      delete medicineForm.packageCount
      const saved = await api.saveMedicine({
        ...medicineForm,
        name: String(form.name).trim(),
        category: String(form.category || '').trim(),
        specification: String(form.specification || '').trim(),
        packageSize: Number(form.packageSize || 0),
        packageUnit: String(form.packageUnit || '').trim(),
        unit: String(form.unit || '').trim(),
        expireDate: String(form.expireDate || '').trim(),
        location: String(form.location || '').trim(),
        indicationsText: String(form.indicationsText || '').trim(),
        instructionText: String(form.instructionText || '').trim(),
        tags: normalizeTags(form.tagsText),
        totalQuantity: Number(form.totalQuantity || 0),
        remainingQuantity: Number(form.remainingQuantity || 0),
      })
      for (const attachment of this.data.pendingAttachments || []) {
        await api.saveAttachment({
          id: attachment.attachmentId,
          relatedType: 'medicine',
          relatedId: saved.id,
          fileType: 'image',
          fileId: attachment.fileID,
          imageKind: attachment.imageKind || 'medicine_box',
          ocrText: '',
          aiSummary: '已保存外包装或说明书图片，可进入图片解析确认页整理药品信息。',
        })
      }
      wx.hideLoading()
      this.setData({ saving: false })
      this.disableUnloadAlert()
      if (this.fromPrescription) {
        appendPrescriptionMedicine(this.visitDraftKey, saved, form)
        if (continueAdding) {
          this.recordId = ''
          wx.showToast({ title: '已加入药箱，继续添加' })
          await this.load()
          return
        }
      }
      wx.showToast({ title: form._id ? '已修改' : '已保存' })
      wx.navigateBack()
    } catch (error) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async chooseMedicinePhoto() {
    const pendingAttachments = this.data.pendingAttachments || []
    const remaining = MAX_MEDICINE_ATTACHMENTS - pendingAttachments.length
    if (remaining <= 0) {
      wx.showToast({ title: `最多可添加 ${MAX_MEDICINE_ATTACHMENTS} 张包装图片`, icon: 'none' })
      return
    }
    const confirmed = await confirm(
      '图片可能包含敏感健康或身份信息。请先遮挡无关姓名、证件号等内容，确认后再选择并上传。',
      '上传健康图片？',
    )
    if (!confirmed) {
      return
    }
    try {
      const res = await wx.showActionSheet({
        itemList: ['拍外包装/药瓶', '拍说明书', '从相册选择'],
      })
      const imageKind = res.tapIndex === 1 ? 'instruction' : 'medicine_box'
      const sourceType = getMediaSourceType(res.tapIndex, 2)
      const chooseResult = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType,
      })
      wx.showLoading({ title: '上传中' })
      const addedAttachments = []
      for (const file of chooseResult.tempFiles || []) {
        const filePath = file.tempFilePath
        const uploadResult = await uploadImageOrDemo(
          `medicines/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
          filePath,
        )
        const attachmentRecord = await api.saveAttachment({
          relatedType: 'medicine_draft',
          relatedId: '',
          fileType: 'image',
          fileId: uploadResult.fileID,
          imageKind,
          ocrText: '',
          aiSummary: '已上传外包装或说明书图片，等待确认关联药品。',
        })
        addedAttachments.push({
          ...uploadResult,
          attachmentId: attachmentRecord.id,
          tempFilePath: filePath,
          imageKind,
        })
      }
      wx.hideLoading()
      this.setData({
        pendingAttachments: [...pendingAttachments, ...addedAttachments],
      })
      this.markDirty()
      wx.showToast({ title: '图片已添加' })
    } catch (error) {
      wx.hideLoading()
      if (isImageSelectionCanceled(error)) {
        return
      }
      console.error('medicine image upload failed', error)
      wx.showModal({
        title: '药品图片上传失败',
        content: getImageUploadErrorMessage(error, '药品图片'),
        showCancel: false,
      })
    }
  },

  openParse() {
    const pendingAttachment = (this.data.pendingAttachments || [])[0]
    if (!pendingAttachment) {
      wx.showToast({ title: '请先添加图片', icon: 'none' })
      return
    }
    const app = getApp()
    if (!app.globalData || !app.globalData.imageParsingEnabled) {
      wx.showModal({
        title: '图片整理暂未开放',
        content: '当前版本只安全保存原图，请手动填写药品信息。接入真实识别服务并完成隐私配置后再开放自动整理。',
        showCancel: false,
      })
      return
    }
    app.globalData.pendingParseAttachment = {
      fileId: pendingAttachment.fileID,
      attachmentIds: [pendingAttachment.attachmentId],
      imageKind: pendingAttachment.imageKind || 'medicine_box',
      relatedType: 'medicine',
    }
    wx.navigateTo({ url: '/pages/attachment/parse?source=medicine' })
  },

  async removeMedicinePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const pendingAttachments = this.data.pendingAttachments || []
    const attachment = pendingAttachments[index]
    if (!attachment) {
      return
    }
    try {
      if (attachment.attachmentId) {
        await api.deleteAttachment(attachment.attachmentId)
      }
      this.setData({
        pendingAttachments: pendingAttachments.filter((_, itemIndex) => itemIndex !== index),
      })
    } catch (error) {
      wx.showToast({ title: error.message || '删除图片失败', icon: 'none' })
    }
  },
})

function validateForm(form) {
  const errors = {}
  const name = String(form.name || '').trim()
  const totalText = String(form.totalQuantity ?? '').trim()
  const remainingText = String(form.remainingQuantity ?? '').trim()
  const total = Number(totalText)
  const remaining = Number(remainingText)
  const packageSizeText = String(form.packageSize ?? '').trim()
  const packageCountText = String(form.packageCount ?? '').trim()
  const packageSize = Number(packageSizeText)
  const packageCount = Number(packageCountText)
  const packageStarted = packageSizeText || String(form.packageUnit || '').trim()

  if (!name) {
    errors.name = '请填写药品名称'
  }
  if (!String(form.category || '').trim()) {
    errors.category = '请选择药品分类'
  }
  if (packageStarted && (!packageSizeText || !Number.isFinite(packageSize) || packageSize <= 0)) {
    errors.packageSize = '请填写每包装含量'
  }
  if (packageStarted && !String(form.unit || '').trim()) {
    errors.unit = '请选择包装内的库存单位'
  }
  if (packageStarted && !String(form.packageUnit || '').trim()) {
    errors.packageUnit = '请选择外包装单位'
  }
  if (hasPackageConversion(form) && packageCountText && (!Number.isFinite(packageCount) || packageCount < 0)) {
    errors.packageCount = '请输入不小于 0 的包装数量'
  }
  if (totalText && (!Number.isFinite(total) || total < 0)) {
    errors.totalQuantity = '总量请输入不小于 0 的数字'
  }
  if (remainingText && (!Number.isFinite(remaining) || remaining < 0)) {
    errors.remainingQuantity = '剩余量请输入不小于 0 的数字'
  }
  if (remainingText && !totalText) {
    errors.totalQuantity = '填写剩余量时请同时填写总量'
  }
  if ((totalText || remainingText) && !String(form.unit || '').trim()) {
    errors.unit = '请选择库存按什么计算'
  }
  if (!errors.totalQuantity && !errors.remainingQuantity && totalText && remainingText && remaining > total) {
    errors.remainingQuantity = '剩余量不能大于总量'
  }
  return errors
}

function formFromMedicine(medicine) {
  const packageSize = Number(medicine.packageSize || 0)
  const packageCount = packageSize > 0 && hasValue(medicine.totalQuantity)
    ? Number(medicine.totalQuantity) / packageSize
    : ''
  return {
    ...emptyForm,
    _id: medicine._id,
    memberId: medicine.memberId || '',
    memberNameSnapshot: medicine.memberNameSnapshot || '全家通用',
    name: medicine.name || '',
    category: medicine.category || '',
    tagsText: normalizeTags(medicine.tags || medicine.tagsText).join('、'),
    specification: medicine.specification || '',
    packageSize: packageSize > 0 ? String(packageSize) : '',
    packageUnit: medicine.packageUnit || '',
    packageCount: Number.isFinite(packageCount) ? String(packageCount) : '',
    totalQuantity: hasValue(medicine.totalQuantity) ? String(medicine.totalQuantity) : '',
    remainingQuantity: hasValue(medicine.remainingQuantity) ? String(medicine.remainingQuantity) : '',
    unit: medicine.unit || '',
    expireDate: medicine.expireDate || '',
    location: medicine.location || emptyForm.location,
    source: medicine.source || emptyForm.source,
    indicationsText: medicine.indicationsText || '',
    instructionText: medicine.instructionText || '',
    note: medicine.note || '',
  }
}

function buildCategoryOptions(selectedCategory) {
  return Array.from(new Set([
    ...DEFAULT_CATEGORY_OPTIONS,
    selectedCategory,
  ].filter(Boolean)))
}

function buildUnitOptions(selectedUnit) {
  return Array.from(new Set([...DEFAULT_UNIT_OPTIONS, selectedUnit].filter(Boolean)))
}

function buildPackageUnitOptions(selectedUnit) {
  return Array.from(new Set([...DEFAULT_PACKAGE_UNIT_OPTIONS, selectedUnit].filter(Boolean)))
}

function buildPackageState(form) {
  const packageSize = Number(form.packageSize || 0)
  const packageCountText = String(form.packageCount ?? '').trim()
  const packageCount = Number(packageCountText)
  const enabled = hasPackageConversion(form)
  const packageTotalQuantity = enabled && packageCountText && Number.isFinite(packageCount) && packageCount >= 0
    ? Number((packageSize * packageCount).toFixed(6))
    : null
  return {
    hasPackageConversion: enabled,
    packageTotalQuantity,
    packageStockTotalText: packageTotalQuantity === null ? '' : `共 ${packageTotalQuantity}${form.unit}`,
  }
}

function normalizeTags(value) {
  const tags = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  return Array.from(new Set(tags))
}

function buildFormTagOptions(value) {
  const selected = normalizeTags(value)
  return DEFAULT_TAG_OPTIONS.map((item) => ({
    label: item,
    value: item,
    active: selected.includes(item),
  }))
}

function appendPrescriptionMedicine(key, saved, form) {
  if (!key) {
    return
  }
  try {
    const draft = wx.getStorageSync(key)
    if (!draft) {
      return
    }
    const medicineId = saved.id || saved._id
    if (!medicineId) {
      return
    }
    const medicines = Array.isArray(draft.prescribedMedicines) ? draft.prescribedMedicines : []
    const medicineSnapshot = {
      medicineId,
      medicineNameSnapshot: String(form.name || '').trim(),
      specificationSnapshot: String(form.specification || '').trim(),
      quantitySnapshot: String(form.totalQuantity || '').trim(),
      unitSnapshot: String(form.unit || '').trim(),
    }
    const prescribedMedicines = medicines.some((item) => item.medicineId === medicineId)
      ? medicines.map((item) => item.medicineId === medicineId ? medicineSnapshot : item)
      : [...medicines, medicineSnapshot]
    const draftFormKey = draft.kind === 'illness_form' ? 'form' : 'eventForm'
    wx.setStorageSync(key, {
      ...draft,
      [draftFormKey]: {
        ...draft[draftFormKey],
        prescribedMedicineIds: Array.from(new Set([
          ...((draft[draftFormKey] && draft[draftFormKey].prescribedMedicineIds) || []),
          medicineId,
        ])),
      },
      prescribedMedicines,
    })
  } catch (error) {
    wx.showToast({ title: '已入药箱，请返回确认就诊记录', icon: 'none' })
  }
}

function readVisitDraft(key) {
  try {
    return wx.getStorageSync(key) || null
  } catch (error) {
    return null
  }
}

function decodeVisitDraftKey(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch (error) {
    return String(value || '')
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
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
  buildCategoryOptions,
  buildUnitOptions,
  formFromMedicine,
  normalizeTags,
  validateForm,
}
