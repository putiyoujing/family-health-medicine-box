const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadProfilePage({ getHome, useDemoData, updateUserProfile, uploadFile }) {
  let pageDefinition
  const toasts = []
  const app = {
    globalData: {
      useDemoData,
      userProfile: null,
    },
  }
  const api = {
    getHome: getHome || (async () => ({ user: {} })),
    updateUserProfile: updateUserProfile || (async (payload) => ({ user: payload })),
  }

  loadCjsModule(path.join(root, 'miniprogram/pages/profile/info.js'), {
    stubs: {
      '../../services/api': api,
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      getApp: () => app,
      Page: (definition) => {
        pageDefinition = definition
      },
      setTimeout: () => 0,
      wx: {
        cloud: {
          uploadFile: uploadFile || (async () => ({ fileID: 'cloud://avatar-file' })),
        },
        hideLoading() {},
        navigateBack() {},
        showLoading() {},
        showToast(options) {
          toasts.push(options)
        },
      },
    },
  })

  return {
    app,
    page: createPageInstance(pageDefinition),
    toasts,
  }
}

function loadLowStockPage({ getHome, updateUserProfile }) {
  let pageDefinition
  const app = {
    globalData: {
      userProfile: null,
    },
  }
  const api = {
    getHome: getHome || (async () => ({ user: {} })),
    updateUserProfile: updateUserProfile || (async (payload) => ({ user: payload })),
  }

  loadCjsModule(path.join(root, 'miniprogram/pages/profile/low-stock.js'), {
    stubs: {
      '../../services/api': api,
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      getApp: () => app,
      Page: (definition) => {
        pageDefinition = definition
      },
      setTimeout: () => 0,
      wx: {
        hideLoading() {},
        navigateBack() {},
        showLoading() {},
        showToast() {},
      },
    },
  })

  return {
    app,
    page: createPageInstance(pageDefinition),
  }
}

test('guest profile keeps a default avatar beside the login entry', () => {
  const source = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.wxml'), 'utf8')

  assert.match(source, /wx:else class="account-card guest-account-card"[\s\S]*class="account-avatar guest-avatar"/)
  assert.match(source, /class="guest-avatar-icon" src="\/assets\/tabbar\/user-default\.png"/)
})

test('demo mode lets the user choose and save a preview avatar', async () => {
  let savedProfile
  let uploadCalls = 0
  const { page, toasts } = loadProfilePage({
    useDemoData: true,
    getHome: async () => ({ user: savedProfile || {} }),
    updateUserProfile: async (payload) => {
      savedProfile = { ...payload }
      return { user: payload }
    },
    uploadFile: async () => {
      uploadCalls += 1
      return { fileID: 'cloud://should-not-upload' }
    },
  })

  await page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/demo-avatar.jpg' } })
  assert.equal(page.data.form.avatarUrl, 'wxfile://tmp/demo-avatar.jpg')
  assert.equal(uploadCalls, 0)
  assert.equal(toasts.at(-1).title, '头像已更换')

  page.setData({
    'form.nickname': '守护者·TEST01',
    'form.avatarUrl': 'wxfile://tmp/demo-avatar.jpg',
  })
  await page.save()
  assert.equal(savedProfile.avatarUrl, 'wxfile://tmp/demo-avatar.jpg')

  page.setData({ 'form.avatarUrl': '' })
  await page.load()
  assert.equal(page.data.form.avatarUrl, 'wxfile://tmp/demo-avatar.jpg')
})

test('cloud mode uploads the selected avatar before saving it', async () => {
  let uploadedFile
  const { page, toasts } = loadProfilePage({
    useDemoData: false,
    uploadFile: async (options) => {
      uploadedFile = options
      return { fileID: 'cloud://env.avatar-bucket/avatar.jpg' }
    },
  })

  await page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/avatar.png' } })

  assert.equal(uploadedFile.filePath, 'wxfile://tmp/avatar.png')
  assert.match(uploadedFile.cloudPath, /^avatars\/.+\.png$/)
  assert.equal(page.data.form.avatarUrl, 'cloud://env.avatar-bucket/avatar.jpg')
  assert.equal(toasts.at(-1).title, '头像已上传')
})

test('cloud upload failure keeps the current avatar and shows a failure message', async () => {
  const { page, toasts } = loadProfilePage({
    useDemoData: false,
    uploadFile: async () => {
      throw new Error('网络连接失败')
    },
  })
  page.setData({ 'form.avatarUrl': 'cloud://env.avatar-bucket/original.jpg' })

  await page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/new-avatar.jpg' } })

  assert.equal(page.data.form.avatarUrl, 'cloud://env.avatar-bucket/original.jpg')
  assert.equal(toasts.at(-1).title, '网络连接失败')
  assert.equal(toasts.at(-1).icon, 'none')
})

test('low-stock reminder is a compact other-service setting and the dashboard consumes it', async () => {
  let savedPayload
  const { app, page } = loadLowStockPage({
    getHome: async () => ({ user: { lowStockThreshold: 25 } }),
    updateUserProfile: async (payload) => {
      savedPayload = payload
      return { user: payload }
    },
  })

  await page.load()
  assert.equal(page.data.threshold, 25)
  page.selectThreshold({ currentTarget: { dataset: { value: 20 } } })
  assert.equal(page.data.threshold, 20)
  await page.save()
  assert.equal(savedPayload.lowStockThreshold, 20)
  assert.deepEqual(Object.keys(savedPayload), ['lowStockThreshold'])
  assert.equal(app.globalData.userProfile.lowStockThreshold, 20)

  const dashboardSource = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.js'), 'utf8')
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')
  const profileInfoSource = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/info.wxml'), 'utf8')
  const profileSource = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/index.wxml'), 'utf8')
  assert.match(dashboardSource, /lowStockThreshold \/ 100/)
  assert.match(cloudSource, /hasOwnProperty\.call\(payload, 'lowStockThreshold'\)/)
  assert.doesNotMatch(profileInfoSource, /低库存提醒/)
  assert.doesNotMatch(profileSource, /class="service-shortcut"/)
  assert.match(profileSource, /class="service-item" bindtap="openLowStockSettings"/)
})
