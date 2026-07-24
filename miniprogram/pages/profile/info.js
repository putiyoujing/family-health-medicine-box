const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { getAvatarPresetStyle } = require('../../utils/avatar-presets')

const emptyForm = {
  nickname: '',
  avatarUrl: '',
  gender: '',
  birthday: '',
  phone: '',
  email: '',
  note: '',
}

const genderOptions = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '其他', value: 'other' },
]

Page({
  data: {
    loading: true,
    saving: false,
    uploadingAvatar: false,
    avatarText: '我',
    avatarStyle: getAvatarPresetStyle('sprout'),
    genderOptions,
    genderIndex: 0,
    genderLabel: '',
    today: getToday(),
    isDemoMode: false,
    form: { ...emptyForm },
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
      const home = await api.getHome()
      const user = home.user || {}
      const isDemoMode = isUsingDemoData()
      const form = {
        nickname: user.nickname || '',
        avatarUrl: !isDemoMode && isTemporaryAvatarUrl(user.avatarUrl) ? '' : user.avatarUrl || '',
        gender: user.gender || '',
        birthday: user.birthday || '',
        phone: user.phone || '',
        email: user.email || '',
        note: user.note || '',
      }
      this.setData({
        loading: false,
        isDemoMode,
        form,
        genderIndex: getGenderIndex(form.gender),
        genderLabel: getGenderLabel(form.gender),
        avatarText: (form.nickname || '我').slice(0, 1),
        avatarStyle: getAvatarPresetStyle(user.avatarPreset),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onGenderChange(event) {
    const genderIndex = Number(event.detail.value || 0)
    const option = this.data.genderOptions[genderIndex] || this.data.genderOptions[0]
    this.setData({
      genderIndex,
      genderLabel: option.label,
      'form.gender': option.value,
    })
  },

  onBirthdayChange(event) {
    this.setData({ 'form.birthday': event.detail.value || '' })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    this.setData({
      [`form.${field}`]: value,
      avatarText: field === 'nickname' ? (value || '我').slice(0, 1) : this.data.avatarText,
    })
  },

  async onChooseAvatar(event) {
    const tempFilePath = event.detail.avatarUrl || ''
    if (!tempFilePath || this.data.uploadingAvatar) {
      return
    }
    const app = getApp()
    if (app.globalData && app.globalData.useDemoData) {
      this.setData({ 'form.avatarUrl': tempFilePath })
      wx.showToast({ title: '头像已更换' })
      return
    }
    this.setData({ uploadingAvatar: true })
    wx.showLoading({ title: '上传头像' })
    try {
      const result = await wx.cloud.uploadFile({
        cloudPath: buildAvatarCloudPath(tempFilePath),
        filePath: tempFilePath,
      })
      if (!result.fileID) {
        throw new Error('未获得头像文件地址')
      }
      this.setData({ 'form.avatarUrl': result.fileID })
      wx.showToast({ title: '头像已上传' })
    } catch (error) {
      wx.showToast({ title: error.message || '头像上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ uploadingAvatar: false })
    }
  },

  async save() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    const form = this.data.form
    if (!String(form.nickname || '').trim()) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    if (this.data.uploadingAvatar) {
      wx.showToast({ title: '请等待头像上传完成', icon: 'none' })
      return
    }
    if (!isUsingDemoData() && isTemporaryAvatarUrl(form.avatarUrl)) {
      wx.showToast({ title: '头像尚未上传，请重新选择', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const result = await api.updateUserProfile(form)
      const app = getApp()
      if (app.globalData && result && result.user) {
        app.globalData.userProfile = result.user
      }
      wx.hideLoading()
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})

function isTemporaryAvatarUrl(url) {
  const value = String(url || '').toLowerCase()
  return value.startsWith('wxfile://')
    || value.startsWith('http://tmp/')
    || value.startsWith('https://tmp/')
    || value.includes('/tmp_')
}

function isUsingDemoData() {
  const app = getApp()
  return !!(app.globalData && app.globalData.useDemoData)
}

function buildAvatarCloudPath(filePath) {
  const cleanPath = String(filePath || '').split('?')[0]
  const extensionMatch = cleanPath.match(/\.([a-z0-9]+)$/i)
  const extension = extensionMatch && ['jpg', 'jpeg', 'png', 'webp'].includes(extensionMatch[1].toLowerCase())
    ? extensionMatch[1].toLowerCase()
    : 'jpg'
  return `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
}

function getGenderIndex(value) {
  const index = genderOptions.findIndex((item) => item.value === value)
  return index >= 0 ? index : 0
}

function getGenderLabel(value) {
  const option = genderOptions.find((item) => item.value === value)
  return option ? option.label : ''
}

function getToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
