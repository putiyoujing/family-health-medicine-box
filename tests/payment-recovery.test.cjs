const assert = require('node:assert/strict')
const test = require('node:test')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')
const env = { ALLOW_MOCK_PAYMENT: 'true', NODE_ENV: 'test' }

for (const [collection, operation] of [['subscriptions', 'set'], ['coupon_codes', 'update'], ['coupon_redemptions', 'set'], ['coupon_code_batches', 'update'], ['families', 'update']]) {
  test(`redeem rollback and retry after ${collection} failure`, async () => {
    const f = createPaymentFixture()
    f.failNext(collection, operation)
    assert.equal((await f.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, false)
    assert.equal(f.store.coupon_codes[0].status, 'active')
    assert.equal(f.store.subscriptions.length, 0)
    assert.equal(f.store.coupon_redemptions.length, 0)
    assert.equal(f.store.coupon_code_batches[0].usedQuantity, 0)
    assert.equal(f.store.families[0].plan, 'free')
    assert.equal((await f.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, true)
    assert.equal(f.store.subscriptions.length, 1)
  })
}
test('same code concurrent requests grant only once', async () => {
  const f = createPaymentFixture()
  const results = await Promise.all(Array.from({ length: 10 }, () => f.call('redeemMembershipCode', { code: 'FAMILY2026' })))
  assert.equal(results.filter((r) => r.ok).length, 1)
  assert.equal(f.store.subscriptions.length, 1)
  assert.equal(f.store.coupon_code_batches[0].usedQuantity, 1)
})
test('different codes same family add both durations', async () => {
  const expiry = new Date(Date.now() + 86400000 * 20)
  const f = createPaymentFixture({ store: {
    families: [{ _id: 'family-1', plan: 'pro', proExpireAt: expiry }],
    coupon_codes: ['A', 'B'].map((code) => ({ _id: code, code, status: 'active', redeemDurationDays: 30 })),
  } })
  const results = await Promise.all(['A', 'B'].map((code) => f.call('redeemMembershipCode', { code })))
  assert.ok(results.every((r) => r.ok))
  assert.equal(new Date(f.store.families[0].proExpireAt).getTime(), expiry.getTime() + 60 * 86400000)
})
test('missing transaction support and historical processing code fail closed', async () => {
  for (const options of [{ transactionAvailable: false }, { store: { coupon_codes: [{ _id: 'code-1', code: 'FAMILY2026', status: 'processing' }] } }]) {
    const f = createPaymentFixture(options)
    assert.equal((await f.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, false)
    assert.equal(f.store.subscriptions.length, 0)
  }
})
for (const [collection, operation] of [['subscriptions', 'set'], ['families', 'update'], ['orders', 'update']]) {
  test(`mock payment rollback and retry after ${collection} failure`, async () => {
    const f = createPaymentFixture({ env })
    const order = await f.call('createOrder', { planId: 'monthly_pro', idempotencyKey: 'checkout-1' })
    assert.equal(order.ok, true)
    f.failNext(collection, operation)
    assert.equal((await f.call('mockPaymentSuccess', { orderId: order.data.orderId })).ok, false)
    assert.equal(f.store.orders[0].status, 'pending')
    assert.equal(f.store.subscriptions.length, 0)
    const results = await Promise.all(Array.from({ length: 5 }, () => f.call('mockPaymentSuccess', { orderId: order.data.orderId })))
    assert.ok(results.every((r) => r.ok))
    assert.equal(f.store.subscriptions.length, 1)
    assert.equal(f.store.orders[0].status, 'paid')
  })
}
test('production unavailable checkout writes no orders', async () => {
  const f = createPaymentFixture()
  assert.equal((await f.call('getPlans')).data.paymentCapability.ready, false)
  assert.equal((await f.call('createOrder', { planId: 'monthly_pro' })).ok, false)
  assert.equal(f.store.orders.length, 0)
})
test('idempotent creation does not overwrite a paid order or accept changed plan', async () => {
  const f = createPaymentFixture({ env })
  const payload = { planId: 'monthly_pro', idempotencyKey: 'checkout-1' }
  const orders = await Promise.all(Array.from({ length: 5 }, () => f.call('createOrder', payload)))
  assert.ok(orders.every((r) => r.ok))
  assert.equal(f.store.orders.length, 1)
  assert.equal((await f.call('mockPaymentSuccess', { orderId: orders[0].data.orderId })).ok, true)
  assert.equal((await f.call('createOrder', payload)).data.status, 'paid')
  assert.equal((await f.call('createOrder', { ...payload, planId: 'yearly_pro' })).ok, false)
  assert.equal(f.store.orders[0].status, 'paid')
})

for (const action of ['redeemMembershipCode', 'createOrder']) {
  test(`${action} rejects a manager revoked before transaction`, async () => {
    const f = createPaymentFixture({ env, beforeTransaction(store) { store.family_roles[0].role = 'member' } })
    assert.equal((await f.call(action, { code: 'FAMILY2026', planId: 'monthly_pro' })).ok, false)
    assert.equal(f.store.orders.length, 0)
    assert.equal(f.store.subscriptions.length, 0)
    assert.equal(f.store.coupon_codes[0].status, 'active')
  })
}
for (const collection of ['subscriptions', 'coupon_redemptions']) {
  test(`redemption preserves conflicting historical ${collection} record`, async () => {
    const historical = { _id: 'code_code-1', familyId: 'other-family', status: 'active' }
    const f = createPaymentFixture({ store: { [collection]: [historical] } })
    assert.equal((await f.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, false)
    assert.deepEqual(f.store[collection][0], historical)
    assert.equal(f.store.coupon_codes[0].status, 'active')
  })
}
test('unknown redemption plan does not activate fallback membership', async () => {
  const f = createPaymentFixture({ store: { coupon_codes: [{ _id: 'code-1', code: 'FAMILY2026', status: 'active', redeemPlanId: 'unknown' }] } })
  assert.equal((await f.call('redeemMembershipCode', { code: 'FAMILY2026' })).ok, false)
  assert.equal(f.store.subscriptions.length, 0)
  assert.equal(f.store.families[0].plan, 'free')
})

function virtualFixture(overrides = {}) {
  let prepareCount = 0
  let deliveryCount = 0
  const provider = {
    getCapability: () => ({ ready: true, provider: 'official_virtual_payment', iosEnabled: false }),
    getProduct: (plan) => ({ productId: plan.planId, goodsPrice: plan.price }),
    preparePayment: async () => { prepareCount++; return { ready: true, requestVirtualPaymentArgs: { signData: 'fixture' } } },
    queryOrder: async () => ({ state: 'paid', tradeNo: 'fixture-trade', paidAt: new Date() }),
    notifyDelivery: async () => { deliveryCount++ },
    ...overrides,
  }
  return { ...createPaymentFixture({ provider }), counts: () => ({ prepareCount, deliveryCount }) }
}
const virtualPayload = { planId: 'monthly_pro', idempotencyKey: 'virtual-checkout', loginCode: 'fixture-login', platform: 'android' }

test('virtual payment grants only after server verification and notifies delivery once', async () => {
  const f = virtualFixture()
  const created = await f.call('createOrder', virtualPayload)
  assert.equal(created.ok, true)
  assert.equal(created.data.payment.ready, true)
  assert.equal(f.store.subscriptions.length, 0)
  const orderId = created.data.orderId
  assert.equal((await f.call('getOrderForUser', { orderId })).data.order.status, 'paid')
  const expireAt = new Date(f.store.families[0].proExpireAt).getTime()
  assert.equal((await f.call('getOrderForUser', { orderId })).ok, true)
  assert.equal(f.store.subscriptions.length, 1)
  assert.equal(new Date(f.store.families[0].proExpireAt).getTime(), expireAt)
  assert.equal(f.counts().deliveryCount, 1)
})

test('virtual payment failed preparation retries same order without duplication', async () => {
  let attempts = 0
  const f = virtualFixture({ preparePayment: async () => { if (!attempts++) throw new Error('login failed'); return { ready: true } } })
  assert.equal((await f.call('createOrder', virtualPayload)).ok, false)
  assert.equal(f.store.orders[0].paymentPreparation, 'failed')
  assert.equal((await f.call('createOrder', virtualPayload)).data.payment.ready, true)
  assert.equal(f.store.orders.length, 1)
  assert.equal(attempts, 2)
})

test('virtual payment pending retries require confirmation and cannot cancel locally', async () => {
  const f = virtualFixture({ queryOrder: async () => ({ state: 'pending' }) })
  const created = await f.call('createOrder', virtualPayload)
  const again = await f.call('createOrder', virtualPayload)
  assert.equal(again.data.requiresConfirmation, true)
  assert.equal(again.data.payment.ready, false)
  assert.equal(f.counts().prepareCount, 1)
  assert.equal((await f.call('cancelOrderForUser', { orderId: created.data.orderId })).ok, false)
  assert.equal(f.store.orders[0].status, 'pending')
  assert.equal(f.store.subscriptions.length, 0)
})

test('virtual payment delivery failure retries notification without adding membership', async () => {
  let calls = 0
  const f = virtualFixture({ notifyDelivery: async () => { if (!calls++) throw new Error('delivery timeout') } })
  const created = await f.call('createOrder', virtualPayload)
  const payload = { orderId: created.data.orderId }
  assert.equal((await f.call('getOrderForUser', payload)).data.order.deliveryStatus, 'pending')
  assert.equal((await f.call('getOrderForUser', payload)).data.order.deliveryStatus, 'confirmed')
  assert.equal(f.store.subscriptions.length, 1)
  assert.equal(calls, 2)
})

for (const state of ['pending', 'closed', 'refunded', 'refund_review']) {
  test(`virtual payment state ${state} does not grant membership`, async () => {
    const f = virtualFixture({ queryOrder: async () => ({ state }) })
    const created = await f.call('createOrder', virtualPayload)
    await f.call('getOrderForUser', { orderId: created.data.orderId })
    assert.equal(f.store.subscriptions.length, 0)
    assert.equal(f.store.families[0].plan, 'free')
  })
}

test('virtual payment transaction failure leaves pending and can retry safely', async () => {
  const f = virtualFixture()
  const created = await f.call('createOrder', virtualPayload)
  const payload = { orderId: created.data.orderId }
  f.failNext('families', 'update')
  assert.equal((await f.call('getOrderForUser', payload)).ok, false)
  assert.equal(f.store.orders[0].status, 'pending')
  assert.equal(f.store.subscriptions.length, 0)
  assert.equal((await f.call('getOrderForUser', payload)).ok, true)
  assert.equal(f.store.subscriptions.length, 1)
})
