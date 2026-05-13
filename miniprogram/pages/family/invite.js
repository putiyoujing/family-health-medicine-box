const api = require('../../services/api')

const roleOptions = [
  { role: 'viewer', label: '查看者', desc: '只能查看家庭常备记录、健康记录和用药记录' },
  { role: 'member', label: '协作者', desc: '可以新增和编辑记录，适合共同照顾家人' },
  { role: 'admin', label: '管理员', desc: '可以管理成员和邀请家人' },
]

Page({
  data: {
    roleOptions,
    roleIndex: 0,
    role: 'viewer',
    entitlement: null,
    invite: null,
  },

  async onLoad() {
    try {
      const membership = await api.getMembershipStatus()
      this.setData({
        entitlement: {
          ...membership.entitlement,
          sharedRolesText: membership.entitlement.limits.sharedRoles.join(' / '),
        },
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onRoleChange(event) {
    const roleIndex = Number(event.detail.value)
    this.setData({
      roleIndex,
      role: roleOptions[roleIndex].role,
    })
  },

  async createInvite() {
    try {
      const invite = await api.createFamilyInvite({ role: this.data.role })
      this.setData({ invite })
      wx.showToast({ title: '邀请已生成' })
    } catch (error) {
      wx.showToast({ title: error.message || '生成失败', icon: 'none' })
    }
  },

  copyInvite() {
    const invite = this.data.invite
    if (!invite) {
      return
    }
    wx.setClipboardData({
      data: `邀请你加入我的家庭健康记录：${invite.inviteCode}`,
    })
  },

  onShareAppMessage() {
    const invite = this.data.invite
    return {
      title: '邀请你一起管理家庭健康记录',
      path: invite ? invite.path : '/pages/dashboard/index',
    }
  },
})
