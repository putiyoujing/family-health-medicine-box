const assert = require('node:assert/strict')
const test = require('node:test')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')

function fixture({ preparePayment } = {}) {
  let platformState = 'paid'
  const provider = {
    getCapability: () => ({ ready: true, couponsEnabled: true, provider: 'official_virtual_payment' }),
    getProduct: (plan) => ({ productId: plan.planId, goodsPrice: plan.price }),
    preparePayment: preparePayment || (async () => ({ ready: true })),
    queryOrder: async () => ({ state: platformState, tradeNo: 'coupon-trade', paidAt: new Date() }),
    notifyDelivery: async () => {},
  }
  const f = createPaymentFixture({ provider, store: {
    coupons: [{ _id: 'coupon-1', code: 'ONCE', status: 'active', type: 'amount_off', value: 100, totalQuantity: 1, perUserLimit: 1, perFamilyLimit: 1 }],
  } })
  return { ...f, setPlatformState(value) { platformState = value } }
}

const payload = { planId: 'monthly_pro', couponCode: 'ONCE', loginCode: 'test-login', platform: 'android' }

test('virtual coupon is reserved before payment, then consumed once after verified payment', async () => {
  const f = fixture()
  const results = await Promise.all(['a', 'b'].map((key) => f.call('createOrder', { ...payload, idempotencyKey: key })))
  assert.equal(results.filter((result) => result.ok).length, 1)
  const orderId = results.find((result) => result.ok).data.orderId
  assert.equal(f.store.orders[0].discountAmount, 100)
  assert.equal(f.store.coupons[0].reservedQuantity, 1)
  assert.equal((await f.call('getOrderForUser', { orderId })).data.order.status, 'paid')
  assert.equal(f.store.coupons[0].reservedQuantity, 0)
  assert.equal(f.store.coupons[0].usedQuantity, 1)
  assert.equal(f.store.coupon_redemptions.find((row) => row.orderId === orderId).status, 'used')
  await f.call('getOrderForUser', { orderId })
  assert.equal(f.store.coupons[0].usedQuantity, 1)
})

test('closed virtual order releases its coupon reservation', async () => {
  const f = fixture()
  f.setPlatformState('closed')
  const created = await f.call('createOrder', { ...payload, idempotencyKey: 'first' })
  assert.equal(created.ok, true)
  assert.equal((await f.call('getOrderForUser', { orderId: created.data.orderId })).data.order.status, 'closed')
  assert.equal(f.store.coupons[0].reservedQuantity, 0)
  assert.equal((await f.call('createOrder', { ...payload, idempotencyKey: 'second' })).ok, true)
})

test('a payment preparation failure releases the reservation before the same order is retried', async () => {
  let attempt = 0
  const f = fixture({ preparePayment: async () => {
    attempt += 1
    if (attempt === 1) throw new Error('temporary payment failure')
    return { ready: true }
  } })
  const first = await f.call('createOrder', { ...payload, idempotencyKey: 'retryable' })
  assert.equal(first.ok, false)
  assert.equal(f.store.coupons[0].reservedQuantity || 0, 0)
  assert.equal(f.store.orders[0].paymentPreparation, 'failed')

  const retry = await f.call('createOrder', { ...payload, idempotencyKey: 'retryable' })
  assert.equal(retry.ok, true)
  assert.equal(f.store.coupons[0].reservedQuantity, 1)
  assert.equal(f.store.coupon_redemptions.find((row) => row.orderId === retry.data.orderId).status, 'reserved')
})

test('a pending order that the provider reports as refunded releases its coupon without granting membership', async () => {
  const f = fixture()
  f.setPlatformState('refunded')
  const created = await f.call('createOrder', { ...payload, idempotencyKey: 'refunded-before-fulfillment' })
  const result = await f.call('getOrderForUser', { orderId: created.data.orderId })
  assert.equal(result.data.order.status, 'refund_review')
  assert.equal(f.store.coupons[0].reservedQuantity || 0, 0)
  assert.equal(f.store.coupons[0].usedQuantity || 0, 0)
  assert.equal(f.store.subscriptions.length, 0)
})

test('an idempotent retry returns a processed coupon order without revalidating an already consumed coupon', async () => {
  const f = fixture()
  const created = await f.call('createOrder', { ...payload, idempotencyKey: 'same-request' })
  await f.call('getOrderForUser', { orderId: created.data.orderId })
  const retried = await f.call('createOrder', { ...payload, idempotencyKey: 'same-request' })
  assert.equal(retried.ok, true)
  assert.equal(retried.data.status, 'paid')
  assert.equal(f.store.coupons[0].usedQuantity, 1)
})
