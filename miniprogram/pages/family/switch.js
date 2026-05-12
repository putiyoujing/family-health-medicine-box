const api = require('../../services/api')

const roleText = {
  owner: '家庭创建者',
  admin: '管理员',
  member: '协作者',
  viewer: '查看者',
}

Page({
  data: {
    loading: true,
    currentFamilyId: '',
    families: [],
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.listMyFamilies()
      this.setData({
        loading: false,
        currentFamilyId: data.currentFamilyId,
        families: data.families.map((family) => ({
          ...family,
          roleLabel: roleText[family.role] || family.role,
          active: family._id === data.currentFamilyId,
        })),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  async choose(event) {
    const familyId = event.currentTarget.dataset.id
    try {
      await api.switchFamily(familyId)
      wx.showToast({ title: '已切换' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/index' })
      }, 500)
    } catch (error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' })
    }
  },
})
