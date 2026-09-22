const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')

test('paymentApi declares a five-minute timer trigger', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../cloudfunctions/paymentApi/config.json'), 'utf8'))
  assert.deepEqual(config.triggers, [{ name: 'virtualPaymentEveryFiveMinutes', type: 'timer', config: '0 */5 * * * * *' }])
})

function virtualOrder(id, createdAt = new Date('2026-09-01T00:00:00.000Z')) {
  return {
    _id: id,
    orderNo: `FH${String(id).padEnd(10, '0')}`,
    familyId: 'family-1',
    payerOpenid: 'owner-1',
    planId: 'monthly_pro',
    planName: '安心版（月度）',
    originalAmount: 990,
    payableAmount: 990,
    goodsPrice: 990,
    productId: 'product-monthly_pro',
    planDurationDays: 30,
    planBenefits: { quickRecordLimit: 30 },
    planMembershipTier: 'paid',
    paymentMode: 'virtual',
    status: 'pending',
    createdAt,
  }
}

function makeProvider(queryOrder = async () => ({ state: 'pending' })) {
  let calls = 0
  let active = 0
  let maxActive = 0
  return {
    provider: {
      getCapability: () => ({ ready: true, provider: 'official_virtual_payment', iosEnabled: false }),
      getProduct: (plan) => ({ productId: `product-${plan.planId}`, goodsPrice: plan.price }),
      preparePayment: async () => ({ ready: true }),
      queryOrder: async (order) => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        try { return await queryOrder(order) } finally { active -= 1 }
      },
      notifyDelivery: async () => {},
    },
    counts: () => ({ calls, maxActive }),
  }
}

function fixture(source, orders, provider) {
  return createPaymentFixture({ source, provider, store: { orders } })
}

test('client cannot invoke the timer reconciliation action', async () => {
  const remote = makeProvider(async () => ({ state: 'paid', tradeNo: 'wx-trade-1' }))
  const client = fixture('wx_client', [virtualOrder('client-order')], remote.provider)
  const result = await client.api.main({ action: 'reconcilePendingVirtualOrders' })
  assert.equal(result.ok, false)
  assert.equal(remote.counts().calls, 0)
  assert.equal(client.store.orders[0].status, 'pending')
})

test('wx_trigger reconciles paid orders and repeat runs keep membership idempotent', async () => {
  const remote = makeProvider(async () => ({ state: 'paid', tradeNo: 'wx-paid-trade', paidAt: '2026-09-23T00:00:00.000Z' }))
  const timer = fixture('wx_trigger', [virtualOrder('paid-order')], remote.provider)
  const first = await timer.api.main({})
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { ok: true, scanned: 1, succeeded: 1, failed: 0 })
  assert.equal(timer.store.orders[0].status, 'paid')
  assert.equal(timer.store.subscriptions.length, 1)
  const expiry = new Date(timer.store.families[0].proExpireAt).getTime()

  const second = await timer.api.main({})
  assert.equal(second.scanned, 0)
  assert.equal(second.succeeded, 0)
  assert.equal(remote.counts().calls, 1)
  assert.equal(timer.store.subscriptions.length, 1)
  assert.equal(new Date(timer.store.families[0].proExpireAt).getTime(), expiry)
})

test('reconciliation isolates per-order failures and closes old unpaid orders', async () => {
  const oldest = virtualOrder('old-closed', new Date('2026-09-01T00:00:00.000Z'))
  const next = virtualOrder('new-paid', new Date('2026-09-02T00:00:00.000Z'))
  const remote = makeProvider(async (order) => {
    if (order._id === oldest._id) return { state: 'closed' }
    if (order._id === next._id) return { state: 'paid', tradeNo: 'wx-next-trade', paidAt: '2026-09-23T00:00:00.000Z' }
    throw new Error('fixture order failure')
  })
  const timer = fixture('wx_trigger', [oldest, next, virtualOrder('bad-order')], remote.provider)
  const result = await timer.api.main({})
  assert.equal(result.scanned, 3)
  assert.equal(result.succeeded, 2)
  assert.equal(result.failed, 1)
  assert.equal(timer.store.orders.find((order) => order._id === oldest._id).status, 'closed')
  assert.equal(timer.store.orders.find((order) => order._id === next._id).status, 'paid')
  assert.equal(timer.store.subscriptions.length, 1)

  const second = await timer.api.main({})
  assert.equal(second.scanned, 1)
  assert.equal(remote.counts().calls, 4)
})

test('timer reads at most 20 orders and limits concurrent platform queries to three', async () => {
  const orders = Array.from({ length: 25 }, (_, index) => virtualOrder(`order-${index}`, new Date(2026, 8, index + 1)))
  const remote = makeProvider(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3))
    return { state: 'pending' }
  })
  const timer = fixture('wx_trigger', orders, remote.provider)
  const result = await timer.api.main({})
  assert.equal(result.scanned, 20)
  assert.equal(result.succeeded, 20)
  assert.equal(remote.counts().calls, 20)
  assert.ok(remote.counts().maxActive <= 3)
  assert.equal(timer.store.subscriptions.length, 0)
})
