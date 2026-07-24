const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('production API cloud failure is surfaced and never falls back to demo data', async () => {
  let demoCalls = 0
  let cloudCalls = 0
  const app = {
    globalData: {
      currentFamilyId: 'family-production',
      openid: 'production-user',
      useDemoData: false,
    },
    async ensureLogin() {
      return { openid: 'production-user' }
    },
  }
  const api = loadCjsModule(path.join(root, 'miniprogram/services/api.js'), {
    stubs: {
      './demo-data': {
        getHome() {
          demoCalls += 1
          return { source: 'demo' }
        },
      },
    },
    globals: {
      console: createSilentConsole(),
      getApp: () => app,
      wx: {
        cloud: {
          async callFunction() {
            cloudCalls += 1
            throw new Error('cloud.callFunction:fail timeout')
          },
        },
      },
    },
  })

  await assert.rejects(api.getHome())
  assert.equal(cloudCalls, 1)
  assert.equal(demoCalls, 0)
})

test('application bootstrap does not switch a production login failure to test identity', async () => {
  let appDefinition
  const cloudError = new Error('cloud login unavailable')
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      console: createSilentConsole(),
      App(definition) {
        appDefinition = definition
      },
      wx: {
        cloud: {
          async callFunction() {
            throw cloudError
          },
          init() {},
        },
        login({ success }) {
          success({ code: 'test-code' })
        },
        showModal() {},
      },
    },
  })

  assert.ok(appDefinition)
  assert.equal(appDefinition.globalData.useDemoData, false)
  await assert.rejects(appDefinition.bootstrap.call(appDefinition), cloudError)
  assert.equal(appDefinition.globalData.loginStatus, 'failed')
  assert.notEqual(appDefinition.globalData.loginMode, 'test')
  assert.equal(appDefinition.globalData.openid, '')
})

test('development version waits for an explicit authorization before creating its mock user', async () => {
  let appDefinition
  let wxLoginCalls = 0
  let cloudCalls = 0
  let cloudInitCalls = 0
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      console: createSilentConsole(),
      App(definition) {
        appDefinition = definition
      },
      wx: {
        getAccountInfoSync() {
          return { miniProgram: { envVersion: 'develop' } }
        },
        login() {
          wxLoginCalls += 1
        },
        cloud: {
          init() {
            cloudInitCalls += 1
          },
          async callFunction() {
            cloudCalls += 1
          },
        },
      },
    },
  })

  appDefinition.onLaunch.call(appDefinition)
  assert.equal(appDefinition.globalData.useDemoData, true)
  assert.equal(appDefinition.globalData.envId, '')
  assert.equal(appDefinition.globalData.loginMode, '')
  assert.equal(appDefinition.globalData.openid, '')
  assert.equal(wxLoginCalls, 0)
  assert.equal(cloudCalls, 0)
  assert.equal(cloudInitCalls, 0)

  const login = await appDefinition.authorizeLogin.call(appDefinition, {
    nickname: 'Tester',
    avatarUrl: 'https://example.com/avatar.jpg',
  })

  assert.equal(appDefinition.globalData.loginMode, 'test')
  assert.equal(login.openid, 'devtools-openid')
  assert.equal(login.user.nickname, 'Tester')
  assert.equal(login.user.avatarUrl, 'https://example.com/avatar.jpg')
  assert.equal(wxLoginCalls, 0)
  assert.equal(cloudCalls, 0)
})

test('trial version silently restores an existing CloudBase user on launch', async () => {
  let appDefinition
  let cloudCalls = 0
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      console: createSilentConsole(),
      App(definition) {
        appDefinition = definition
      },
      wx: {
        getAccountInfoSync() {
          return { miniProgram: { envVersion: 'trial' } }
        },
        login({ success }) {
          success({ code: 'restore-code' })
        },
        cloud: {
          init() {},
          async callFunction(options) {
            cloudCalls += 1
            assert.equal(options.data.profile, undefined)
            return {
              result: {
                openid: 'existing-user',
                user: { nickname: '已有用户' },
                currentFamilyId: 'existing-family',
              },
            }
          },
        },
      },
    },
  })

  appDefinition.onLaunch.call(appDefinition)
  assert.ok(appDefinition.restoreLoginPromise)
  assert.equal(await appDefinition.restoreLoginPromise, true)

  assert.equal(appDefinition.globalData.openid, 'existing-user')
  assert.equal(appDefinition.globalData.currentFamilyId, 'existing-family')
  assert.equal(appDefinition.globalData.loginMode, 'cloud')
  assert.equal(cloudCalls, 1)
})

