const assert = require('node:assert/strict')
const test = require('node:test')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')

function createVirtualFixture({ source = 'wx_paycallback', openid, queryOrder, notifyDelivery, store } = {}) {
  let deliveryCalls = 0
  const provider = {
    getCapability: () => ({ ready: true, provider: 'official_virtual_payment', iosEnabled: false }),
    getProduct: (plan) => ({ productId: `product-${plan.planId}`, goodsPrice: plan.price }),
    preparePayment: async () => ({ ready: true, requestVirtualPaymentArgs: { signData: 'fixture' } }),
    queryOrder: async (order) => queryOrder ? queryOrder(order) : ({ state: 'paid', tradeNo: 'wx-trade-1', paidAt: '2026-09-23T00:00:00.000Z', platformDelivered: false }),
    notifyDelivery: async (order) => { deliveryCalls++; return notifyDelivery ? notifyDelivery(order, deliveryCalls) : undefined },
  }
  const fixture = createPaymentFixture({ source, openid, provider, store })
  return { ...fixture, counts: () => ({ deliveryCalls }) }
}

const checkout = { planId: 'monthly_pro', idempotencyKey: 'callback-test', loginCode: 'fixture-login', platform: 'android' }

async function createOrder(fixture) {
  const result = await fixture.call('createOrder', checkout)
  assert.equal(result.ok, true)
  return fixture.store.orders[0]
}

function callbackFor(order, overrides = {}) {
  return {
    MsgType: 'event',
    Event: 'xpay_goods_deliver_notify',
    OpenId: order.payerOpenid,
    OutTradeNo: order.orderNo,
    Env: 0,
    GoodsInfo: { ProductId: order.productId, Quantity: 1 },
    WeChatPayInfo: { MchOrderNo: 'wx-trade-1' },
    ...overrides,
  }
}

function assertCallbackResult(result, errorCode) {
  assert.equal(result.ErrCode, errorCode)
  assert.equal(result.ErrMsg, errorCode === 0 ? 'success' : 'fail')
}

test('virtual payment callback verifies trusted source and grants exactly once by platform trade ID', async () => {
  const fixture = createVirtualFixture()
  const order = await createOrder(fixture)
  const event = callbackFor(order)
  const first = await fixture.api.main(event)
  assertCallbackResult(first, 0)
  assert.equal(fixture.store.orders[0].status, 'paid')
  assert.equal(fixture.store.orders[0].paymentTradeNo, 'wx-trade-1')
  assert.equal(fixture.store.orders[0].subscriptionId, `wx_${require('node:crypto').createHash('sha256').update('wx-trade-1').digest('hex').slice(0, 32)}`)
  assert.equal(fixture.store.orders[0].deliveryStatus, 'confirmed')
  assert.equal(fixture.store.subscriptions.length, 1)
  assert.equal(fixture.counts().deliveryCalls, 0)
  const expireAt = new Date(fixture.store.families[0].proExpireAt).getTime()

  assertCallbackResult(await fixture.api.main(event), 0)
  assert.equal(fixture.store.subscriptions.length, 1)
  assert.equal(new Date(fixture.store.families[0].proExpireAt).getTime(), expireAt)
  assert.equal(fixture.counts().deliveryCalls, 0)
})

test('client cannot forge the virtual payment callback event', async () => {
  const fixture = createVirtualFixture({ source: '' })
  const order = await createOrder(fixture)
  const result = await fixture.api.main(callbackFor(order))
  assert.equal(result.ok, false)
  assert.equal(fixture.store.orders[0].status, 'pending')
  assert.equal(fixture.store.subscriptions.length, 0)
  assert.equal(fixture.counts().deliveryCalls, 0)
})

test('virtual payment callback rejects mismatched event fields before fulfillment', async (t) => {
  const cases = [
    ['message type', (event) => { event.MsgType = 'text' }],
    ['event name', (event) => { event.Event = 'xpay_refund_notify' }],
    ['openid', (event) => { event.OpenId = 'openid-other' }],
    ['business order number', (event) => { event.OutTradeNo = 'another-order' }],
    ['environment', (event) => { event.Env = 1 }],
    ['product ID', (event) => { event.GoodsInfo.ProductId = 'another-product' }],
    ['quantity', (event) => { event.GoodsInfo.Quantity = 2 }],
    ['platform trade number', (event) => { event.WeChatPayInfo.MchOrderNo = '' }],
  ]
  for (const [label, change] of cases) {
    await t.test(label, async () => {
      const fixture = createVirtualFixture()
      const order = await createOrder(fixture)
      const event = callbackFor(order)
      change(event)
      assertCallbackResult(await fixture.api.main(event), 1)
      assert.equal(fixture.store.orders[0].status, 'pending')
      assert.equal(fixture.store.subscriptions.length, 0)
      assert.equal(fixture.counts().deliveryCalls, 0)
    })
  }
})

