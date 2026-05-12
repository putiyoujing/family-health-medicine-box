const api = require('../../services/api')

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

  onLoad(options) {
    const code = options.code || options.inviteCode || ''
    this.setData({ code })
    if (code) {
      this.loadInvite(code)
    } else {
      this.setData({ loading: false })
    }
  },

  async loadInvite(code) {
    try {
      const invite = await api.getFamilyInvite(code)
      this.setData({
        loading: false,
        invite: {
          ...invite,
          roleLabel: roleText[invite.role] || invite.role,
        },
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '邀请无效', icon: 'none' })
    }
  },

  onCodeInput(event) {
    this.setData({ code: event.detail.value })
  },

  lookup() {
    if (!this.data.code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    this.loadInvite(this.data.code)
  },

  async accept() {
    try {
      await api.acceptFamilyInvite(this.data.code)
      wx.showToast({ title: '已加入家庭' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/index' })
      }, 600)
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    }
  },
})
