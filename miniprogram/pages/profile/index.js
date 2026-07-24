const api = require('../../services/api')
const { getAvatarPresetStyle } = require('../../utils/avatar-presets')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { syncTabBar } = require('../../utils/tab-bar')

Page({
  data: {
    loading: true,
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

  async onShow() {
    syncTabBar(this, 4)
    const app = getApp()
    const hasPendingAction = !!(app.globalData && app.globalData.openMemberModal)
    await this.load({ silent: this.homeLoaded && !hasPendingAction, force: true })
  },

  async load(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    if (!await ensureLoginReady({ silent: true })) {
      this.showGuestState()
      return
    }

    await this.loadHome(options)
  },

  async loadHome(options = {}) {
    try {
      const home = await api.getHome({ force: Boolean(options.force) })
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
      if (error && error.message === 'LOGIN_REQUIRED') {
        this.showGuestState()
        return
      }
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
    if (this.data.loggedIn) {
      return false
    }
    if (!await ensureLoginReady()) {
      return false
    }
    await this.load({ force: true })
    return true
  },

  async handleProfileTap() {
    if (!this.data.loggedIn) {
      await this.login()
      return
    }
    wx.navigateTo({ url: '/pages/profile/info' })
  },

  async navigateWithLogin(url) {
    if (!await ensureLoginReady()) {
      return
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
