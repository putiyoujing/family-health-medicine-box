const ENV_ID = ''

App({
  globalData: {
    envId: ENV_ID,
    openid: '',
    currentFamilyId: '',
    userProfile: null,
    selectedCouponCode: '',
    openMedicineCamera: false,
    pendingParseAttachment: null,
  },

  onLaunch() {
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

    this.bootstrap()
  },

  async bootstrap() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'login',
      })
      this.globalData.openid = result.result.openid
      this.globalData.userProfile = result.result.user
      this.globalData.currentFamilyId = result.result.currentFamilyId || result.result.familyId || ''
    } catch (error) {
      console.error('login failed', error)
    }
  },
})
