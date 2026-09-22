const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const componentPath = path.join(root, 'miniprogram/components/global-auth-layer/index.js')

test('login uses the official global layer and direct native profile controls without phone authorization', () => {
  const appConfig = readJson('miniprogram/app.json')
  const componentConfig = readJson('miniprogram/components/global-auth-layer/index.json')
  const template = read('miniprogram/components/global-auth-layer/index.wxml')
  const styles = read('miniprogram/components/global-auth-layer/index.wxss')
  const componentSource = read('miniprogram/components/global-auth-layer/index.js')
  const profileTemplate = read('miniprogram/pages/profile/index.wxml')

  assert.equal(appConfig.pages.includes('pages/login/index'), false)
  assert.equal(appConfig.usingComponents['global-auth-layer'], '/components/global-auth-layer/index')
  assert.deepEqual(componentConfig.usingComponents || {}, {})
  assert.match(template, /wx:if="{{privacyVisible}}"[\s\S]+class="auth-overlay auth-overlay-center"/)
  assert.match(template, /wx:if="{{loginVisible}}"[\s\S]+class="auth-overlay auth-overlay-bottom"/)
  assert.doesNotMatch(template, /mp-dialog|mp-half-screen-dialog|weui-miniprogram/)
  assert.match(template, /open-type="agreePrivacyAuthorization"/)
  assert.doesNotMatch(template, /class="auth-dialog[^>]+catchtap=/)
  assert.doesNotMatch(template, /buttons="{{loginButtons}}"/)
  assert.match(template, /<view class="auth-login-actions">[\s\S]+>拒绝<\/button>[\s\S]+>允许<\/button>/)
  assert.match(template, /<button[\s\S]+class="avatar-row"[\s\S]+open-type="chooseAvatar"[\s\S]+bindchooseavatar="onChooseAvatar"/)
  assert.match(template, /<view class="avatar-value"[^>]*>[\s\S]+class="avatar-preview"[\s\S]+class="field-arrow"/)
  assert.match(styles, /\.avatar-row\s*,\s*\.nickname-row\s*{[^}]*width:\s*100%;[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/)
  assert.match(styles, /\.avatar-value\s*{[^}]*margin-left:\s*auto;[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/)
  assert.match(template, /<view class="nickname-row">[\s\S]+<input[^>]+type="nickname"[\s\S]+bindinput="onNicknameInput"[\s\S]+bindnicknamereview="onNicknameReview"/)
  assert.match(template, /bind:tap="onLoginButtonTap"/)
  assert.match(componentSource, /currentTarget[\s\S]+dataset[\s\S]+value/)
  assert.match(
    styles,
    /\.avatar-value\s*{[^}]*margin-left:\s*auto;[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/,
  )
  assert.match(styles, /\.auth-overlay\s*{[^}]*position:\s*fixed;[^}]*z-index:\s*1000;/)
  assert.match(styles, /\.login-sheet\s*{[^}]*padding-top:\s*36rpx;[^}]*padding-right:\s*32rpx;[^}]*padding-left:\s*32rpx;[^}]*env\(safe-area-inset-bottom\)/)
  assert.match(styles, /\.login-sheet \.field-label\s*{[^}]*margin:\s*0;[^}]*font-size:\s*32rpx;/)
  assert.match(styles, /\.login-sheet \.avatar-row\s*,\s*\.login-sheet \.nickname-row\s*{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/)
  assert.match(styles, /\.login-sheet \.nickname-input\s*{[^}]*padding:\s*0;[^}]*background:\s*transparent;/)
  assert.match(styles, /\.login-sheet-header > view:first-child\s*{[^}]*flex:\s*1;[^}]*min-width:\s*0;/)
  assert.match(styles, /\.login-sheet-header \.auth-close\s*{[^}]*min-width:\s*56rpx;[^}]*max-width:\s*56rpx;[^}]*flex:\s*0 0 56rpx;[^}]*padding:\s*0;[^}]*line-height:\s*56rpx;/)
  assert.doesNotMatch(template, /<mp-form|<mp-cells|<mp-cell/)
  assert.doesNotMatch(template, /getPhoneNumber|手机号|随机头像昵称/)
  assert.match(profileTemplate, /<global-auth-layer id="global-auth-layer"/)
})

