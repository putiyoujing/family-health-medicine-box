const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')

const root = path.resolve(__dirname, '..')

function loadPage(name, api, wxOverrides = {}) {
  let definition
  const toasts = []
  const paymentCalls = []
  loadCjsModule(path.join(root, `miniprogram/pages/membership/${name}.js`), {
    stubs: {
      '../../services/api': api,
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
      '../../utils/analytics': { EVENT_IDS: {}, track() {}, trackServiceError() {} },
    },
    globals: {
      Page(value) { definition = value },
      getApp: () => ({ globalData: { useDemoData: false } }),
      wx: { showToast(value) { toasts.push(value) }, login(value) { value.success({ code: 'qa-login' }) }, getDeviceInfo() { return { platform: 'android' } }, requestPayment(value) { paymentCalls.push(value); value.success() }, ...wxOverrides },
    },
  })
  const page = createPageInstance(definition)
  return { page, toasts, paymentCalls }
}

test('independent QA: checkout concurrent taps issue at most one order and never report disabled payment success', async () => {
  let orders = 0
  const { page, toasts, paymentCalls } = loadPage('checkout', {
    createOrder: async () => { orders += 1; return { orderId: 'qa-order', status: 'pending', payment: { ready: false } } },
  })
  page.setData({ family: { _id: 'qa-family', role: 'owner' }, plan: { planId: 'monthly_pro', price: 990 }, paymentReady: true, previewReady: true })
  await Promise.all([page.confirmPayment(), page.confirmPayment()])
  assert.equal(orders, 1, `concurrent taps created ${orders} orders`)
  assert.equal(paymentCalls.length, 0)
  assert.equal(toasts.some((item) => /支付成功/.test(item.title)), false)
  assert.equal(page.data.submitting, false)
})

test('independent QA: client virtual-payment success is not membership activation evidence', async () => {
  let virtualCalls = 0
  const { page, toasts, paymentCalls } = loadPage('checkout', {
    createOrder: async () => ({ orderId: 'qa-pending', status: 'pending', payment: {
      ready: true, provider: 'official_virtual_payment', requestVirtualPaymentArgs: { signData: 'server-signed', paySig: 'test-signature' },
    } }),
    getOrderForUser: async () => ({ order: { status: 'pending' } }),
  }, { requestVirtualPayment(value) { virtualCalls += 1; value.success() } })
  page.setData({ family: { _id: 'qa-family' }, plan: { planId: 'monthly_pro' }, paymentReady: true, previewReady: true })
  await page.confirmPayment()
  assert.equal(virtualCalls, 1)
  assert.equal(paymentCalls.length, 0)
  assert.equal(Boolean(page.data.paymentConfirmed), false)
  assert.equal(page.data.awaitingConfirmation, true)
  assert.equal(toasts.some((item) => /已开通|支付成功/.test(item.title)), false)
})

test('independent QA: concurrent redemption taps consume only one request', async () => {
  let redemptions = 0
  const { page } = loadPage('index', {
    redeemMembershipCode: async () => { redemptions += 1; return { status: 'active', plan: { membershipTier: 'paid' } } },
    getMembershipStatus: async () => ({ family: { _id: 'qa-family' }, entitlement: { plan: 'pro', tier: 'paid', limits: {} } }),
    getPlans: async () => ({ plans: [{ planId: 'monthly_pro', price: 990, durationDays: 30, membershipTier: 'paid' }] }),
  })
  page.setData({ family: { _id: 'qa-family', role: 'owner' }, redeemCode: 'QA-CODE' })
  await Promise.all([page.redeemMembershipCode(), page.redeemMembershipCode()])
  assert.equal(redemptions, 1)
  assert.equal(page.data.redeeming, false)
  assert.equal(page.data.redeemResult.status, 'active')
})

test('independent QA: a failed status refresh after successful redemption preserves activation evidence', async () => {
  const { page, toasts } = loadPage('index', {
    redeemMembershipCode: async () => ({ status: 'active', subscriptionId: 'qa-subscription', plan: { membershipTier: 'paid' } }),
    getMembershipStatus: async () => { throw new Error('qa refresh unavailable') },
    getPlans: async () => ({ plans: [] }),
  })
  page.setData({ family: { _id: 'qa-family', role: 'owner' }, redeemCode: 'QA-CODE' })
  await page.redeemMembershipCode()
  assert.equal(page.data.redeemResult.subscriptionId, 'qa-subscription')
  assert.equal(page.data.redeeming, false)
  assert.equal(page.data.loading, false)
  assert.equal(toasts.some((item) => item.title === '会员已激活'), true)
  assert.equal(toasts.some((item) => item.title === '兑换失败'), false)
})

