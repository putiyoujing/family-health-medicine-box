const ENV_ID = 'family-health-prod-d9csm29f27d75'
const ENABLE_DEV_MOCK_LOGIN = true

App({
  globalData: {
    envId: ENV_ID,
    openid: '',
    currentFamilyId: '',
    userProfile: null,
    loginStatus: 'idle',
    loginError: '',
    loginMode: '',
    selectedCouponCode: '',
    openMedicineCamera: false,
    openMedicineForm: false,
    openMemberModal: false,
    openQuickIllness: false,
    focusMedicineId: '',
    focusMedicineReason: '',
    pendingParseAttachment: null,
    imageParsingEnabled: false,
    enableDevMockLogin: ENABLE_DEV_MOCK_LOGIN,
    // Runtime default stays off; onLaunch enables demo data only for develop builds.
    useDemoData: false,
  },

  onLaunch() {
    this.globalData.useDemoData = shouldUseDevMockLogin(this.globalData.enableDevMockLogin)
    this.globalData.envId = this.globalData.useDemoData ? '' : ENV_ID
    if (!this.globalData.useDemoData) {
      if (!wx.cloud) {
        wx.showModal({
          title: '初始化失败',
          content: '当前微信版本暂不支持此服务，请升级微信后再试。',
          showCancel: false,
        })
        return
      }

      wx.cloud.init({
        env: ENV_ID || undefined,
        traceUser: true,
      })
    }

    this.registerPrivacyAuthorization()
    this.restoreLoginPromise = this.restoreLogin()
  },

  registerPrivacyAuthorization() {
    if (
      this.needPrivacyAuthorizationHandler
      || typeof wx.onNeedPrivacyAuthorization !== 'function'
    ) {
      return
    }
    this.needPrivacyAuthorizationHandler = (resolve) => {
      this.privacyAuthorizationResolve = resolve
      const layer = this.activeAuthLayer
      if (layer && typeof layer.showPrivacyDialog === 'function') {
        layer.showPrivacyDialog()
        return
      }
      this.resolvePrivacyAuthorization(false)
    }
    wx.onNeedPrivacyAuthorization(this.needPrivacyAuthorizationHandler)
  },

  requestPrivacyAuthorization(layer) {
    if (this.privacyRequestPromise) {
      return this.privacyRequestPromise
    }
    this.activeAuthLayer = layer
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      this.activeAuthLayer = null
      return Promise.resolve(true)
    }
    this.privacyRequestPromise = new Promise((resolve) => {
      this.finishPrivacyRequest = resolve
    })
    wx.requirePrivacyAuthorize({
      success: () => this.completePrivacyRequest(true),
      fail: () => this.completePrivacyRequest(false),
    })
    return this.privacyRequestPromise
  },

  resolvePrivacyAuthorization(agreed) {
    const resolve = this.privacyAuthorizationResolve
    this.privacyAuthorizationResolve = null
    if (typeof resolve === 'function') {
      resolve(agreed
        ? { event: 'agree', buttonId: 'privacy-agree-button' }
        : { event: 'disagree' })
    }
    if (!agreed) {
      this.completePrivacyRequest(false)
    }
  },

  completePrivacyRequest(granted) {
    const finish = this.finishPrivacyRequest
    this.finishPrivacyRequest = null
    this.privacyRequestPromise = null
    this.activeAuthLayer = null
    if (typeof finish === 'function') {
      finish(granted)
    }
  },

  async restoreLogin() {
    if (this.globalData.openid) {
      return true
    }
    if (this.globalData.useDemoData) {
      return false
    }
    try {
      return !!(await this.bootstrap(undefined, { allowGuest: true }))
    } catch (error) {
      console.warn('silent login restore failed', error)
      this.globalData.loginStatus = 'idle'
      this.globalData.loginError = ''
      return false
    }
  },

  ensureLogin() {
    if (this.globalData.openid) {
      return Promise.resolve({
        openid: this.globalData.openid,
        user: this.globalData.userProfile,
        currentFamilyId: this.globalData.currentFamilyId,
      })
    }
    return Promise.reject(new Error('LOGIN_REQUIRED'))
  },

  resetLogin() {
    this.globalData.openid = ''
    this.globalData.currentFamilyId = ''
    this.globalData.userProfile = null
    this.globalData.loginStatus = 'idle'
    this.globalData.loginError = ''
    this.globalData.loginMode = ''
  },

  async authorizeLogin(profile) {
    if (this.loginPromise) {
      return this.loginPromise
    }
    this.loginPromise = this.bootstrap(profile)
    try {
      return await this.loginPromise
    } finally {
      this.loginPromise = null
    }
  },

  async requestLogin(profile) {
    if (this.globalData.openid) {
      return this.ensureLogin()
    }
    if (!hasCompleteProfile(profile)) {
      throw new Error('PROFILE_REQUIRED')
    }
    if (this.profileLoginPromise) {
      return this.profileLoginPromise
    }
    this.profileLoginPromise = this.authorizeLogin(profile)
    try {
      return await this.profileLoginPromise
    } finally {
      this.profileLoginPromise = null
    }
  },

  async bootstrap(profile, options = {}) {
    this.globalData.loginStatus = 'loading'
    this.globalData.loginError = ''
    if (this.globalData.useDemoData) {
      return this.useTestLogin('development-mock', profile)
    }
    try {
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: { profile },
      })
      this.globalData.openid = result.result.openid
      this.globalData.userProfile = result.result.user
      this.globalData.currentFamilyId = result.result.currentFamilyId || result.result.familyId || ''
      this.globalData.loginStatus = 'success'
      this.globalData.loginMode = 'cloud'
      return {
        openid: this.globalData.openid,
        user: this.globalData.userProfile,
        currentFamilyId: this.globalData.currentFamilyId,
      }
    } catch (error) {
      if (options.allowGuest && isAuthorizedProfileRequired(error)) {
        this.globalData.loginStatus = 'idle'
        this.globalData.loginError = ''
        return null
      }
      console.error('login failed', error)
      this.globalData.loginStatus = 'failed'
      this.globalData.loginError = error && (error.errMsg || error.message) ? (error.errMsg || error.message) : 'login failed'
      throw error
    }
  },

  useTestLogin(reason = 'manual', profile = {}) {
    const submittedProfile = {
      nickname: String(profile.nickname || '').trim() || '测试用户',
      avatarUrl: String(profile.avatarUrl || '').trim(),
      avatarPreset: String(profile.avatarPreset || '').trim() || 'sprout',
    }
    const demoProfile = require('./services/demo-data').updateUserProfile(submittedProfile).user
    const testUser = {
      ...demoProfile,
      _id: 'devtools-user-001',
      openid: 'devtools-openid',
      currentFamilyId: 'demo-family-001',
      loginReason: reason,
    }
    this.globalData.openid = testUser.openid
    this.globalData.userProfile = testUser
    this.globalData.currentFamilyId = testUser.currentFamilyId
    this.globalData.loginStatus = 'success'
    this.globalData.loginError = ''
    this.globalData.loginMode = 'test'
    return Promise.resolve({
      openid: testUser.openid,
      user: testUser,
      currentFamilyId: testUser.currentFamilyId,
    })
  },
})

function hasCompleteProfile(profile) {
  return !!(
    profile
    && String(profile.nickname || '').trim()
    && (
      String(profile.avatarUrl || '').trim()
      || String(profile.avatarPreset || '').trim()
    )
  )
}

function isAuthorizedProfileRequired(error) {
  const message = String(error && (error.errMsg || error.message) || '').toLowerCase()
  return message.includes('authorized user profile is required')
    || message.includes('profile_required')
}

function shouldUseDevMockLogin(enabled) {
  if (!enabled || typeof wx.getAccountInfoSync !== 'function') {
    return false
  }
  try {
    const accountInfo = wx.getAccountInfoSync()
    return accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion === 'develop'
  } catch (error) {
    console.warn('failed to read miniprogram environment', error)
    return false
  }
}
