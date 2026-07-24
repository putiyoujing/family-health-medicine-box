const { requestWechatLogin } = require('../../utils/operation-guards')

Component({
  data: {
    privacyVisible: false,
    loginVisible: false,
    submitting: false,
    nickname: '',
    avatarUrl: '',
    avatarPreset: 'sprout',
    loginButtons: [
      { type: 'default', text: '拒绝', value: 'cancel' },
      { type: 'primary', text: '允许', value: 'confirm' },
    ],
  },

  lifetimes: {
    detached() {
      this.finish(false)
    },
  },

  methods: {
    open() {
      const app = getApp()
      if (app && app.globalData && app.globalData.openid) {
        return Promise.resolve(true)
      }
      if (this.openPromise) {
        return this.openPromise
      }
      this.setData({
        privacyVisible: false,
        loginVisible: false,
        submitting: false,
        nickname: '',
        avatarUrl: '',
        avatarPreset: 'sprout',
      })
      setAuthTabMaskVisible(true)
      this.openPromise = new Promise((resolve) => {
        this.openResolve = resolve
      })
      this.startAuthorization()
      return this.openPromise
    },

    async startAuthorization() {
      try {
        const app = getApp()
        const granted = !app || typeof app.requestPrivacyAuthorization !== 'function'
          ? true
          : await app.requestPrivacyAuthorization(this)
        if (!this.openResolve) {
          return
        }
        if (!granted) {
          this.finish(false)
          return
        }
        this.setData({ privacyVisible: false, loginVisible: true })
      } catch (error) {
        console.warn('privacy authorization failed', error)
        this.finish(false)
      }
    },

    showPrivacyDialog() {
      this.setData({ privacyVisible: true })
    },

    onPrivacyAgree() {
      this.setData({ privacyVisible: false })
      const app = getApp()
      if (app && typeof app.resolvePrivacyAuthorization === 'function') {
        app.resolvePrivacyAuthorization(true)
        return
      }
      this.setData({ loginVisible: true })
    },

    onPrivacyReject() {
      this.setData({ privacyVisible: false })
      const app = getApp()
      if (app && typeof app.resolvePrivacyAuthorization === 'function') {
        app.resolvePrivacyAuthorization(false)
        return
      }
      this.finish(false)
    },

    openPrivacyContract() {
      if (typeof wx.openPrivacyContract !== 'function') {
        wx.showToast({ title: '请在微信中查看隐私保护指引', icon: 'none' })
        return
      }
      wx.openPrivacyContract({
        fail: () => wx.showToast({ title: '暂时无法打开隐私保护指引', icon: 'none' }),
      })
    },

    onChooseAvatar(event) {
      const avatarUrl = String(event && event.detail && event.detail.avatarUrl || '').trim()
      if (avatarUrl) {
        this.setData({ avatarUrl, avatarPreset: '' })
      }
    },

    onNicknameInput(event) {
      const nickname = String(event && event.detail && event.detail.value || '').slice(0, 80)
      this.setData({ nickname })
    },

    onNicknameReview(event) {
      if (event && event.detail && event.detail.pass === false) {
        this.setData({ nickname: '' })
        wx.showToast({ title: '昵称未通过微信安全检测，请重新填写', icon: 'none' })
      }
    },

    async onLoginButtonTap(event) {
      const item = event && event.detail && event.detail.item
      if (item && item.value === 'confirm') {
        return this.confirmLogin()
      }
      this.cancelLogin()
      return false
    },

    async confirmLogin(event) {
      if (this.data.submitting) {
        return false
      }
      const formNickname = event && event.detail && event.detail.value
        ? event.detail.value.nickname
        : ''
      const nickname = String(formNickname || this.data.nickname || '').trim()
      if (!nickname) {
        wx.showToast({ title: '请填写昵称', icon: 'none' })
        return false
      }

      this.setData({ submitting: true, nickname })
      try {
        const selectedAvatarUrl = String(this.data.avatarUrl || '').trim()
        const avatarUrl = selectedAvatarUrl
          ? await uploadLoginAvatar(selectedAvatarUrl)
          : ''
        const profile = {
          nickname,
          avatarUrl,
          avatarPreset: avatarUrl ? '' : (this.data.avatarPreset || 'sprout'),
        }
        if (!await requestWechatLogin(profile)) {
          return false
        }
        this.finish(true)
        return true
      } catch (error) {
        console.error('login profile submission failed', error)
        wx.showToast({ title: '头像上传失败，请稍后重试', icon: 'none' })
        return false
      } finally {
        this.setData({ submitting: false })
      }
    },

    cancelLogin() {
      if (!this.data.submitting) {
        this.finish(false)
      }
    },

    finish(result) {
      const resolve = this.openResolve
      this.openResolve = null
      this.openPromise = null
      this.setData({
        privacyVisible: false,
        loginVisible: false,
      })
      setAuthTabMaskVisible(false)
      if (typeof resolve === 'function') {
        resolve(result)
      }
    },
  },
})

function setAuthTabMaskVisible(authMaskVisible) {
  if (typeof getCurrentPages !== 'function') {
    return
  }
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  if (!currentPage || typeof currentPage.getTabBar !== 'function') {
    return
  }
  const tabBar = currentPage.getTabBar()
  if (tabBar && typeof tabBar.setData === 'function') {
    tabBar.setData({ authMaskVisible })
  }
}

async function uploadLoginAvatar(filePath) {
  if (/^(cloud:\/\/|https?:\/\/)/.test(filePath)) {
    return filePath
  }
  const app = getApp()
  if (app && app.globalData && app.globalData.useDemoData) {
    return filePath
  }
  const extensionMatch = filePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg'
  const result = await wx.cloud.uploadFile({
    cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    filePath,
  })
  if (!result || !result.fileID) {
    throw new Error('未返回云存储文件标识')
  }
  return result.fileID
}