for (const role of ['owner', 'admin', 'member', 'viewer', 'outsider']) {
  test(`independent QA: ${role} redemption authorization`, async () => {
    const fixture = createPaymentFixture({ store: { family_roles: role === 'outsider' ? [] : [{ _id: 'role-1', openid: 'owner-1', familyId: 'family-1', role }] } })
    const result = await fixture.call('redeemMembershipCode', { code: 'family2026' })
    const authorized = ['owner', 'admin'].includes(role)
    assert.equal(result.ok, authorized)
    assert.equal(fixture.store.subscriptions.length, authorized ? 1 : 0)
    assert.equal(fixture.store.coupon_codes[0].status, authorized ? 'used' : 'active')
  })
}

test('independent QA: two different codes concurrently extend the same family twice', async () => {
  const initialExpire = new Date(Date.now() + 86400000 * 50)
  const fixture = createPaymentFixture({ store: {
    families: [{ _id: 'family-1', plan: 'pro', proExpireAt: initialExpire }],
    coupon_codes: ['A', 'B'].map((code) => ({ _id: code, code, status: 'active', batchId: 'batch-1', redeemDurationDays: 30 })),
  } })
  const results = await Promise.all(['A', 'B'].map((code) => fixture.call('redeemMembershipCode', { code })))
  assert.equal(results.every((item) => item.ok), true)
  assert.equal(new Date(fixture.store.families[0].proExpireAt).getTime(), initialExpire.getTime() + 86400000 * 60)
  assert.equal(fixture.store.subscriptions.length, 2)
})

