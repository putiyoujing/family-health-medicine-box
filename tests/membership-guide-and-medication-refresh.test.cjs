const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('record medication refreshes the latest medicine box before checking readiness', async () => {
  let pageDefinition
  const getHomeCalls = []
  const readinessSnapshots = []
  const navigationUrls = []
  const latestHome = {
    family: { _id: 'family-a', role: 'owner' },
    members: [{ _id: 'member-a', name: '本人' }],
    medicines: [{ _id: 'medicine-a', name: '刚添加的药品' }],
    illnessRecords: [],
  }

  loadCjsModule(path.join(root, 'miniprogram/pages/medication/index.js'), {
    stubs: {
      '../../services/api': {
        getHome: async (options) => {
          getHomeCalls.push(options)
          return latestHome
        },
        isHomeCacheFresh: () => true,
        listMedicationHistory: async () => ({ logs: [] }),
      },
      '../../utils/format': { formatDateTime: () => '', memberName: () => '', medicineName: () => '' },
      '../../utils/operation-guards': {
        ensureLoginReady: async () => true,
        ensureMedicationReady: (home) => {
          readinessSnapshots.push(home)
          return home.medicines.length > 0
        },
      },
      '../../utils/tab-bar': { syncTabBar() {} },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      getApp: () => ({ globalData: {} }),
      wx: {
        navigateTo({ url }) {
          navigationUrls.push(url)
        },
        showToast() {},
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  page.setData({
    family: latestHome.family,
    members: latestHome.members,
    medicines: [],
    loggedIn: true,
    canEdit: true,
  })

  await page.createMedication()

  assert.equal(JSON.stringify(getHomeCalls), JSON.stringify([{ force: true }]))
  assert.equal(readinessSnapshots.length, 1)
  assert.equal(readinessSnapshots[0].medicines[0].name, '刚添加的药品')
  assert.deepEqual(navigationUrls, ['/pages/medication/form'])
})

test('medicine instructions textarea keeps its cursor above the keyboard and save bar', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/form.wxml'), 'utf8')
  const instructions = template.match(/<textarea[^>]+data-field="instructionText"[^>]*>/)?.[0] || ''

  assert.match(instructions, /adjust-position="\{\{true\}\}"/)
  assert.match(instructions, /cursor-spacing="140"/)
})

test('membership redemption guide is editable in admin and rendered from payment config', () => {
  const adminSource = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const paymentSource = fs.readFileSync(path.join(root, 'cloudfunctions/paymentApi/index.js'), 'utf8')
  const adminUi = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const membershipPage = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.js'), 'utf8')
  const membershipTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')

  assert.match(adminSource, /case 'getMembershipSettings':/)
  assert.match(adminSource, /case 'updateMembershipSettings':/)
  assert.match(adminSource, /collection\('app_configs'\)\.doc\('membership'\)/)
  assert.match(paymentSource, /membershipPurchaseGuide/)
  assert.match(paymentSource, /safeGetDoc\('app_configs', 'membership'\)/)
  assert.match(adminUi, /callAdminApi<MembershipSettings>\('getMembershipSettings'\)/)
  assert.match(adminUi, /callAdminApi<MembershipSettings>\('updateMembershipSettings'/)
  assert.match(membershipPage, /membershipPurchaseGuide:/)
  assert.match(membershipTemplate, /\{\{membershipPurchaseGuide\}\}/)
})

test('membership benefits show the upcoming AI assistance note below the comparison table', () => {
  const membershipTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')
  const membershipStyles = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxss'), 'utf8')
  const tableIndex = membershipTemplate.indexOf('class="comparison-table"')
  const noteIndex = membershipTemplate.indexOf('class="benefits-note"')

  assert.ok(tableIndex >= 0)
  assert.ok(noteIndex > tableIndex)
  assert.match(membershipTemplate, /AI 辅助功能将陆续上线，让健康记录与查询更便捷。/)
  assert.match(membershipStyles, /\.benefits-note\s*\{/)
  assert.match(membershipStyles, /\.benefits-note-mark\s*\{/)
})

test('membership guide refreshes before slower membership data without restoring plan prices', async () => {
  let pageDefinition
  let resolveMembership
  let resolveFamilies
  const storedValues = []
  const membershipPromise = new Promise((resolve) => {
    resolveMembership = resolve
  })
  const familiesPromise = new Promise((resolve) => {
    resolveFamilies = resolve
  })

  loadCjsModule(path.join(root, 'miniprogram/pages/membership/index.js'), {
    stubs: {
      '../../services/api': {
        getMembershipStatus: () => membershipPromise,
        getPlans: async () => ({
          membershipPurchaseGuide: '后台刚刚更新的兑换提示',
          plans: [{
            planId: 'monthly_pro',
            name: '月度会员',
            price: 990,
            durationDays: 30,
            sort: 1,
          }],
        }),
        listMyFamilies: () => familiesPromise,
      },
      '../../utils/operation-guards': {
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      getApp: () => ({ globalData: {} }),
      wx: {
        getStorageSync: () => ({
          membershipPurchaseGuide: '上次缓存的兑换提示',
          plans: [],
        }),
        setStorageSync(key, value) {
          storedValues.push({ key, value })
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  page.onLoad({})
  assert.equal(page.data.membershipPurchaseGuide, '上次缓存的兑换提示')

  const loadPromise = page.load()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(page.data.membershipPurchaseGuide, '后台刚刚更新的兑换提示')
  assert.equal('plans' in page.data, false)
  assert.equal(
    JSON.stringify(storedValues[0].value),
    JSON.stringify({ membershipPurchaseGuide: '后台刚刚更新的兑换提示' }),
  )

  resolveMembership({
    entitlement: {
      plan: 'free',
      planName: '免费版',
      limits: {},
    },
    family: {},
    plans: [],
    usage: {},
  })
  resolveFamilies({
    maxOwnedFamilies: 1,
    ownedFamilyCount: 1,
  })
  await loadPromise
})

test('payment plan config includes the monthly flexible-experience badge', () => {
  const paymentSource = fs.readFileSync(path.join(root, 'cloudfunctions/paymentApi/index.js'), 'utf8')
  const monthlyPlan = paymentSource.match(/planId: 'monthly_pro'[\s\S]*?benefits: PRO_LIMITS/)?.[0] || ''

  assert.match(monthlyPlan, /badge: '灵活体验'/)
})
