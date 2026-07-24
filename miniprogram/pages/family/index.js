const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const emptyMember = {
  _id: '',
  name: '',
  relation: '',
  gender: '',
  birthday: '',
  allergyHistory: '',
  medicalHistory: '',
  note: '',
}

const roleText = {
  owner: '家庭创建者',
  admin: '管理员',
  member: '协作者',
  viewer: '查看者',
}

const currentDate = new Date()
const today = [
  currentDate.getFullYear(),
  String(currentDate.getMonth() + 1).padStart(2, '0'),
  String(currentDate.getDate()).padStart(2, '0'),
].join('-')

Page({
  data: {
    loading: true,
    family: {},
    entitlement: {
      planName: '免费版',
      limits: {
        maxMembers: 3,
        maxSharedUsers: 2,
      },
    },
    members: [],
    memberLimit: 3,
    roles: [],
    canEditFamily: false,
    canManageFamily: false,
    showMemberModal: false,
    memberModalMode: 'add',
    selectedMember: null,
    form: { ...emptyMember },
    today,
  },

  onLoad(options) {
    this.openAddOnLoad = options.open === 'add'
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
      const [membership, roleData, home] = await Promise.all([
        api.getMembershipStatus(),
        api.listFamilyRoles(),
        api.getHome({ force: true }),
      ])
      const app = getApp()
      const shouldOpenAdd = this.openAddOnLoad || !!(app.globalData && app.globalData.openMemberModal)
      this.openAddOnLoad = false
      if (app.globalData) {
        app.globalData.openMemberModal = false
      }
      const limits = membership.entitlement && membership.entitlement.limits
        ? membership.entitlement.limits
        : this.data.entitlement.limits
      const canManageFamily = ['owner', 'admin'].includes((membership.family || {}).role)
      const canEditFamily = ['owner', 'admin', 'member'].includes((membership.family || {}).role)
      const roles = (roleData.roles || []).map((item) => ({
        ...item,
        roleLabel: roleText[item.role] || item.role,
        canManage: item.role !== 'owner' && canManageFamily,
      }))
      const pendingInvites = roleData.pendingInvites || []
      this.setData({
        loading: false,
        family: membership.family || {},
        entitlement: membership.entitlement || this.data.entitlement,
        members: (home.members || []).map((item) => {
          const linkedRole = roles.find((role) => role.memberId === item._id)
          const pendingInvite = pendingInvites.find((invite) => invite.targetMemberId === item._id)
          const isCurrentAccount = !!(linkedRole && linkedRole.isCurrentUser)
          return {
            ...item,
            initial: (item.name || '家').slice(0, 1),
            displayRelation: getDisplayRelation(item, linkedRole),
            linkedRole,
            pendingInvite,
            accountStatus: linkedRole ? 'linked' : pendingInvite ? 'pending' : 'managed',
            accountStatusText: linkedRole
              ? `${isCurrentAccount ? '本人' : '已关联微信'} · ${linkedRole.roleLabel}`
              : pendingInvite
                ? `等待接受邀请 · ${roleText[pendingInvite.role] || pendingInvite.role}`
                : '无登录账号 · 由家人代管',
            canInvite: canManageFamily && !linkedRole && !pendingInvite,
          }
        }),
        memberLimit: limits.maxMembers || 3,
        roles,
        canEditFamily,
        canManageFamily,
      })

      if (shouldOpenAdd) {
        this.openMemberModal()
      }
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  openMemberModal() {
    if (this.data.members.length >= this.data.memberLimit) {
      const isFreeMembership = (this.data.entitlement || {}).plan === 'free'
        || String((this.data.entitlement || {}).planName || '').includes('免费')
      wx.showModal({
        title: '成员数量已达上限',
        content: isFreeMembership
          ? `当前免费版最多 ${this.data.memberLimit} 位成员，升级会员后可添加至 10 位。`
          : `当前家庭最多可添加 ${this.data.memberLimit} 位成员。`,
        confirmText: isFreeMembership ? '去升级' : '知道了',
        showCancel: isFreeMembership,
        success: (result) => {
          if (isFreeMembership && result.confirm) {
            this.openMembership()
          }
        },
      })
      return
    }
    this.setData({
      showMemberModal: true,
      memberModalMode: 'add',
      selectedMember: null,
      form: { ...emptyMember },
    })
  },

  editMember(event) {
    const id = event.currentTarget.dataset.id
    const member = this.data.members.find((item) => item._id === id)
    if (!member) {
      return
    }
    this.setData({
      showMemberModal: true,
      memberModalMode: 'edit',
      selectedMember: member,
      form: {
        _id: member._id,
        name: member.name || '',
        relation: member.relation || '',
        gender: member.gender || '',
        birthday: member.birthday || '',
        allergyHistory: member.allergyHistory || '',
        medicalHistory: member.medicalHistory || '',
        note: member.note || '',
      },
    })
  },

  closeMemberModal() {
    this.setData({
      showMemberModal: false,
      memberModalMode: 'add',
      selectedMember: null,
      form: { ...emptyMember },
    })
  },

  noop() {},

  onMemberInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onBirthdayChange(event) {
    this.setData({ 'form.birthday': event.detail.value })
  },

  async saveMember() {
    const form = this.data.form
    if (!String(form.name || '').trim()) {
      wx.showToast({ title: '请填写成员昵称', icon: 'none' })
      return
    }
    if (!String(form.relation || '').trim()) {
      wx.showToast({ title: '请填写成员关系', icon: 'none' })
      return
    }
    try {
      await api.saveMember({
        ...form,
        name: String(form.name).trim(),
        relation: String(form.relation).trim(),
      })
      wx.showToast({ title: form._id ? '已保存' : '已添加' })
      this.closeMemberModal()
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async deleteMember() {
    const id = this.data.form._id
    if (!id) {
      return
    }
    const confirmed = await confirm('确认归档这位家庭成员？历史病程和用药记录会保留，已关联的账号将仅解除档案关联。')
    if (!confirmed) {
      return
    }
    try {
      await api.deleteMember(id)
      wx.showToast({ title: '已归档' })
      this.closeMemberModal()
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },

  openMemberInvite(event) {
    const memberId = event.currentTarget.dataset.id
    if (!memberId) {
      return
    }
    this.closeMemberModal()
    wx.navigateTo({ url: `/pages/family/invite?memberId=${encodeURIComponent(memberId)}` })
  },

  openSwitch() {
    wx.navigateTo({ url: '/pages/family/switch' })
  },

  openAcceptInvite() {
    wx.navigateTo({ url: '/pages/family/accept' })
  },

  openMembership() {
    wx.navigateTo({ url: '/pages/membership/index' })
  },

  async changeRole(event) {
    const roleId = event.currentTarget.dataset.roleId
    const role = event.currentTarget.dataset.role
    if (!roleId || !role) {
      return
    }
    try {
      await api.updateFamilyRole({ roleId, role })
      wx.showToast({ title: '已更新' })
      this.closeMemberModal()
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' })
    }
  },

  async removeUser(event) {
    const roleId = event.currentTarget.dataset.roleId
    if (!roleId) {
      return
    }
    const confirmed = await confirm('确认移除这个协作账号？对方将失去家庭访问权，但关联的成员档案和历史记录会保留。')
    if (!confirmed) {
      return
    }
    try {
      await api.removeFamilyUser(roleId)
      wx.showToast({ title: '已移除' })
      this.closeMemberModal()
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '移除失败', icon: 'none' })
    }
  },
})

function getDisplayRelation(member, linkedRole) {
  if (linkedRole && linkedRole.isCurrentUser) {
    return '本人'
  }
  if (member.relation === '本人') {
    return linkedRole && linkedRole.role === 'owner' || member.isOwnerProfile
      ? '家庭创建者'
      : '家人'
  }
  return member.relation || '关系未填写'
}

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
