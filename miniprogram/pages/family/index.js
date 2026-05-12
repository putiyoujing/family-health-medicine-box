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
    family: {},
    entitlement: {
      planName: '免费版',
      limits: {
        maxSharedUsers: 1,
      },
    },
    roles: [],
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const membership = await api.getMembershipStatus()
      const roleData = await api.listFamilyRoles()
      this.setData({
        loading: false,
        family: membership.family,
        entitlement: membership.entitlement,
        roles: roleData.roles.map((item) => ({
          ...item,
          roleLabel: roleText[item.role] || item.role,
          canManage: item.role !== 'owner' && ['owner', 'admin'].includes(membership.family.role),
        })),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  openInvite() {
    wx.navigateTo({ url: '/pages/family/invite' })
  },

  openSwitch() {
    wx.navigateTo({ url: '/pages/family/switch' })
  },

  openMembership() {
    wx.navigateTo({ url: '/pages/membership/index' })
  },

  async changeRole(event) {
    const openid = event.currentTarget.dataset.openid
    const role = event.currentTarget.dataset.role
    if (!openid || !role) {
      return
    }
    try {
      await api.updateFamilyRole({ openid, role })
      wx.showToast({ title: '已更新' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' })
    }
  },

  async removeUser(event) {
    const openid = event.currentTarget.dataset.openid
    const confirmed = await confirm('确认移除这个共享成员？')
    if (!confirmed) {
      return
    }
    try {
      await api.removeFamilyUser(openid)
      wx.showToast({ title: '已移除' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '移除失败', icon: 'none' })
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