test('release version keeps a new user as guest, then forwards the native authorized profile', async () => {
  let appDefinition
  let wxLoginCalls = 0
  let cloudCalls = 0
  let loginPayload
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      console: createSilentConsole(),
      App(definition) {
        appDefinition = definition
      },
      wx: {
        getAccountInfoSync() {
          return { miniProgram: { envVersion: 'release' } }
        },
        login({ success }) {
          wxLoginCalls += 1
          success({ code: 'release-code' })
        },
        cloud: {
          init() {},
          async callFunction(options) {
            cloudCalls += 1
            loginPayload = options
            if (!options.data.profile) {
              throw new Error('authorized user profile is required')
            }
            return {
              result: {
                openid: 'release-user',
                user: { nickname: '正式用户' },
                currentFamilyId: 'release-family',
              },
            }
          },
        },
      },
    },
  })

  appDefinition.onLaunch.call(appDefinition)
  assert.equal(await appDefinition.restoreLoginPromise, false)
  assert.equal(appDefinition.globalData.useDemoData, false)
  assert.equal(appDefinition.globalData.loginMode, '')
  assert.equal(appDefinition.globalData.openid, '')
  assert.equal(appDefinition.globalData.loginStatus, 'idle')
  assert.equal(wxLoginCalls, 0)
  assert.equal(cloudCalls, 1)

  const profile = {
    nickname: 'Release User',
    avatarUrl: 'https://example.com/release-avatar.jpg',
    gender: 'female',
  }
  const login = await appDefinition.requestLogin.call(appDefinition, profile)

  assert.equal(appDefinition.globalData.loginMode, 'cloud')
  assert.equal(login.openid, 'release-user')
  assert.equal(wxLoginCalls, 0)
  assert.equal(cloudCalls, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(loginPayload.data)), { profile })
})

test('resetting a deleted account clears its stale family session before a new profile login', async () => {
  let appDefinition
  let cloudCalls = 0
  loadCjsModule(path.join(root, 'miniprogram/app.js'), {
    globals: {
      console: createSilentConsole(),
      App(definition) {
        appDefinition = definition
      },
      wx: {
        getAccountInfoSync() {
          return { miniProgram: { envVersion: 'release' } }
        },
        cloud: {
          init() {},
          async callFunction(options) {
            cloudCalls += 1
            return {
              result: {
                openid: 'new-user',
                user: { nickname: options.data.profile.nickname },
                currentFamilyId: 'new-family',
              },
            }
          },
        },
      },
    },
  })

  appDefinition.globalData.openid = 'deleted-user'
  appDefinition.globalData.currentFamilyId = 'deleted-family'
  appDefinition.globalData.userProfile = { nickname: '旧用户' }
  appDefinition.globalData.loginStatus = 'success'
  appDefinition.globalData.loginMode = 'cloud'
  appDefinition.resetLogin.call(appDefinition)

  assert.equal(appDefinition.globalData.openid, '')
  assert.equal(appDefinition.globalData.currentFamilyId, '')
  assert.equal(appDefinition.globalData.userProfile, null)
  assert.equal(appDefinition.globalData.loginStatus, 'idle')
  const login = await appDefinition.requestLogin.call(appDefinition, {
    nickname: '新用户',
    avatarPreset: 'sprout',
  })
  assert.equal(login.openid, 'new-user')
  assert.equal(login.currentFamilyId, 'new-family')
  assert.equal(cloudCalls, 1)
})

function createSilentConsole() {
  return {
    error() {},
    log() {},
    warn() {},
  }
}
