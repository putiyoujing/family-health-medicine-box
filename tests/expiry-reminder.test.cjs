const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadExpiryReminderPage({ getHome, updateUserProfile }) {
  let pageDefinition
  const toasts = []
  const app = { globalData: { userProfile: null } }
  const api = {
    getHome: getHome || (async () => ({ user: {} })),
    updateUserProfile: updateUserProfile || (async (payload) => ({ user: payload })),
  }

  loadCjsModule(path.join(root, 'miniprogram/pages/profile/expiry-reminder.js'), {
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
        showToast(options) {
          toasts.push(options)
        },
      },
    },
  })

  return { app, page: createPageInstance(pageDefinition), toasts }
}

test('expiry reminder saves a preset or a valid custom day count', async () => {
  const payloads = []
  const { app, page } = loadExpiryReminderPage({
    getHome: async () => ({ user: { expiryReminderDays: 60 } }),
    updateUserProfile: async (payload) => {
      payloads.push(payload)
      return { user: payload }
    },
  })

  await page.load()
  assert.equal(page.data.reminderDays, 60)
  page.selectReminderDays({ currentTarget: { dataset: { value: 30 } } })
  await page.save()
  assert.deepEqual(Object.keys(payloads[0]), ['expiryReminderDays'])
  assert.equal(payloads[0].expiryReminderDays, 30)

  page.onCustomDaysInput({ detail: { value: '45' } })
  await page.save()
  assert.deepEqual(Object.keys(payloads[1]), ['expiryReminderDays'])
  assert.equal(payloads[1].expiryReminderDays, 45)
  assert.equal(app.globalData.userProfile.expiryReminderDays, 45)
})

test('expiry reminder rejects invalid custom days and dashboard consumes the saved setting', async () => {
  let saveCalls = 0
  const { page } = loadExpiryReminderPage({
    updateUserProfile: async () => {
      saveCalls += 1
      return { user: {} }
    },
  })

  page.onCustomDaysInput({ detail: { value: '0' } })
  await page.save()
  assert.equal(saveCalls, 0)
  assert.equal(page.data.customError, '请输入 1-365 之间的整数天数')

  const dashboardSource = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.js'), 'utf8')
  const dashboardTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.wxml'), 'utf8')
  const medicineSource = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/index.js'), 'utf8')
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')
  assert.match(dashboardSource, /daysUntil\(item\.expireDate\) <= expiryReminderDays/)
  assert.match(dashboardTemplate, /{{expiryReminderDays}} 天内到期药品/)
  assert.match(medicineSource, /expireDays <= expiryReminderDays/)
  assert.match(cloudSource, /hasOwnProperty\.call\(payload, 'expiryReminderDays'\)/)
})
