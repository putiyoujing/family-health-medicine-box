const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const tabPages = [
  'pages/dashboard/index.js',
  'pages/illness/index.js',
  'pages/medicines/index.js',
  'pages/medication/index.js',
  'pages/profile/index.js',
]

test('getHome reuses recent data and invalidates it after a successful mutation', async () => {
  let getHomeCalls = 0
  const app = {
    globalData: {
      currentFamilyId: 'family-a',
      useDemoData: true,
    },
    async ensureLogin() {},
  }
  const api = loadCjsModule(path.join(root, 'miniprogram/services/api.js'), {
    stubs: {
      './demo-data': {
        getHome() {
          getHomeCalls += 1
          return { family: { _id: app.globalData.currentFamilyId }, version: getHomeCalls }
        },
        saveMedicine() {
          return { id: 'medicine-a' }
        },
        redeemMembershipCode() {
          return { status: 'active' }
        },
      },
    },
    globals: {
      getApp: () => app,
      wx: {},
    },
  })

  const first = await api.getHome()
  const second = await api.getHome()

  assert.equal(getHomeCalls, 1)
  assert.strictEqual(second, first)
  assert.equal(api.isHomeCacheFresh(), true)

  await api.saveMedicine({ name: '退热药' })
  assert.equal(api.isHomeCacheFresh(), false)

  const refreshed = await api.getHome()
  assert.equal(getHomeCalls, 2)
  assert.equal(refreshed.version, 2)

  await api.redeemMembershipCode({ code: 'TEST' })
  assert.equal(api.isHomeCacheFresh(), false)
  await api.getHome()
  assert.equal(getHomeCalls, 3)

  app.globalData.currentFamilyId = 'family-b'
  await api.getHome()
  assert.equal(getHomeCalls, 4)
})

test('dashboard refreshes and medicine tab synchronizes local data from a fresh shared cache', () => {
  for (const relativeFile of tabPages) {
    let pageDefinition
    let loadCalls = 0
    const app = { globalData: {} }
    const api = {
      isHomeCacheFresh: () => true,
    }

    loadCjsModule(path.join(root, 'miniprogram', relativeFile), {
      stubs: {
        '../../services/api': api,
      },
      globals: {
        getApp: () => app,
        Page(definition) {
          pageDefinition = definition
        },
        wx: {},
      },
    })

    const page = createPageInstance(pageDefinition)
    page.homeLoaded = true
    page.load = (options) => {
      loadCalls += 1
      page.loadOptions = options
    }
    page.loadHome = page.load
    page.onShow()

    const shouldReload = ['pages/dashboard/index.js', 'pages/medicines/index.js'].includes(relativeFile)
    assert.equal(loadCalls, shouldReload ? 1 : 0, relativeFile)
    if (relativeFile === 'pages/medicines/index.js') {
      assert.equal(page.loadOptions && page.loadOptions.silent, true)
    }
  }
})

test('loaded tab pages request a silent refresh after the shared cache expires', () => {
  for (const relativeFile of tabPages) {
    let pageDefinition
    let loadOptions
    const app = { globalData: {} }
    const api = {
      isHomeCacheFresh: () => false,
    }

    loadCjsModule(path.join(root, 'miniprogram', relativeFile), {
      stubs: {
        '../../services/api': api,
      },
      globals: {
        getApp: () => app,
        Page(definition) {
          pageDefinition = definition
        },
        wx: {},
      },
    })

    const page = createPageInstance(pageDefinition)
    page.homeLoaded = true
    page.load = (options) => {
      loadOptions = options
    }
    page.loadHome = page.load
    page.onShow()

    assert.equal(loadOptions && loadOptions.silent, true, relativeFile)
  }
})