for (const [collection, operation] of [['coupon_codes', 'update'], ['coupon_redemptions', 'set'], ['coupon_code_batches', 'update'], ['families', 'update']]) {
  test(`independent QA: ${collection} failure rolls back all redemption writes and permits retry`, async () => {
    const fixture = createPaymentFixture()
    fixture.failNext(collection, operation)
    const failed = await fixture.call('redeemMembershipCode', { code: 'FAMILY2026' })
    assert.equal(failed.ok, false)
    assert.equal(fixture.store.coupon_codes[0].status, 'active')
    assert.equal(fixture.store.subscriptions.length, 0)
    assert.equal(fixture.store.coupon_redemptions.length, 0)
    assert.equal(fixture.store.coupon_code_batches[0].usedQuantity, 0)
    assert.equal(fixture.store.families[0].plan, 'free')
    assert.equal((await fixture.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, true)
  })
}

test('independent QA: unavailable payment rejects order creation with no persisted order', async () => {
  const fixture = createPaymentFixture()
  const result = await fixture.call('createOrder', { planId: 'monthly_pro', idempotencyKey: 'qa-one' })
  assert.equal(result.ok, false)
  assert.equal(fixture.store.orders.length, 0)
  assert.equal(fixture.store.subscriptions.length, 0)
})

test('independent QA: repeated order key cannot change family or plan', async () => {
  const fixture = createPaymentFixture({ env: { ALLOW_MOCK_PAYMENT: 'true', NODE_ENV: 'test' }, store: {
    families: [{ _id: 'family-1' }, { _id: 'family-2' }],
    family_roles: ['family-1', 'family-2'].map((familyId) => ({ _id: familyId, familyId, openid: 'owner-1', role: 'owner' })),
  } })
  assert.equal((await fixture.call('createOrder', { planId: 'monthly_pro', idempotencyKey: 'qa-one' })).ok, true)
  assert.equal((await fixture.call('createOrder', { planId: 'yearly_pro', idempotencyKey: 'qa-one' })).ok, false)
  assert.equal((await fixture.call('createOrder', { familyId: 'family-2', planId: 'monthly_pro', idempotencyKey: 'qa-one' })).ok, false)
  assert.equal(fixture.store.orders.length, 1)
  assert.equal(fixture.store.orders[0].planId, 'monthly_pro')
  assert.equal(fixture.store.orders[0].familyId, 'family-1')
})

test('independent QA: historical processing code is blocked without guessing how to repair it', async () => {
  const fixture = createPaymentFixture({ store: { coupon_codes: [{ _id: 'code-1', code: 'FAMILY2026', status: 'processing', batchId: 'batch-1' }] } })
  assert.equal((await fixture.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, false)
  assert.equal(fixture.store.subscriptions.length, 0)
  assert.equal(fixture.store.coupon_codes[0].status, 'processing')
})

test('independent QA: client supplied redemption duration and tier cannot override the issued code', async () => {
  const fixture = createPaymentFixture({ store: {
    coupon_codes: [{ _id: 'code-1', code: 'FAMILY2026', status: 'active', redeemPlanId: 'monthly_pro', redeemDurationDays: 30 }],
  } })
  const result = await fixture.call('redeemMembershipCode', {
    code: 'FAMILY2026', redeemPlanId: 'yearly_unlimited', redeemDurationDays: 3650,
    membershipTier: 'unlimited', status: 'paid', openid: 'another-user',
  })
  assert.equal(result.ok, true)
  assert.equal(result.data.plan.planId, 'monthly_pro')
  assert.equal(result.data.plan.durationDays, 30)
  assert.equal(fixture.store.families[0].membershipTier, 'paid')
  assert.equal(fixture.store.subscriptions[0].payerOpenid, 'owner-1')
})

test('independent QA: deleted batch cannot activate remaining codes', async () => {
  const fixture = createPaymentFixture({ store: {
    coupon_code_batches: [{ _id: 'batch-1', status: 'active', deletedAt: new Date(), usedQuantity: 0 }],
  } })
  const result = await fixture.call('redeemMembershipCode', { code: 'FAMILY2026' })
  assert.equal(result.ok, false)
  assert.equal(fixture.store.subscriptions.length, 0)
  assert.equal(fixture.store.coupon_codes[0].status, 'active')
})

test('independent QA: a lower tier code cannot silently erase an active unlimited membership', async () => {
  const expireAt = new Date(Date.now() + 90 * 86400000)
  const fixture = createPaymentFixture({ store: {
    families: [{ _id: 'family-1', plan: 'pro', planId: 'yearly_unlimited', membershipTier: 'unlimited', proExpireAt: expireAt }],
  } })
  const result = await fixture.call('redeemMembershipCode', { code: 'FAMILY2026' })
  assert.equal(result.ok, false)
  assert.equal(fixture.store.families[0].membershipTier, 'unlimited')
  assert.equal(new Date(fixture.store.families[0].proExpireAt).getTime(), expireAt.getTime())
  assert.equal(fixture.store.coupon_codes[0].status, 'active')
})

for (const action of ['getOrderForUser', 'cancelOrderForUser', 'mockPaymentSuccess']) {
  test(`independent QA: outsider cannot ${action} another family's order`, async () => {
    const fixture = createPaymentFixture({ env: { ALLOW_MOCK_PAYMENT: 'true', NODE_ENV: 'test' }, store: {
      family_roles: [],
      orders: [{ _id: 'foreign-order', familyId: 'family-1', payerOpenid: 'other-user', planId: 'monthly_pro', status: 'pending' }],
    } })
    const result = await fixture.call(action, { orderId: 'foreign-order', openid: 'other-user', role: 'owner' })
    assert.equal(result.ok, false)
    assert.equal(fixture.store.orders[0].status, 'pending')
    assert.equal(fixture.store.subscriptions.length, 0)
  })
}

test('independent QA: fake success fields cannot enable mock settlement in production', async () => {
  const fixture = createPaymentFixture({ env: { ALLOW_MOCK_PAYMENT: 'true', NODE_ENV: 'production' }, store: {
    orders: [{ _id: 'qa-order', familyId: 'family-1', payerOpenid: 'owner-1', planId: 'monthly_pro', status: 'pending' }],
  } })
  const result = await fixture.call('mockPaymentSuccess', { orderId: 'qa-order', status: 'paid', paymentReady: true })
  assert.equal(result.ok, false)
  assert.equal(fixture.store.orders[0].status, 'pending')
  assert.equal(fixture.store.subscriptions.length, 0)
})

test('independent QA: concurrent pending coupon orders cannot bypass family and user limits', async () => {
  const fixture = createPaymentFixture({ env: { ALLOW_MOCK_PAYMENT: 'true', NODE_ENV: 'test' }, store: {
    coupons: [{ _id: 'coupon-1', code: 'ONCE', status: 'active', type: 'amount_off', value: 100, perUserLimit: 1, perFamilyLimit: 1 }],
  } })
  const created = await Promise.all(['A', 'B'].map((idempotencyKey) => fixture.call('createOrder', { planId: 'monthly_pro', couponCode: 'ONCE', idempotencyKey })))
  assert.equal(created.every((result) => result.ok), true)
  const settled = await Promise.all(created.map((result) => fixture.call('mockPaymentSuccess', { orderId: result.data.orderId })))
  assert.equal(settled.filter((result) => result.ok).length, 1)
  assert.equal(fixture.store.subscriptions.length, 1)
  assert.equal(fixture.store.coupons[0].usedQuantity, 1)
  assert.equal(fixture.store.orders.filter((order) => order.status === 'paid').length, 1)
})
