const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const roleText = {
  admin: '管理员',
  member: '协作者',
  viewer: '查看者',
}

Page({
  data: {
    code: '',
    invite: null,
    loading: true,
  },

  onLoad(options = {}) {
    const code = normalizeInviteCode(options.code || options.inviteCode)
    this.setData({ code })
    if (code) {
      this.loadInvite(code)
    } else {
      this.setData({ loading: false })
    }
  },

  async loadInvite(code) {
    try {
      if (!await ensureLoginReady()) {
        this.setData({ loading: false })
        return
      }
      const invite = await api.getFamilyInvite(code)
      const normalizedInvite = {
        ...invite,
        roleLabel: roleText[invite.role] || invite.role,
        canAccept: invite.canAccept !== false,
      }
      this.setData({
        loading: false,
        invite: normalizedInvite,
      })
      if (!normalizedInvite.canAccept) {
        this.showAlreadyInFamilyModal(normalizedInvite.acceptBlockedReason)
      }
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '邀请无效', icon: 'none' })
    }
  },

  onCodeInput(event) {
    this.setData({ code: normalizeInviteCode(event.detail.value) })
  },

  lookup() {
    const code = normalizeInviteCode(this.data.code)
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    this.setData({ code })
    this.loadInvite(code)
  },

  async accept() {
    try {
      if (this.data.invite && !this.data.invite.canAccept) {
        this.showAlreadyInFamilyModal(this.data.invite.acceptBlockedReason)
        return
      }
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        return
      }
      const code = normalizeInviteCode(this.data.code)
      if (!code) {
        wx.showToast({ title: '请输入邀请码', icon: 'none' })
        return
      }
      const result = await api.acceptFamilyInvite(code)
      const app = getApp()
      if (result.familyId && app && app.globalData) {
        app.globalData.currentFamilyId = result.familyId
      }
      wx.showToast({ title: result.memberId ? '已关联并加入家庭' : '已加入家庭' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/index' })
      }, 600)
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    }
  },

  showAlreadyInFamilyModal(content) {
    wx.showModal({
      title: '无需重复加入',
      content: content || '当前账号已在该家庭中，请让尚未加入的家人接受邀请',
      showCancel: false,
      confirmText: '确定',
      success: (result) => {
        if (result.confirm) {
          this.returnFromInvite()
        }
      },
    })
  },

  returnFromInvite() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.switchTab({ url: '/pages/dashboard/index' })
  },
})

function normalizeInviteCode(value) {
  return String(value || '').trim().toUpperCase()
}
