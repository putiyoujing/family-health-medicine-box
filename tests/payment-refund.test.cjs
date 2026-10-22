const assert = require('node:assert/strict')
const test = require('node:test')
const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')
const { loadCjsModule } = require('./helpers/cjs-harness.cjs')
const path = require('node:path')
const fs = require('node:fs')
const { replayWithoutRefundedOrder } = require('../cloudfunctions/paymentApi/refund-entitlements')

test('mini-program order pages provide no refund application action', () => {
  const pages = ['miniprogram/pages/orders/index.wxml', 'miniprogram/pages/orders/detail.wxml',
    'miniprogram/pages/orders/index.js', 'miniprogram/pages/orders/detail.js']
  for (const page of pages) assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '..', page), 'utf8'), /bindtap="[^"]*refund|applyRefund|requestRefund/i)
})

test('partial refund removes its whole subscription while retaining later renewal and redemption', () => {
  const start = new Date('2026-01-01T00:00:00Z')
  const laterStart = new Date('2026-01-05T00:00:00Z')
  const target = { status: 'active', previousPlan: 'free', previousPlanId: 'free', previousMembershipTier: 'free', previousExpireAt: null }
  const later = [
    { _id: 'later-order', status: 'active', source: 'virtual_payment', planId: 'monthly_pro', startedAt: laterStart,
      previousExpireAt: new Date('2026-01-31T00:00:00Z'), expireAt: new Date('2026-03-02T00:00:00Z') },
    { _id: 'later-code', status: 'active', source: 'membership_code', planId: 'monthly_pro', startedAt: new Date('2026-01-06T00:00:00Z'),
      previousExpireAt: new Date('2026-03-02T00:00:00Z'), expireAt: new Date('2026-04-01T00:00:00Z') },
  ]
  assert.ok(start < laterStart)
  const result = replayWithoutRefundedOrder(target, later)
  assert.equal(result.patches[0].expireAt.toISOString(), '2026-02-04T00:00:00.000Z')
  assert.equal(result.patches[1].expireAt.toISOString(), '2026-03-06T00:00:00.000Z')
  assert.equal(result.lastSubscription._id, 'later-code')
  assert.equal(result.planId, 'monthly_pro')
})

test('verified refund closes only the refunded order and preserves later membership', async () => {
  const targetStart = new Date('2026-01-01T00:00:00Z')
  const laterStart = new Date('2026-01-05T00:00:00Z')
  const fixture = createPaymentFixture({ provider: {
    queryRefund: async () => ({ state: 'refunded', refundAmount: 100 }),
  }, store: {
    families: [{ _id: 'family-1', plan: 'pro', planId: 'monthly_pro', membershipTier: 'paid',
      proExpireAt: new Date('2026-03-02T00:00:00Z'), proUpdatedAt: targetStart }],
    orders: [{ _id: 'order-a', orderNo: 'M0000001', familyId: 'family-1', payerOpenid: 'owner-1', planId: 'monthly_pro',
      status: 'refunding', paymentMode: 'virtual', subscriptionId: 'sub-a', refundOrderId: 'rf_12345678', refundAmount: 100,
      payableAmount: 990 }],
    subscriptions: [
      { _id: 'sub-a', orderId: 'order-a', familyId: 'family-1', status: 'active', source: 'virtual_payment', planId: 'monthly_pro',
        previousPlan: 'free', previousPlanId: 'free', previousMembershipTier: 'free', previousExpireAt: null,
        startedAt: targetStart, expireAt: new Date('2026-01-31T00:00:00Z') },
      { _id: 'sub-b', orderId: 'order-b', familyId: 'family-1', status: 'active', source: 'virtual_payment', planId: 'monthly_pro',
        previousPlan: 'pro', previousPlanId: 'monthly_pro', previousMembershipTier: 'paid',
        previousExpireAt: new Date('2026-01-31T00:00:00Z'), startedAt: laterStart, expireAt: new Date('2026-03-02T00:00:00Z') },
    ],
  } })
  const result = await fixture.call('getOrderForUser', { orderId: 'order-a' })
  assert.equal(result.ok, true)
  assert.equal(fixture.store.orders[0].status, 'refunded')
  assert.equal(fixture.store.subscriptions[0].status, 'cancelled')
  assert.equal(fixture.store.subscriptions[1].status, 'active')
  assert.equal(new Date(fixture.store.families[0].proExpireAt).toISOString(), '2026-02-04T00:00:00.000Z')
  await fixture.call('getOrderForUser', { orderId: 'order-a' })
  assert.equal(fixture.store.subscriptions.filter((item) => item.status === 'cancelled').length, 1)
})