test('development login keeps the exact nickname and avatar shown in the demo home', () => {
  let appDefinition
  const cache = new Map()

  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    cache,
    globals: {
      App(definition) {
        appDefinition = definition
      },
    },
  })

  const app = {
    ...appDefinition,
    globalData: JSON.parse(JSON.stringify(appDefinition.globalData)),
  }
  app.useTestLogin('profile-test', {
    nickname: '我填写的昵称',
    avatarUrl: 'wxfile://chosen-avatar.jpg',
    avatarPreset: '',
  })

  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'), { cache })
  const home = demo.getHome()
  assert.equal(home.user.nickname, '我填写的昵称')
  assert.equal(home.user.avatarUrl, 'wxfile://chosen-avatar.jpg')
})

test('privacy approval, avatar choice and nickname submission resolve the same protected action', async () => {
  let componentDefinition
  let privacyResolve
  let authorizedProfile
  let uploadOptions
  const tabMaskValues = []
  const app = {
    globalData: { openid: '', useDemoData: false },
    requestPrivacyAuthorization(layer) {
      layer.showPrivacyDialog()
      return new Promise((resolve) => {
        privacyResolve = resolve
      })
    },
    resolvePrivacyAuthorization(granted) {
      privacyResolve(granted)
    },
  }

  loadCjsModule(componentPath, {
    stubs: {
      '../../utils/operation-guards': {
        async requestWechatLogin(profile) {
          authorizedProfile = profile
          app.globalData.openid = 'openid-001'
          return true
        },
      },
    },
    globals: {
      console: { error() {}, log() {}, warn() {} },
      Component(definition) {
        componentDefinition = definition
      },
      getApp: () => app,
      getCurrentPages: () => [{
        getTabBar() {
          return {
            setData({ authMaskVisible }) {
              tabMaskValues.push(authMaskVisible)
            },
          }
        },
      }],
      wx: {
        cloud: {
          async uploadFile(options) {
            uploadOptions = options
            return { fileID: 'cloud://family-health-prod/avatar.jpg' }
          },
        },
        showToast() {},
      },
    },
  })

  const component = createComponentInstance(componentDefinition)
  const openResult = component.open()
  assert.deepEqual(tabMaskValues, [true])
  assert.equal(component.data.privacyVisible, true)
  assert.equal(component.data.loginVisible, false)

  component.onPrivacyAgree()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(component.data.privacyVisible, false)
  assert.equal(component.data.loginVisible, true)

  component.onChooseAvatar({ detail: { avatarUrl: 'wxfile://avatar.jpg' } })
  component.onNicknameInput({ detail: { value: 'Alice' } })
  assert.equal(await component.onLoginButtonTap({
    currentTarget: {
      dataset: {
        value: 'confirm',
      },
    },
  }), true)
  assert.equal(await openResult, true)

  assert.equal(uploadOptions.filePath, 'wxfile://avatar.jpg')
  assert.match(uploadOptions.cloudPath, /^avatars\//)
  assert.deepEqual(JSON.parse(JSON.stringify(authorizedProfile)), {
    nickname: 'Alice',
    avatarUrl: 'cloud://family-health-prod/avatar.jpg',
    avatarPreset: '',
  })
  assert.equal(component.data.loginVisible, false)
  assert.deepEqual(tabMaskValues, [true, false])
})

test('default official profile flow only requires a nickname and keeps the sheet open after upload failure', async () => {
  let componentDefinition
  let loginCalls = 0
  const toasts = []

  loadCjsModule(componentPath, {
    stubs: {
      '../../utils/operation-guards': {
        async requestWechatLogin() {
          loginCalls += 1
          return true
        },
      },
    },
    globals: {
      console: { error() {}, log() {}, warn() {} },
      Component(definition) {
        componentDefinition = definition
      },
      getApp: () => ({ globalData: { openid: '', useDemoData: false } }),
      wx: {
        cloud: {
          async uploadFile() {
            throw new Error('upload unavailable')
          },
        },
        showToast(options) {
          toasts.push(options.title)
        },
      },
    },
  })

  const component = createComponentInstance(componentDefinition)
  component.setData({
    loginVisible: true,
    nickname: '保留昵称',
    avatarUrl: 'wxfile://keep-avatar.jpg',
  })

  assert.equal(await component.confirmLogin({ detail: { value: { nickname: '保留昵称' } } }), false)
  assert.equal(component.data.loginVisible, true)
  assert.equal(component.data.nickname, '保留昵称')
  assert.equal(component.data.avatarUrl, 'wxfile://keep-avatar.jpg')
  assert.equal(loginCalls, 0)
  assert.deepEqual(toasts, ['头像上传失败，请稍后重试'])

  component.setData({ avatarUrl: '', avatarPreset: 'sprout' })
  assert.equal(await component.confirmLogin({ detail: { value: { nickname: '保留昵称' } } }), true)
  assert.equal(loginCalls, 1)
})

test('privacy authorization is coordinated once at app level with the official agree event', async () => {
  let appDefinition
  let privacyListener
  let privacyResult
  let showPrivacyCalls = 0

  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      App(definition) {
        appDefinition = definition
      },
      console: { error() {}, log() {}, warn() {} },
      wx: {
        cloud: {
          init() {},
        },
        getAccountInfoSync() {
          return { miniProgram: { envVersion: 'develop' } }
        },
        onNeedPrivacyAuthorization(listener) {
          privacyListener = listener
        },
        requirePrivacyAuthorize(options) {
          privacyListener((result) => {
            privacyResult = result
            if (result.event === 'agree') {
              options.success()
            } else {
              options.fail()
            }
          })
        },
      },
    },
  })

  appDefinition.onLaunch.call(appDefinition)
  const authorization = appDefinition.requestPrivacyAuthorization.call(appDefinition, {
    showPrivacyDialog() {
      showPrivacyCalls += 1
    },
  })
  assert.equal(showPrivacyCalls, 1)

  appDefinition.resolvePrivacyAuthorization.call(appDefinition, true)
  assert.equal(await authorization, true)
  assert.deepEqual(JSON.parse(JSON.stringify(privacyResult)), {
    event: 'agree',
    buttonId: 'privacy-agree-button',
  })
})

