const api = require('../../services/api')
const { daysUntil } = require('../../utils/format')

const emptyForm = {
  name: '',
  category: '退烧',
  specification: '',
  totalQuantity: '',
  remainingQuantity: '',
  unit: '盒',
  expireDate: '',
  location: '家庭药箱',
  source: '常备',
  indicationsText: '',
  instructionText: '',
  note: '',
}

Page({
  data: {
    loading: true,
    medicines: [],
    filteredMedicines: [],
    query: '',
    form: { ...emptyForm },
    showForm: false,
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const home = await api.getHome()
      const medicines = home.medicines.map((item) => ({
        ...item,
        expireWarn: daysUntil(item.expireDate) <= 60,
      }))
      this.setData({
        loading: false,
        medicines,
        filteredMedicines: this.filterMedicines(medicines, this.data.query),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  filterMedicines(medicines, query) {
    const keyword = String(query || '').trim().toLowerCase()
    if (!keyword) {
      return medicines
    }
    return medicines.filter((item) =>
      [item.name, item.category, item.location, item.indicationsText, item.note]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  },

  onSearch(event) {
    const query = event.detail.value
    this.setData({
      query,
      filteredMedicines: this.filterMedicines(this.data.medicines, query),
    })
  },

  toggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: event.detail.value,
    })
  },

  async save() {
    const form = this.data.form
    if (!form.name) {
      wx.showToast({ title: '请填写药品名称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      await api.saveMedicine({
        ...form,
        totalQuantity: Number(form.totalQuantity || 0),
        remainingQuantity: Number(form.remainingQuantity || 0),
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存' })
      this.setData({
        form: { ...emptyForm },
        showForm: false,
      })
      this.load()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirm('确认删除这个药品记录？')
    if (!confirmed) {
      return
    }
    await api.deleteMedicine(id)
    wx.showToast({ title: '已删除' })
    this.load()
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
