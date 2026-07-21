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
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const [membership, roleData, home] = await Promise.all([
        api.getMembershipStatus(),
        api.listFamilyRoles(),
        api.getHome(),
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
          return {
            ...item,
            initial: (item.name || '家').slice(0, 1),
            linkedRole,
            pendingInvite,
            accountStatus: linkedRole ? 'linked' : pendingInvite ? 'pending' : 'managed',
            accountStatusText: linkedRole
              ? `已关联微信 · ${linkedRole.roleLabel}`
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
    const openid = event.currentTarget.dataset.openid
    const role = event.currentTarget.dataset.role
    if (!openid || !role) {
      return
    }
    try {
      await api.updateFamilyRole({ openid, role })
      wx.showToast({ title: '已更新' })
      this.closeMemberModal()
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' })
    }
  },

  async removeUser(event) {
    const openid = event.currentTarget.dataset.openid
    const confirmed = await confirm('确认移除这个协作账号？对方将失去家庭访问权，但关联的成员档案和历史记录会保留。')
    if (!confirmed) {
      return
    }
    try {
      await api.removeFamilyUser(openid)
      wx.showToast({ title: '已移除' })
      this.closeMemberModal()
      await this.load()
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