test('detaching an auth layer restores only its own tab and releases its privacy request', async () => {
  let app
  let definition
  let currentPage
  let privacyListener
  const requests = []
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      App(value) { app = value },
      wx: {
        onNeedPrivacyAuthorization(listener) { privacyListener = listener },
        requirePrivacyAuthorize(options) {
          requests.push(options)
          privacyListener(() => {})
        },
      },
    },
  })
  app.registerPrivacyAuthorization()
  loadCjsModule(componentPath, {
    stubs: { '../../utils/operation-guards': { async requestWechatLogin() { return true } } },
    globals: {
      Component(value) { definition = value },
      getApp: () => app,
      getCurrentPages: () => [currentPage],
      wx: { showToast() {} },
    },
  })
  const oldTab = { setData(value) { this.hidden = value.authMaskVisible } }
  const newTab = { hidden: true, setData(value) { this.hidden = value.authMaskVisible } }
  currentPage = { getTabBar: () => oldTab }
  const oldLayer = createComponentInstance(definition)
  const oldRequest = oldLayer.open()
  assert.equal(oldTab.hidden, true)
  assert.equal(oldLayer.data.privacyVisible, true)
  currentPage = { getTabBar: () => newTab }
  definition.lifetimes.detached.call(oldLayer)
  assert.equal(await oldRequest, false)
  assert.equal(oldTab.hidden, false)
  assert.equal(newTab.hidden, true)
  assert.equal(app.privacyRequestPromise, null)
  assert.equal(app.activeAuthLayer, null)

  const newLayer = createComponentInstance(definition)
  const newRequest = newLayer.open()
  assert.equal(newLayer.data.privacyVisible, true)
  requests[0].fail()
  assert.equal(app.activeAuthLayer, newLayer)
  assert.ok(app.privacyRequestPromise)
  newLayer.onPrivacyReject()
  assert.equal(await newRequest, false)
  assert.equal(newTab.hidden, false)
})

test('profile login entry waits for the global layer and refreshes the current page without navigation', () => {
  const script = read('miniprogram/pages/profile/index.js')

  assert.match(script, /async login\(\)/)
  assert.match(script, /await ensureLoginReady\(\)/)
  assert.match(script, /await this\.load\(\{ force: true \}\)/)
  assert.doesNotMatch(script, /pages\/login\/index/)
})

test('dashboard refreshes immediately after the global login layer succeeds', () => {
  const authLayerScript = read('miniprogram/components/global-auth-layer/index.js')
  const dashboardTemplate = read('miniprogram/pages/dashboard/index.wxml')
  const dashboardScript = read('miniprogram/pages/dashboard/index.js')

  assert.match(authLayerScript, /this\.triggerEvent\('loginsuccess'\)/)
  assert.match(
    dashboardTemplate,
    /<global-auth-layer id="global-auth-layer" bindloginsuccess="handleLoginSuccess" \/>/,
  )
  assert.match(
    dashboardScript,
    /async handleLoginSuccess\(\)\s*\{\s*await this\.loadHome\(\{ force: true \}\)\s*\}/,
  )
})

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function createComponentInstance(definition) {
  const instance = {
    ...definition.methods,
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(patch) {
      Object.assign(this.data, patch || {})
    },
  }
  return instance
}
