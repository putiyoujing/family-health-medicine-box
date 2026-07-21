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

test('development version can use mock login without calling WeChat login or cloud', async () => {
  let appDefinition
  let wxLoginCalls = 0
  let cloudCalls = 0
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
          init() {},
          async callFunction() {
            cloudCalls += 1
          },
        },
      },
    },
  })

  appDefinition.onLaunch.call(appDefinition)
  const login = await appDefinition.loginPromise

  assert.equal(appDefinition.globalData.useDemoData, true)
  assert.equal(appDefinition.globalData.loginMode, 'test')
  assert.equal(login.openid, 'devtools-openid')
  assert.equal(wxLoginCalls, 0)
  assert.equal(cloudCalls, 0)
})

test('release version ignores the development mock login switch', async () => {
  let appDefinition
  let wxLoginCalls = 0
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
        login({ success }) {
          wxLoginCalls += 1
          success({ code: 'release-code' })
        },
        cloud: {
          init() {},
          async callFunction() {
            cloudCalls += 1
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
  const login = await appDefinition.loginPromise

  assert.equal(appDefinition.globalData.useDemoData, false)
  assert.equal(appDefinition.globalData.loginMode, 'cloud')
  assert.equal(login.openid, 'release-user')
  assert.equal(wxLoginCalls, 1)
  assert.equal(cloudCalls, 1)
})

function createSilentConsole() {
  return {
    error() {},
    log() {},
    warn() {},
  }
}
