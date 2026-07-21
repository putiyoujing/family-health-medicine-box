const api = require('../../services/api')
const { getAvatarPresetStyle } = require('../../utils/avatar-presets')

Page({
  data: {
    loading: true,
    loggingIn: false,
    loggedIn: false,
    family: {},
    entitlement: {
      plan: 'free',
      planName: '免费版',
      limits: {
        maxMembers: 3,
      },
    },
    isFreeMembership: true,
    members: [],
    user: {},
    profileName: '微信用户',
    profileInitial: '我',
    avatarUrl: '',
    avatarStyle: getAvatarPresetStyle('sprout'),
    memberLimit: 3,
  },

  onShow() {
    const app = getApp()
    const hasPendingAction = !!(app.globalData && app.globalData.openMemberModal)
    if (this.homeLoaded && api.isHomeCacheFresh() && !hasPendingAction) {
      return
    }
    this.load({ silent: this.homeLoaded })
  },

  async load(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    const app = getApp()
    let loggedIn = !!(app.globalData && app.globalData.openid)

    if (!loggedIn && app.loginPromise) {
      try {
        await app.loginPromise
        loggedIn = !!(app.globalData && app.globalData.openid)
      } catch (error) {
        loggedIn = false
      }
    }

    if (!loggedIn) {
      this.showGuestState()
      return
    }

    await this.loadHome(options)
  },

  async loadHome(options = {}) {
    try {
      const home = await api.getHome()
      const user = home.user || {}
      const entitlement = home.entitlement || this.data.entitlement
      const members = (home.members || []).map((member) => ({
        ...member,
        initial: (member.name || '家').slice(0, 1),
      }))
      const app = getApp()
      const shouldOpenMemberModal = !!(app.globalData && app.globalData.openMemberModal)
      if (shouldOpenMemberModal) {
        app.globalData.openMemberModal = false
      }

      this.setData({
        loading: false,
        loggedIn: true,
        family: home.family || {},
        user,
        profileName: getProfileName(user),
        profileInitial: getProfileInitial(user),
        avatarUrl: user.avatarUrl || '',
        avatarStyle: getAvatarPresetStyle(user.avatarPreset),
        entitlement,
        isFreeMembership: isFreePlan(entitlement),
        members,
        memberLimit: entitlement.limits ? entitlement.limits.maxMembers : 3,
      })
      this.homeLoaded = true

      if (shouldOpenMemberModal) {
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/family/index?open=add' })
        }, 0)
      }
    } catch (error) {
      if (options.silent) {
        console.warn('profile refresh failed', error)
        return
      }
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  showGuestState() {
    this.setData({
      loading: false,
      loggedIn: false,
      user: {},
      profileName: '微信用户',
      profileInitial: '我',
      avatarUrl: '',
      avatarStyle: getAvatarPresetStyle('sprout'),
      members: [],
    })
  },

  async login() {
    if (this.data.loggingIn) {
      return false
    }
    const app = getApp()
    if (!app || typeof app.ensureLogin !== 'function') {
      wx.showToast({ title: '登录服务暂不可用', icon: 'none' })
      return false
    }

    this.setData({ loggingIn: true })
    wx.showLoading({ title: '登录中' })
    try {
      await app.ensureLogin({ force: true })
      await this.loadHome()
      return true
    } catch (error) {
      wx.showToast({ title: '微信登录失败，请稍后重试', icon: 'none' })
      return false
    } finally {
      wx.hideLoading()
      this.setData({ loggingIn: false })
    }
  },

  async handleProfileTap() {
    if (!this.data.loggedIn) {
      await this.login()
      return
    }
    wx.navigateTo({ url: '/pages/profile/info' })
  },

  async navigateWithLogin(url) {
    if (!this.data.loggedIn) {
      const loggedIn = await this.login()
      if (!loggedIn) {
        return
      }
    }
    wx.navigateTo({ url })
  },

  openFamily() {
    this.navigateWithLogin('/pages/family/index')
  },

  openMembership() {
    this.navigateWithLogin('/pages/membership/index')
  },

  openReminders() {
    this.navigateWithLogin('/pages/reminders/index')
  },

  openLowStockSettings() {
    this.navigateWithLogin('/pages/profile/low-stock')
  },

  openExpiryReminder() {
    this.navigateWithLogin('/pages/profile/expiry-reminder')
  },

  openFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' })
  },

  openLegal(event) {
    const type = event.currentTarget.dataset.type
    if (!['privacy', 'terms', 'safety'].includes(type)) {
      return
    }
    wx.navigateTo({ url: `/pages/legal/index?type=${type}` })
  },

})

function getProfileName(user = {}) {
  return user.nickname || '微信用户'
}

function getProfileInitial(user = {}) {
  return (user.nickname || '我').slice(0, 1)
}

function isFreePlan(entitlement = {}) {
  return entitlement.plan === 'free' || String(entitlement.planName || '').includes('免费')
}
