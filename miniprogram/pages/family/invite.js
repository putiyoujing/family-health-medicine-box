const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { EVENT_IDS, track, trackServiceError } = require('../../utils/analytics')

const roleOptions = [
  { role: 'viewer', label: '查看者', desc: '只能查看家庭药箱记录、健康记录和用药记录' },
  { role: 'member', label: '协作者', desc: '可以新增和编辑记录，适合共同照顾家人' },
  { role: 'admin', label: '管理员', desc: '可以管理成员和邀请家人' },
]

Page({
  data: {
    roleOptions,
    roleIndex: 0,
    role: 'viewer',
    targetMemberId: '',
    targetMemberName: '',
    entitlement: null,
    invite: null,
  },

  async onLoad(options = {}) {
    try {
      const loggedIn = await ensureLoginReady({ silent: true })
      if (!loggedIn) {
        return
      }
      const [membership, home, roleData] = await Promise.all([
        api.getMembershipStatus(),
        api.getHome(),
        api.listFamilyRoles(),
      ])
      const linkedMemberIds = new Set((roleData.roles || []).map((item) => item.memberId).filter(Boolean))
      const requestedMember = (home.members || []).find((item) => item._id === options.memberId)
      if (!requestedMember) {
        throw new Error('请先从家庭成员卡片发起邀请')
      }
      if (linkedMemberIds.has(requestedMember._id)) {
        throw new Error('该成员已关联账号')
      }
      const pendingInvite = (roleData.pendingInvites || [])
        .find((item) => item.targetMemberId === requestedMember._id)
      const entitlement = (membership && membership.entitlement) || {}
      const limits = entitlement.limits || {}
      const allowedRoles = Array.isArray(limits.sharedRoles) && limits.sharedRoles.length
        ? limits.sharedRoles
        : ['viewer']
      const availableRoleOptions = roleOptions.filter((item) => allowedRoles.includes(item.role))
      let safeRoleOptions = availableRoleOptions.length ? availableRoleOptions : [roleOptions[0]]
      const pendingRoleOption = pendingInvite
        ? roleOptions.find((item) => item.role === pendingInvite.role)
        : null
      if (pendingRoleOption && !safeRoleOptions.some((item) => item.role === pendingRoleOption.role)) {
        safeRoleOptions = [pendingRoleOption, ...safeRoleOptions]
      }
      const pendingRoleIndex = pendingInvite
        ? safeRoleOptions.findIndex((item) => item.role === pendingInvite.role)
        : -1
      const roleIndex = pendingRoleIndex >= 0 ? pendingRoleIndex : 0
      const selectedRole = safeRoleOptions[roleIndex]
      this.setData({
        targetMemberId: requestedMember._id,
        targetMemberName: requestedMember.name || '',
        roleOptions: safeRoleOptions,
        roleIndex,
        role: selectedRole.role,
        entitlement: {
          ...entitlement,
          sharedRolesText: safeRoleOptions.map((item) => item.label).join(' / '),
        },
        invite: pendingInvite
          ? {
              ...pendingInvite,
              path: `/pages/family/accept?code=${encodeURIComponent(pendingInvite.inviteCode)}`,
            }
          : null,
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onRoleChange(event) {
    const roleIndex = Number(event.detail.value)
    const selectedRole = this.data.roleOptions[roleIndex]
    if (!selectedRole) {
      return
    }
    this.setData({
      roleIndex,
      role: selectedRole.role,
    })
  },

  async createInvite() {
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        return
      }
      if (!this.data.targetMemberId) {
        wx.showToast({ title: '请先选择家庭成员', icon: 'none' })
        return
      }
      const invite = await api.createFamilyInvite({
        role: this.data.role,
        targetMemberId: this.data.targetMemberId,
      })
      this.setData({ invite })
      track(EVENT_IDS.FAMILY_INVITE_RESULT, { entry: 'create', status: 'success' })
      wx.showToast({ title: '邀请已生成' })
    } catch (error) {
      track(EVENT_IDS.FAMILY_INVITE_RESULT, { entry: 'create', status: 'fail' })
      trackServiceError('family_invite_create')
      wx.showToast({ title: error.message || '生成失败', icon: 'none' })
    }
  },

  copyInvite() {
    const invite = this.data.invite
    if (!invite) {
      return
    }
    wx.setClipboardData({
      data: invite.inviteCode,
      success: () => wx.showToast({ title: '复制成功' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    })
  },

  onShareAppMessage() {
    const invite = this.data.invite
    return {
      title: `邀请你以「${this.data.targetMemberName}」身份加入家庭健康记录`,
      path: invite ? invite.path : '/pages/dashboard/index',
    }
  },
})
