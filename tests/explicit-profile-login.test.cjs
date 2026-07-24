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
  const profileTemplate = read('miniprogram/pages/profile/index.wxml')

  assert.equal(appConfig.pages.includes('pages/login/index'), false)
  assert.deepEqual(appConfig.useExtendedLib, { weui: true })
  assert.equal(appConfig.usingComponents['global-auth-layer'], '/components/global-auth-layer/index')
  assert.equal(componentConfig.usingComponents['mp-dialog'], 'weui-miniprogram/dialog/dialog')
  assert.equal(
    componentConfig.usingComponents['mp-half-screen-dialog'],
    'weui-miniprogram/half-screen-dialog/half-screen-dialog',
  )
  assert.match(template, /<mp-dialog/)
  assert.match(template, /<mp-half-screen-dialog/)
  assert.equal((template.match(/root-portal="{{true}}"/g) || []).length, 2)
  assert.match(template, /<mp-dialog[\s\S]+wx:if="{{privacyVisible}}"/)
  assert.match(template, /<mp-half-screen-dialog[\s\S]+wx:if="{{loginVisible}}"/)
  assert.match(template, /open-type="agreePrivacyAuthorization"/)
  assert.match(template, /<button[\s\S]+class="avatar-row"[\s\S]+open-type="chooseAvatar"/)
  assert.match(template, /<view class="avatar-value"[^>]*>[\s\S]+class="avatar-preview"[\s\S]+class="field-arrow"/)
  assert.match(template, /class="avatar-row"[\s\S]+style="[^"]*width:\s*100%;[^"]*justify-content:\s*space-between;/)
  assert.match(template, /class="avatar-value"[\s\S]+style="[^"]*margin-left:\s*auto;[^"]*justify-content:\s*flex-end;/)
  assert.match(template, /<input[^>]+type="nickname"/)
  assert.match(template, /buttons="{{loginButtons}}"/)
  assert.match(template, /bindbuttontap="onLoginButtonTap"/)
  assert.match(
    styles,
    /\.avatar-value\s*{[^}]*margin-left:\s*auto;[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/,
  )
  assert.doesNotMatch(template, /<mp-form|<mp-cells|<mp-cell|slot="footer"/)
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
    detail: {
      item: {
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
