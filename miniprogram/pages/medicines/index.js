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
  location: '家庭常备区',
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
    pendingAttachment: null,
  },

  onShow() {
    const app = getApp()
    if (app.globalData && app.globalData.openMedicineCamera) {
      app.globalData.openMedicineCamera = false
      this.setData({ showForm: true })
      this.chooseMedicinePhoto()
    }
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
      const saved = await api.saveMedicine({
        ...form,
        totalQuantity: Number(form.totalQuantity || 0),
        remainingQuantity: Number(form.remainingQuantity || 0),
      })
      if (this.data.pendingAttachment) {
        await api.saveAttachment({
          id: this.data.pendingAttachment.attachmentId,
          relatedType: 'medicine',
          relatedId: saved.id,
          fileType: 'image',
          fileId: this.data.pendingAttachment.fileID,
          imageKind: this.data.pendingAttachment.imageKind || 'medicine_box',
          ocrText: '',
          aiSummary: '已保存外包装或说明书图片，可进入图片解析确认页整理药品信息。',
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '已保存' })
      this.setData({
        form: { ...emptyForm },
        pendingAttachment: null,
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

  async chooseMedicinePhoto() {
    try {
      const res = await wx.showActionSheet({
        itemList: ['拍外包装/药瓶', '拍说明书', '从相册选择'],
      })
      const imageKind = res.tapIndex === 1 ? 'instruction' : 'medicine_box'
      const sourceType = res.tapIndex === 2 ? ['album'] : ['camera', 'album']
      const chooseResult = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
      })
      const filePath = chooseResult.tempFiles[0].tempFilePath
      wx.showLoading({ title: '上传中' })
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `medicines/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        filePath,
      })
      const attachmentRecord = await api.saveAttachment({
        relatedType: 'medicine_draft',
        relatedId: '',
        fileType: 'image',
        fileId: uploadResult.fileID,
        imageKind,
        ocrText: '',
        aiSummary: '已上传外包装或说明书图片，等待确认关联药品。',
      })
      wx.hideLoading()
      this.setData({
        showForm: true,
        pendingAttachment: {
          ...uploadResult,
          attachmentId: attachmentRecord.id,
          tempFilePath: filePath,
          imageKind,
        },
      })
      wx.showToast({ title: '图片已添加' })
    } catch (error) {
      wx.hideLoading()
      if (error.errMsg && error.errMsg.includes('cancel')) {
        return
      }
      wx.showToast({ title: '图片添加失败', icon: 'none' })
    }
  },

  openParse() {
    if (!this.data.pendingAttachment) {
      wx.showToast({ title: '请先添加图片', icon: 'none' })
      return
    }
    const app = getApp()
    if (app.globalData) {
      app.globalData.pendingParseAttachment = {
        fileId: this.data.pendingAttachment.fileID,
        attachmentIds: [this.data.pendingAttachment.attachmentId],
        imageKind: this.data.pendingAttachment.imageKind || 'medicine_box',
        relatedType: 'medicine',
      }
    }
    wx.navigateTo({ url: '/pages/attachment/parse?source=medicine' })
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