test('unconfirmed refund never revokes membership', async () => {
  const fixture = createPaymentFixture({ provider: { queryRefund: async () => ({ state: 'processing', refundAmount: 100 }) }, store: {
    orders: [{ _id: 'order-a', familyId: 'family-1', status: 'refunding', paymentMode: 'virtual', refundOrderId: 'rf_12345678', refundAmount: 100 }],
    subscriptions: [{ _id: 'sub-a', orderId: 'order-a', familyId: 'family-1', status: 'active' }],
  } })
  await fixture.call('getOrderForUser', { orderId: 'order-a' })
  assert.equal(fixture.store.orders[0].status, 'refunding')
  assert.equal(fixture.store.subscriptions[0].status, 'active')
})

test('trusted refund notification requires a matching completed platform refund', async () => {
  const fixture = createPaymentFixture({ source: 'wx_paycallback', provider: {
    queryRefund: async () => ({ state: 'refunded', refundAmount: 100 }),
  }, store: {
    orders: [{ _id: 'order-a', orderNo: 'M0000001', familyId: 'family-1', payerOpenid: 'owner-1', status: 'refunding',
      paymentMode: 'virtual', subscriptionId: 'sub-a', refundOrderId: 'rf_12345678', refundAmount: 100 }],
    subscriptions: [{ _id: 'sub-a', orderId: 'order-a', familyId: 'family-1', status: 'active',
      planId: 'monthly_pro', previousPlan: 'free', previousPlanId: 'free', previousMembershipTier: 'free' }],
  } })
  const event = { MsgType: 'event', Event: 'xpay_refund_notify', Env: 0, RetCode: 0,
    MchRefundId: 'rf_12345678', MchOrderId: 'M0000001', OpenId: 'owner-1' }
  assert.equal((await fixture.api.main({ ...event, MchRefundId: 'other' })).ErrCode, 1)
  assert.equal(fixture.store.orders[0].status, 'refunding')
  assert.equal((await fixture.api.main(event)).ErrCode, 0)
  assert.equal(fixture.store.orders[0].status, 'refunded')
  assert.equal(fixture.store.subscriptions[0].status, 'cancelled')
  assert.equal((await fixture.api.main(event)).ErrCode, 0)
})

test('admin refund validates amount, records one intent, and waits for provider confirmation', async () => {
  let requests = 0
  const fixture = createPaymentFixture({ store: {
    admins: [{ _id: 'admin-1', authUid: 'admin-1', role: 'owner', status: 'active' }],
    admin_operation_logs: [],
    orders: [{ _id: 'order-a', orderNo: 'M0000001', familyId: 'family-1', payerOpenid: 'owner-1',
      status: 'paid', paymentMode: 'virtual', payableAmount: 990, paymentTradeNo: 'wx-trade-1', subscriptionId: 'sub-a' }],
    subscriptions: [{ _id: 'sub-a', orderId: 'order-a', familyId: 'family-1', status: 'active' }],
  } })
  const api = loadCjsModule(path.resolve(__dirname, '../cloudfunctions/adminApi/index.js'), { stubs: {
    'wx-server-sdk': fixture.cloud,
    '@cloudbase/node-sdk': { init: () => ({ auth: () => ({ getUserInfo: () => ({ uid: 'admin-1' }) }) }) },
    './virtual-refund': {
      queryPaidOrder: async () => ({ leftFee: 990 }),
      requestRefund: async () => { requests++; return { refund_order_id: 'fixture' } },
    },
  } })
  fixture.store.admins[0].role = 'operator'
  assert.equal((await api.main({ action: 'refundOrder', payload: { orderId: 'order-a', refundAmount: 100 } })).ok, false)
  fixture.store.admins[0].role = 'owner'
  for (const amount of [0, -1, 991, 1.5, undefined]) {
    assert.equal((await api.main({ action: 'refundOrder', payload: { orderId: 'order-a', refundAmount: amount } })).ok, false)
  }
  assert.equal(requests, 0)
  const result = await api.main({ action: 'refundOrder', payload: { orderId: 'order-a', refundAmount: 100 } })
  assert.equal(result.ok, true)
  assert.equal(fixture.store.orders[0].status, 'refunding')
  assert.equal(fixture.store.orders[0].refundAmount, 100)
  assert.equal(fixture.store.subscriptions[0].status, 'active')
  assert.equal(requests, 1)
  assert.equal((await api.main({ action: 'refundOrder', payload: { orderId: 'order-a', refundAmount: 100 } })).ok, false)
  assert.equal(requests, 1)
})
