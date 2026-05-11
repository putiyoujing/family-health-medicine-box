const api = require('../../services/api')
const { formatDateTime, memberName, medicineName, nowDateTimeInput } = require('../../utils/format')

const emptyForm = {
  memberId: '',
  illnessRecordId: '',
  medicineId: '',
  doseQuantity: '',
  doseUnit: '',
  takenAt: '',
  frequencyText: '单次记录',
  wasPlanned: true,
  reaction: '',
  note: '',
}

Page({
  data: {
    loading: true,
    members: [],
    medicines: [],
    illnessRecords: [],
    logs: [],
    showForm: false,
    form: { ...emptyForm, takenAt: nowDateTimeInput() },
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const home = await api.getHome()
      const logs = home.medicationLogs.map((item) => ({
        ...item,
        memberName: memberName(home.members, item.memberId),
        medicineName: item.medicineNameSnapshot || medicineName(home.medicines, item.medicineId),
        timeText: formatDateTime(item.takenAt),
      }))
      this.setData({
        loading: false,
        members: home.members,
        medicines: home.medicines,
        illnessRecords: home.illnessRecords,
        logs,
        'form.memberId': this.data.form.memberId || getFirstId(home.members),
        'form.medicineId': this.data.form.medicineId || getFirstId(home.medicines),
        'form.doseUnit': this.data.form.doseUnit || getFirstUnit(home.medicines),
        'form.illnessRecordId': this.data.form.illnessRecordId || getFirstId(home.illnessRecords),
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
    this.setData({ 'form.memberId': this.data.members[Number(event.detail.value)]._id })
  },

  onMedicineChange(event) {
    const medicine = this.data.medicines[Number(event.detail.value)]
    this.setData({
      'form.medicineId': medicine._id,
      'form.doseUnit': medicine.unit || this.data.form.doseUnit,
    })
  },

  onIllnessChange(event) {
    this.setData({ 'form.illnessRecordId': this.data.illnessRecords[Number(event.detail.value)]._id })
  },

  onPlanChange(event) {
    this.setData({ 'form.wasPlanned': event.detail.value === 'true' })
  },

  async save() {
    const form = this.data.form
    if (!form.memberId || !form.medicineId || !form.doseQuantity) {
      wx.showToast({ title: '请填写成员、药品和剂量', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      await api.saveMedication({
        ...form,
        doseQuantity: Number(form.doseQuantity || 0),
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存并扣库存' })
      this.setData({
        showForm: false,
        form: {
          ...emptyForm,
          memberId: getFirstId(this.data.members),
          medicineId: getFirstId(this.data.medicines),
          illnessRecordId: getFirstId(this.data.illnessRecords),
          doseUnit: getFirstUnit(this.data.medicines),
          takenAt: nowDateTimeInput(),
        },
      })
      this.load()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },
})

function getFirstId(list) {
  return list && list.length ? list[0]._id : ''
}

function getFirstUnit(list) {
  return list && list.length ? list[0].unit || '' : ''
}
