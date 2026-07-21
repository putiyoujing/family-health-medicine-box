const ENV_ID = ''
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
    if (this.globalData.useDemoData) {
      this.loginPromise = this.bootstrap()
      this.loginPromise.catch(() => {})
      return
    }

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

    this.loginPromise = this.bootstrap()
    this.loginPromise.catch(() => {})
  },

  ensureLogin(options = {}) {
    if (this.globalData.openid && !options.force) {
      return Promise.resolve({
        openid: this.globalData.openid,
        user: this.globalData.userProfile,
        currentFamilyId: this.globalData.currentFamilyId,
      })
    }
    if (!this.loginPromise || options.force) {
      this.loginPromise = this.bootstrap()
    }
    return this.loginPromise
  },

  async bootstrap() {
    this.globalData.loginStatus = 'loading'
    this.globalData.loginError = ''
    if (this.globalData.useDemoData) {
      return this.useTestLogin('development-mock')
    }
    try {
      await wxLogin()
      const result = await wx.cloud.callFunction({
        name: 'login',
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
      console.error('login failed', error)
      this.globalData.loginStatus = 'failed'
      this.globalData.loginError = error && (error.errMsg || error.message) ? (error.errMsg || error.message) : 'login failed'
      throw error
    }
  },

  useTestLogin(reason = 'manual') {
    const testUser = {
      _id: 'devtools-user-001',
      openid: 'devtools-openid',
      nickname: '测试用户',
      avatarUrl: '',
      avatarPreset: 'sprout',
      gender: '',
      birthday: '',
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

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject,
    })
  })
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