test('virtual payment callback rejects local amount and remote trade mismatches', async (t) => {
  await t.test('local order amount differs from the signed goods price', async () => {
    const fixture = createVirtualFixture()
    const order = await createOrder(fixture)
    fixture.store.orders[0].goodsPrice += 1
    assertCallbackResult(await fixture.api.main(callbackFor(order)), 1)
    assert.equal(fixture.store.subscriptions.length, 0)
  })

  await t.test('platform order ID differs from callback trade ID', async () => {
    const fixture = createVirtualFixture({ queryOrder: async () => ({ state: 'paid', tradeNo: 'wx-other', paidAt: '2026-09-23T00:00:00.000Z' }) })
    const order = await createOrder(fixture)
    assertCallbackResult(await fixture.api.main(callbackFor(order)), 1)
    assert.equal(fixture.store.orders[0].status, 'pending')
    assert.equal(fixture.store.subscriptions.length, 0)
  })
})

test('platform status 4 marks fulfillment confirmed without sending a duplicate delivery request', async () => {
  const fixture = createVirtualFixture({ queryOrder: async () => ({ state: 'paid', tradeNo: 'wx-trade-1', platformDelivered: true }) })
  const order = await createOrder(fixture)
  assertCallbackResult(await fixture.api.main(callbackFor(order)), 0)
  assert.equal(fixture.store.orders[0].deliveryStatus, 'confirmed')
  assert.equal(fixture.counts().deliveryCalls, 0)
  assert.equal(fixture.store.subscriptions.length, 1)
})

test('concurrent paid-order reconciliation sends one platform delivery confirmation', async () => {
  const fixture = createVirtualFixture()
  const order = await createOrder(fixture)
  fixture.store.orders[0].status = 'paid'
  fixture.store.orders[0].paymentTradeNo = 'wx-trade-1'
  fixture.store.orders[0].subscriptionId = 'order_existing'
  fixture.store.orders[0].deliveryStatus = 'pending'
  fixture.store.subscriptions.push({ _id: 'order_existing', orderId: order._id, familyId: order.familyId, status: 'active' })
  const results = await Promise.all([
    fixture.call('getOrderForUser', { orderId: order._id }),
    fixture.call('getOrderForUser', { orderId: order._id }),
  ])
  assert.equal(results.every((result) => result.ok), true)
  assert.equal(fixture.counts().deliveryCalls, 1)
  assert.equal(fixture.store.orders[0].deliveryStatus, 'confirmed')
  assert.equal(fixture.store.subscriptions.length, 1)
})

test('order DTO hides payer identity and internal payment fields from family viewers', async () => {
  const fixture = createVirtualFixture({
    source: '',
    openid: 'viewer-1',
    queryOrder: async () => ({ state: 'pending' }),
    store: {
      family_roles: [
        { _id: 'owner-role', familyId: 'family-1', openid: 'owner-1', role: 'owner' },
        { _id: 'viewer-role', familyId: 'family-1', openid: 'viewer-1', role: 'viewer' },
      ],
    },
  })
  const ownerFixture = createVirtualFixture({ source: '' })
  const order = await createOrder(ownerFixture)
  fixture.store.orders.push(structuredClone(order))
  const detail = await fixture.call('getOrderForUser', { orderId: order._id })
  const listed = await fixture.call('listOrdersForUser', {})
  for (const visible of [detail.data.order, listed.data.orders[0]]) {
    assert.equal(visible.orderId, order._id)
    assert.equal(visible.canCancel, false)
    for (const hidden of ['payerOpenid', 'idempotencyKey', 'productId', 'goodsPrice', 'paymentPreparation', 'paymentReady']) {
      assert.equal(Object.hasOwn(visible, hidden), false, `${hidden} must not be exposed`)
    }
  }
})

test('pending manual orders expose cancellation while pending virtual orders do not', async () => {
  const fixture = createVirtualFixture({ source: '' })
  const order = await createOrder(fixture)
  const visible = (await fixture.call('getOrderForUser', { orderId: order._id })).data.order
  assert.equal(visible.canCancel, false)

  fixture.store.orders[0].status = 'pending'
  fixture.store.orders[0].paymentMode = 'manual'
  const manual = (await fixture.call('getOrderForUser', { orderId: order._id })).data.order
  assert.equal(manual.canCancel, true)
})
