const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('membership display keeps one selected plan and buys it from the floating bar', async () => {
  let pageDefinition
  const navigationUrls = []
  const plans = [
    { planId: 'monthly_pro', membershipTier: 'paid', name: '安心版', price: 990, durationDays: 30, benefits: {} },
    { planId: 'yearly_pro', membershipTier: 'paid', name: '安心版', price: 9900, durationDays: 365, benefits: {} },
    { planId: 'monthly_unlimited', membershipTier: 'unlimited', name: '畅享版', price: 1990, durationDays: 30, benefits: {} },
    { planId: 'yearly_unlimited', membershipTier: 'unlimited', name: '畅享版', price: 19900, durationDays: 365, benefits: {} },
  ]

  loadCjsModule(path.join(root, 'miniprogram/pages/membership/index.js'), {
    stubs: {
      '../../services/api': {
        getMembershipStatus: async () => ({ family: { _id: 'family-a' }, entitlement: { plan: 'free', planName: '基础版', limits: {} }, usage: {}, familyPolicy: {} }),
        getPlans: async () => ({ plans, paymentCapability: { ready: true } }),
      },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      wx: { navigateTo({ url }) { navigationUrls.push(url) } },
    },
  })

  const page = createPageInstance(pageDefinition)
  await page.load()
  assert.equal(page.data.selectedPlanId, 'monthly_pro')
  assert.equal(page.data.selectedPeriod, 'monthly')

  page.selectPlan({ currentTarget: { dataset: { planId: 'monthly_unlimited' } } })
  assert.equal(page.data.selectedPlanId, 'monthly_unlimited')
  page.selectPeriod({ currentTarget: { dataset: { period: 'yearly' } } })
  assert.equal(page.data.selectedPlanId, 'yearly_unlimited')
  await page.buySelectedPlan()
  assert.deepEqual(navigationUrls, ['/pages/membership/checkout?planId=yearly_unlimited'])
})

test('membership template removes the badge avatar and uses a single selected-card state', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxss'), 'utf8')

  assert.doesNotMatch(template, /banner-badge/)
  assert.ok(template.indexOf('class="section usage-section"') < template.indexOf('class="section plan-section"'))
  assert.ok(template.indexOf('class="section plan-section"') < template.indexOf('id="redeem-section"'))
  assert.match(template, /购买周期/)
  assert.match(template, /plan-secondary-price/)
  assert.match(template, /period-switch/)
  assert.match(template, /plan-card-selected/)
  assert.match(template, /floating-purchase-bar/)
  assert.doesNotMatch(styles, /plan-card-premium/)
  assert.match(styles, /\.floating-purchase-bar\s*\{[^}]*position:fixed/)
})
