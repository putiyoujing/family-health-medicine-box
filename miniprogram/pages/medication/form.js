const api = require('../../services/api')
const { formatDateTime, nowDateTimeInput, todayDate } = require('../../utils/format')
const { ensureLoginReady, ensureMedicationReady } = require('../../utils/operation-guards')

const emptyForm = { _id: '', memberId: '', medicineId: '', illnessRecordId: '', doseQuantity: '', reaction: '', note: '' }

Page({
  data: {
    loading: true, saving: false, isEditing: false, family: null, members: [], medicines: [], illnessRecords: [],
    medicineOptions: [], filteredMedicineOptions: [], medicationEntries: [], medicineSearch: '',
    illnessOptions: [createNoIllnessOption()], memberIndex: 0, medicineIndex: 0, illnessIndex: 0,
    selectedMemberName: '请选择成员', selectedMedicineName: '请选择药品', selectedIllnessName: '无关联',
    selectedMedicineUnit: '', selectedMedicineRemaining: 0, availableQuantity: 0,
    recordDate: '', recordTime: '', today: todayDate(), errors: {}, loadError: '', form: { ...emptyForm },
  },

  onLoad(options = {}) {
    this.recordId = options.id || ''
    this.preferredMemberId = options.memberId || ''
    this.preferredMedicineId = options.medicineId || ''
    this.preferredIllnessRecordId = options.illnessRecordId || ''
    this.pendingClientRequestId = ''
    wx.setNavigationBarTitle({ title: this.recordId ? '修改用药记录' : '记录用药' })
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      if (!await ensureLoginReady({ silent: true })) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
      if (home.family && !['owner', 'admin', 'member'].includes(home.family.role)) {
        throw new Error('当前角色只能查看用药记录')
      }
      if (!ensureMedicationReady(home)) {
        this.setData({ loading: false, loadError: '请先添加至少一位家庭成员和一件可用药品，再记录用药。' })
        return
      }
      const record = this.recordId ? (home.medicationLogs || []).find((item) => item._id === this.recordId) : null
      if (this.recordId && !record) throw new Error('未找到要修改的用药记录')
      if (record && !(home.medicines || []).some((item) => item._id === record.medicineId)) {
        throw new Error('原药品已删除，无法修改这条记录；如需撤销，请在列表中作废')
      }
      const preferredMedicine = (home.medicines || []).find((item) => item._id === this.preferredMedicineId)
      const preferredIllness = this.preferredIllnessRecordId
        ? (home.illnessRecords || []).find((item) => item._id === this.preferredIllnessRecordId)
        : null
      if (this.preferredIllnessRecordId && !preferredIllness) throw new Error('未找到要关联的病程')
      const memberId = record
        ? record.memberId
        : preferredIllness
          ? preferredIllness.memberId
          : preferredMedicine && preferredMedicine.memberId
            ? preferredMedicine.memberId
            : this.preferredMemberId || (home.members[0] && home.members[0]._id) || ''
      const form = record
        ? { ...emptyForm, _id: record._id, memberId: record.memberId, medicineId: record.medicineId, illnessRecordId: record.illnessRecordId || '', doseQuantity: String(record.doseQuantity || ''), reaction: record.reaction || '', note: record.note || '' }
        : { ...emptyForm, memberId, illnessRecordId: preferredIllness ? preferredIllness._id : '' }
      this.originalRecord = record
      const pickerState = buildPickerState(home.members || [], home.medicines || [], home.illnessRecords || [], form, record)
      if (!record) pickerState.medicineId = ''
      form.memberId = pickerState.memberId
      form.medicineId = pickerState.medicineId
      form.illnessRecordId = pickerState.illnessRecordId
      const selectedIds = !record && preferredMedicine && pickerState.medicineOptions.some((item) => item._id === preferredMedicine._id)
        ? [preferredMedicine._id]
        : []
      const entries = createMedicationEntries(pickerState.medicineOptions, selectedIds)
      const timeParts = splitDateTime(record && record.takenAt ? record.takenAt : nowDateTimeInput())
      this.setData({
        loading: false, loadError: '', isEditing: !!record, family: home.family, members: home.members || [], medicines: home.medicines || [],
        illnessRecords: home.illnessRecords || [], recordDate: timeParts.date, recordTime: timeParts.time, form,
        medicationEntries: entries, filteredMedicineOptions: buildFilteredMedicineOptions(pickerState.medicineOptions, '', entries), ...pickerState,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '加载失败' })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onMemberChange(event) {
    const member = this.data.members[Number(event.detail.value)]
    if (!member) return
    const form = { ...this.data.form, memberId: member._id, illnessRecordId: '' }
    const pickerState = buildPickerState(this.data.members, this.data.medicines, this.data.illnessRecords, form, this.originalRecord)
    form.medicineId = this.data.isEditing ? pickerState.medicineId : ''
    const entries = this.data.isEditing ? this.data.medicationEntries : []
    this.markDirty()
    this.setData({ form, medicationEntries: entries, medicineSearch: '', errors: {}, filteredMedicineOptions: buildFilteredMedicineOptions(pickerState.medicineOptions, '', entries), ...pickerState })
  },

  onMedicineChange(event) {
    const medicine = this.data.medicineOptions[Number(event.detail.value)]
    if (!medicine) return
    this.markDirty()
    this.setData({ form: { ...this.data.form, medicineId: medicine._id }, medicineIndex: Number(event.detail.value), selectedMedicineName: medicine.name || '未命名药品', selectedMedicineUnit: medicine.unit || '', selectedMedicineRemaining: Number(medicine.remainingQuantity || 0), availableQuantity: getAvailableQuantity(medicine, this.originalRecord), errors: {} })
  },

  onMedicineSearch(event) {
    const medicineSearch = event.detail.value
    this.setData({ medicineSearch, filteredMedicineOptions: buildFilteredMedicineOptions(this.data.medicineOptions, medicineSearch, this.data.medicationEntries) })
  },

  toggleMedicine(event) {
    const id = event.currentTarget.dataset.id
    const medicine = this.data.medicineOptions.find((item) => item._id === id)
    if (!medicine) return
    const selected = this.data.medicationEntries.some((item) => item.medicineId === id)
    const entries = selected
      ? this.data.medicationEntries.filter((item) => item.medicineId !== id)
      : [...this.data.medicationEntries, createMedicationEntry(medicine)]
    this.markDirty()
    this.setData({ medicationEntries: entries, errors: {}, filteredMedicineOptions: buildFilteredMedicineOptions(this.data.medicineOptions, this.data.medicineSearch, entries) })
  },

  onDoseInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.medicationEntries[index]) return
    this.markDirty()
    this.setData({ [`medicationEntries[${index}].doseQuantity`]: event.detail.value, errors: {} })
  },

  onIllnessChange(event) {
    const illness = this.data.illnessOptions[Number(event.detail.value)]
    if (!illness) return
    this.markDirty()
    this.setData({ illnessIndex: Number(event.detail.value), selectedIllnessName: illness.pickerLabel, 'form.illnessRecordId': illness._id || '', errors: {} })
  },

  onDateChange(event) { this.markDirty(); this.setData({ recordDate: event.detail.value, errors: {} }) },
  onTimeChange(event) { this.markDirty(); this.setData({ recordTime: event.detail.value, errors: {} }) },
  onInput(event) { this.markDirty(); this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, errors: {} }) },

  goAddMedicine() {
    const app = getApp()
    if (app.globalData) app.globalData.openMedicineForm = true
    wx.switchTab({ url: '/pages/medicines/index' })
  },

  markDirty() {
    this.pendingClientRequestId = ''
    if (typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: '还有未保存的用药记录，确认离开吗？' })
  },

  async save() {
    if (this.data.saving) return
    if (!await ensureLoginReady()) {
      return
    }
    const errors = validateForm(this.data)
    if (Object.keys(errors).length) {
      this.setData({ errors, medicationEntries: this.data.medicationEntries })
      wx.showToast({ title: '请检查标红字段', icon: 'none' })
      return
    }
    const takenAt = `${this.data.recordDate} ${this.data.recordTime}`
    const clientRequestId = this.data.isEditing ? '' : this.pendingClientRequestId || createClientRequestId()
    this.pendingClientRequestId = clientRequestId
    const items = this.data.isEditing
      ? [{ medicineId: this.data.form.medicineId, doseQuantity: this.data.form.doseQuantity, doseUnit: this.data.selectedMedicineUnit }]
      : this.data.medicationEntries
    this.setData({ saving: true })
    wx.showLoading({ title: this.data.isEditing ? '保存中' : `记录 ${items.length} 种药品` })
    let saved = 0
    try {
      for (const item of items) {
        await api.saveMedication({
          _id: this.data.form._id, memberId: this.data.form.memberId, medicineId: item.medicineId,
          illnessRecordId: this.data.form.illnessRecordId, doseQuantity: Number(item.doseQuantity), doseUnit: item.doseUnit,
          takenAt, reaction: String(this.data.form.reaction || '').trim(), note: String(this.data.form.note || '').trim(),
          clientRequestId: clientRequestId ? `${clientRequestId}-${item.medicineId}` : '',
        })
        saved += 1
      }
      this.pendingClientRequestId = ''
      if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload()
      const app = getApp()
      if (app.globalData) app.globalData.medicationListNeedsRefresh = true
      wx.showToast({ title: this.data.isEditing ? '已保存修改' : `已记录 ${saved} 种药品`, icon: 'none' })
      wx.navigateBack()
    } catch (error) {
      wx.showToast({ title: saved ? `已记录 ${saved} 种；${error.message || '请重试'}` : error.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },
})

function validateForm(data) {
  const errors = {}
  if (!data.form.memberId) errors.memberId = '请选择家庭成员'
  const entries = Array.isArray(data.medicationEntries) ? data.medicationEntries : null
  if (entries && !data.isEditing) {
    if (!entries.length) errors.medicines = '请至少选择一种药品'
    entries.forEach((item) => {
      const dose = Number(item.doseQuantity)
      if (!String(item.doseQuantity || '').trim() || !Number.isFinite(dose) || dose <= 0) item.error = '请输入大于 0 的剂量'
      else if (dose > Number(item.availableQuantity || 0)) item.error = `库存不足，最多 ${item.availableQuantity}${item.unit}`
      else item.error = ''
    })
    if (entries.some((item) => item.error)) errors.doseQuantity = '请检查每种药品的剂量'
  } else {
    const doseQuantity = Number(data.form.doseQuantity)
    if (!data.form.medicineId) errors.medicineId = '请选择当前成员可用的药品'
    if (!data.selectedMedicineUnit) errors.doseQuantity = '请先在药箱中为该药品填写可扣减单位，例如 ml 或片'
    else if (!String(data.form.doseQuantity || '').trim() || !Number.isFinite(doseQuantity) || doseQuantity <= 0) errors.doseQuantity = '本次剂量请输入大于 0 的数字'
    else if (doseQuantity > Number(data.availableQuantity || 0)) errors.doseQuantity = `库存不足，本次最多可记录 ${data.availableQuantity}${data.selectedMedicineUnit}`
  }
  if (!data.recordDate || !data.recordTime) errors.takenAt = '请选择实际服用日期和时间'
  else if (new Date(`${data.recordDate}T${data.recordTime}:00`).getTime() > Date.now() + 5 * 60 * 1000) errors.takenAt = '实际服用时间不能晚于当前时间'
  return errors
}

function buildPickerState(members, medicines, illnessRecords, form, originalRecord) {
  const memberIndex = Math.max(0, members.findIndex((item) => item._id === form.memberId))
  const member = members[memberIndex]
  const memberId = member ? member._id : ''
  const medicineOptions = medicines.filter((item) => !item.memberId || item.memberId === memberId)
  let medicineIndex = medicineOptions.findIndex((item) => item._id === form.medicineId)
  if (medicineIndex < 0) medicineIndex = 0
  const medicine = medicineOptions[medicineIndex]
  const illnessOptions = [createNoIllnessOption(), ...illnessRecords.filter((item) => item.memberId === memberId).map((item) => ({ ...item, pickerLabel: buildIllnessLabel(item) }))]
  let illnessIndex = illnessOptions.findIndex((item) => item._id === form.illnessRecordId)
  if (illnessIndex < 0) illnessIndex = 0
  const illness = illnessOptions[illnessIndex]
  return {
    memberId, medicineId: medicine ? medicine._id : '', illnessRecordId: illness ? illness._id : '', medicineOptions, illnessOptions,
    memberIndex, medicineIndex, illnessIndex, selectedMemberName: member ? member.name || '未命名成员' : '请选择成员',
    selectedMedicineName: medicine ? medicine.name || '未命名药品' : '当前成员没有可用药品', selectedIllnessName: illness ? illness.pickerLabel : '无关联',
    selectedMedicineUnit: medicine ? medicine.unit || '' : '', selectedMedicineRemaining: medicine ? Number(medicine.remainingQuantity || 0) : 0,
    availableQuantity: medicine ? getAvailableQuantity(medicine, originalRecord) : 0,
  }
}

function createMedicationEntry(medicine) {
  return { medicineId: medicine._id, name: medicine.name || '未命名药品', unit: medicine.unit || '', availableQuantity: Number(medicine.remainingQuantity || 0), doseQuantity: '', error: '' }
}
function createMedicationEntries(medicines, ids) { return medicines.filter((item) => ids.includes(item._id)).map(createMedicationEntry) }
function buildFilteredMedicineOptions(medicines, query, entries) {
  const selected = new Set(entries.map((item) => item.medicineId))
  const keyword = String(query || '').trim().toLowerCase()
  return medicines.filter((item) => !keyword || `${item.name || ''} ${item.specification || ''}`.toLowerCase().includes(keyword)).map((item) => ({ ...item, isSelected: selected.has(item._id), remainingText: `${Number(item.remainingQuantity || 0)}${item.unit || ''}` }))
}
function getAvailableQuantity(medicine, originalRecord) { return Number(medicine.remainingQuantity || 0) + (originalRecord && originalRecord.medicineId === medicine._id ? Number(originalRecord.doseQuantity || 0) : 0) }
function createNoIllnessOption() { return { _id: '', pickerLabel: '无关联' } }
function buildIllnessLabel(record) { const content = record.summary || (record.symptoms || []).join('、') || record.symptomDescription || '未命名病程'; const time = formatDateTime(record.startedAt); return time ? `${content} · ${time}` : content }
function splitDateTime(value) { const fallback = nowDateTimeInput(); const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/); return match ? { date: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`, time: match[4] ? `${match[4].padStart(2, '0')}:${match[5]}` : '00:00' } : { date: fallback.slice(0, 10), time: fallback.slice(11, 16) } }
function createClientRequestId() { return `med-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` }

module.exports = { buildPickerState, buildFilteredMedicineOptions, splitDateTime, validateForm }
