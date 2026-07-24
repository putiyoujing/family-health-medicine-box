const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('guest page loads stay silent while a protected action waits for the global login layer', async () => {
  let openCalls = 0
  const app = {
    globalData: { openid: '' },
  }
  const guards = loadGuards({
    app,
    layer: {
      async open() {
        openCalls += 1
        app.globalData.openid = 'openid-after-login'
        return true
      },
    },
  })

  assert.equal(await guards.ensureLoginReady({ silent: true }), false)
  assert.equal(openCalls, 0)

  assert.equal(await guards.ensureLoginReady(), true)
  assert.equal(openCalls, 1)
  assert.equal(app.globalData.openid, 'openid-after-login')
})

test('canceling the global login layer keeps the original operation blocked', async () => {
  const app = { globalData: { openid: '' } }
  const guards = loadGuards({
    app,
    layer: {
      async open() {
        return false
      },
    },
  })

  assert.equal(await guards.ensureLoginReady(), false)
  assert.equal(app.globalData.openid, '')
})

test('an in-flight silent restore is awaited before deciding whether to open the layer', async () => {
  let openCalls = 0
  const app = {
    globalData: { openid: '' },
  }
  app.restoreLoginPromise = Promise.resolve().then(() => {
    app.globalData.openid = 'restored-user'
    return true
  })
  const guards = loadGuards({
    app,
    layer: {
      async open() {
        openCalls += 1
        return true
      },
    },
  })

  assert.equal(await guards.ensureLoginReady(), true)
  assert.equal(openCalls, 0)
})

test('a page missing the global layer shows an actionable message without routing away', async () => {
  const toasts = []
  const app = { globalData: { openid: '' } }
  const guards = loadGuards({ app, layer: null, toasts })

  assert.equal(await guards.ensureLoginReady(), false)
  assert.deepEqual(toasts, ['当前页面暂不支持登录，请重新进入'])
})

function loadGuards({ app, layer, toasts = [] }) {
  return loadCjsModule(path.join(root, 'miniprogram/utils/operation-guards.js'), {
    globals: {
      getApp: () => app,
      getCurrentPages: () => [{
        selectComponent(selector) {
          assert.equal(selector, '#global-auth-layer')
          return layer
        },
      }],
      wx: {
        showToast(options) {
          toasts.push(options.title)
        },
      },
    },
  })
}
