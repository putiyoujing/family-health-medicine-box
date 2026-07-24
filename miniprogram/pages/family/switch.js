const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

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
    ownedFamilyCount: 1,
    maxOwnedFamilies: 1,
    canCreateFamily: false,
    multiFamilyPlan: 'free',
    showCreateForm: false,
    familyName: '',
    creating: false,
  },

  onShow() {
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
      const data = await api.listMyFamilies()
      this.setData({
        loading: false,
        currentFamilyId: data.currentFamilyId,
        ownedFamilyCount: data.ownedFamilyCount || 0,
        maxOwnedFamilies: data.maxOwnedFamilies || 1,
        canCreateFamily: !!data.canCreateFamily,
        multiFamilyPlan: data.multiFamilyPlan || 'free',
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

  openCreate() {
    if (!this.data.canCreateFamily) {
      if (this.data.multiFamilyPlan === 'free') {
        this.goMembership()
      } else {
        wx.showToast({ title: '已达到家庭创建上限', icon: 'none' })
      }
      return
    }
    this.setData({ showCreateForm: true })
  },

  closeCreate() {
    this.setData({ showCreateForm: false, familyName: '' })
  },

  onFamilyNameInput(event) {
    this.setData({ familyName: event.detail.value })
  },

  async create() {
    const name = String(this.data.familyName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写家庭名称', icon: 'none' })
      return
    }
    if (this.data.creating) {
      return
    }
    this.setData({ creating: true })
    try {
      const result = await api.createFamily({ name })
      const app = getApp()
      if (app.globalData) {
        app.globalData.currentFamilyId = result.currentFamilyId
      }
      wx.showToast({ title: '家庭已创建' })
      this.setData({ creating: false, showCreateForm: false, familyName: '' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/index' })
      }, 500)
    } catch (error) {
      this.setData({ creating: false })
      wx.showToast({ title: error.message || '创建失败', icon: 'none' })
    }
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' })
  },

  async choose(event) {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
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
