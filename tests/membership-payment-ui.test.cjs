const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')
const root = path.resolve(__dirname, '..')
function page(name, api, wxOverrides = {}, guard = async () => true) {
  let definition
  const toasts = []
  const storage = new Map()
  loadCjsModule(path.join(root, `miniprogram/pages/membership/${name}.js`), {
    stubs: {
      '../../services/api': api,
      '../../utils/operation-guards': { ensureLoginReady: guard },
      '../../utils/analytics': { EVENT_IDS: {}, track() {}, trackServiceError() {} },
    },
    globals: {
      Page(value) { definition = value },
      wx: { login: ({ success }) => success({ code: 'login-fixture' }), getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: (key) => storage.delete(key), showToast: (value) => toasts.push(value.title), ...wxOverrides },
    },
  })
  return { instance: createPageInstance(definition), toasts }
}
function checkout(api, wx = {}, guard) {
  const result = page('checkout', api, wx, guard)
  result.instance.setData({ plan: { planId: 'monthly_pro' }, family: { _id: 'family-a' }, paymentReady: true, previewReady: true, paymentProvider: 'official_virtual_payment' })
  return result
}
test('legacy unlimited plan remains visible with its server identity and duration', async () => {
  const { instance } = page('index', {
    getMembershipStatus: async () => ({ family: { _id: 'family-a' } }),
    getPlans: async () => ({ plans: [{ planId: 'unlimited_pro', price: 1990, durationDays: 30 }] }),
  })
  await instance.load()
  assert.equal(instance.data.planCards[0].planId, 'unlimited_pro')
  assert.equal(instance.data.planCards[0].membershipTier, 'unlimited')
  assert.equal(instance.data.planCards[0].priceText, '19.90')
  assert.equal(instance.data.paymentReady, false)
})
test('a failed plan request still refreshes membership and never invents sellable plans', async () => {
  const { instance } = page('index', {
    getMembershipStatus: async () => ({ family: { _id: 'family-a' }, entitlement: { tier: 'unlimited', planName: '畅享版' } }),
    getPlans: async () => { throw new Error('offline') },
  })
  await instance.load()
  assert.equal(instance.data.family._id, 'family-a')
  assert.equal(instance.data.isUnlimitedMembership, true)
  assert.equal(instance.data.plans.length, 0)
  assert.equal(instance.data.paymentReady, false)
})
test('redemption coalesces double taps before asynchronous login and preserves success on refresh failure', async () => {
  let calls = 0
  const { instance, toasts } = page('index', {
    redeemMembershipCode: async () => { calls++; return { status: 'active', plan: { name: '安心版' } } },
    getMembershipStatus: async () => { throw new Error('refresh unavailable') },
    getPlans: async () => ({ plans: [] }),
  })
  instance.setData({ family: { _id: 'family-a' }, redeemCode: 'TEST' })
  await Promise.all([instance.redeemMembershipCode(), instance.redeemMembershipCode()])
  assert.equal(calls, 1)
  assert.equal(instance.data.redeemResult.status, 'active')
  assert.ok(toasts.includes('会员已激活'))
  assert.equal(instance.data.redeeming, false)
})
test('unavailable payment capability makes no order request', async () => {
  let calls = 0
  const { instance } = checkout({ createOrder: async () => { calls++ } })
  instance.setData({ paymentReady: false })
  await instance.confirmPayment()
  assert.equal(calls, 0)
})
test('retry after uncertain create-order response reuses key and double taps create only once', async () => {
  const keys = []
  const { instance } = checkout({ createOrder: async (payload) => { keys.push(payload.idempotencyKey); throw new Error('network timeout') } })
  await Promise.all([instance.confirmPayment(), instance.confirmPayment()])
  assert.equal(keys.length, 1)
  await instance.confirmPayment()
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
})
test('client virtual-payment success does not claim membership while server order remains pending', async () => {
  let virtualCalls = 0
  let regularCalls = 0
  const { instance, toasts } = checkout({
    createOrder: async () => ({ orderId: 'order-a', status: 'pending', payment: { ready: true, provider: 'official_virtual_payment', requestVirtualPaymentArgs: { signData: 'fixture' } } }),
    getOrderForUser: async (payload) => { assert.equal(payload.orderId, 'order-a'); return { order: { status: 'pending' } } },
  }, {
    requestVirtualPayment: ({ success }) => { virtualCalls++; success() },
    requestPayment: ({ success }) => { regularCalls++; success() },
  })
  await instance.confirmPayment()
  assert.equal(virtualCalls, 1)
  assert.equal(regularCalls, 0)
  assert.equal(toasts.includes('会员已开通'), false)
  assert.match(instance.data.paymentMessage, /确认中/)
})
test('server confirmation is required even for create-order paid responses and prevents duplicate purchase', async () => {
  let creates = 0
  let queries = 0
  const { instance, toasts } = checkout({
    createOrder: async () => { creates++; return { orderId: 'order-a', status: 'paid' } },
    getOrderForUser: async () => { queries++; return { order: { status: 'paid' } } },
  })
  await instance.confirmPayment()
  await instance.confirmPayment()
  assert.equal(creates, 1)
  assert.equal(queries, 1)
  assert.deepEqual(toasts, ['会员已开通'])
})
test('a rejected preview cannot submit or fall back to an unverified total', async () => {
  let creates = 0
  const { instance } = checkout({
    previewOrder: async () => { throw new Error('coupon expired') },
    createOrder: async () => { creates++ },
  })
  await instance.refreshPreview()
  await instance.confirmPayment()
  assert.equal(creates, 0)
  assert.equal(instance.data.previewReady, false)
})


test('virtual checkout sends a fresh login code and platform before creating signed order', async () => {
  const events = []
  const { instance } = checkout({
    createOrder: async (payload) => { events.push('create'); assert.equal(payload.loginCode, 'fresh-code'); assert.equal(payload.platform, 'android'); return { orderId: 'order-a', status: 'paid' } },
    getOrderForUser: async () => ({ order: { status: 'paid' } }),
  }, { login: ({ success }) => { events.push('login'); success({ code: 'fresh-code' }) }, getDeviceInfo: () => ({ platform: 'android' }) })
  await instance.confirmPayment()
  assert.deepEqual(events, ['login', 'create'])
})

test('login failure does not create an order', async () => {
  let creates = 0
  const { instance } = checkout({ createOrder: async () => { creates++ } }, { login: ({ success }) => success({}) })
  await instance.confirmPayment()
  assert.equal(creates, 0)
  assert.match(instance.data.paymentMessage, /登录凭证/)
})

test('iOS disabled capability blocks both membership purchase and direct checkout', async () => {
  for (const name of ['index', 'checkout']) {
    let creates = 0
    const { instance } = page(name, {
      getMembershipStatus: async () => ({ family: { _id: 'family-a' } }),
      getPlans: async () => ({ plans: [{ planId: 'monthly_pro', price: 990 }], paymentCapability: { ready: true, iosEnabled: false } }),
      previewOrder: async () => ({ payableAmount: 990 }),
      createOrder: async () => { creates++ },
    }, { getDeviceInfo: () => ({ platform: 'ios' }) })
    instance.planId = 'monthly_pro'
    await instance.load()
    assert.equal(instance.data.paymentReady, false)
    assert.match(instance.data.paymentMessage || instance.data.paymentReason, /iOS/)
    if (name === 'checkout') await instance.confirmPayment()
    assert.equal(creates, 0)
  }
})

test('returning to checkout refreshes pending payment and confirms only once without paying again', async () => {
  let paid = false
  let creates = 0
  let payments = 0
  const { instance, toasts } = checkout({
    createOrder: async () => { creates++; return { orderId: 'order-a', status: 'pending', payment: { ready: true, provider: 'official_virtual_payment', requestVirtualPaymentArgs: { signData: 'fixture' } } } },
    getOrderForUser: async () => ({ order: { status: paid ? 'paid' : 'pending' } }),
  }, { requestVirtualPayment: ({ success }) => { payments++; success() } })
  await instance.confirmPayment()
  await instance.confirmPayment()
  assert.equal(instance.data.awaitingConfirmation, true)
  paid = true
  await instance.onShow()
  await instance.onShow()
  assert.equal(creates, 1)
  assert.equal(payments, 1)
  assert.equal(instance.data.paymentConfirmed, true)
  assert.deepEqual(toasts, ['会员已开通'])
})

test('virtual checkout never falls back to ordinary WeChat payment', async () => {
  let ordinary = 0
  const { instance } = checkout({
    createOrder: async () => ({ orderId: 'order-a', status: 'pending', payment: { ready: true, provider: 'wechat_pay', requestPaymentArgs: {} } }),
  }, { requestPayment: () => { ordinary++ } })
  await instance.confirmPayment()
  assert.equal(ordinary, 0)
  assert.match(instance.data.paymentMessage, /不可用/)
})


test('an existing signed pending order queries instead of opening another payment sheet', async () => {
  let payments = 0
  let queries = 0
  const { instance } = checkout({
    createOrder: async () => ({ orderId: 'order-a', status: 'pending', requiresConfirmation: true }),
    getOrderForUser: async () => { queries++; return { order: { status: 'pending' } } },
  }, { requestVirtualPayment: () => { payments++ } })
  await instance.confirmPayment()
  assert.equal(payments, 0)
  assert.equal(queries, 1)
  assert.equal(instance.data.awaitingConfirmation, true)
})

test('disabled coupons are removed from checkout and cannot be selected', async () => {
  let previews = 0
  const { instance } = page('checkout', {
    getMembershipStatus: async () => ({ family: { _id: 'family-a' } }),
    getPlans: async () => ({ plans: [{ planId: 'monthly_pro', price: 990 }], paymentCapability: { ready: true, couponsEnabled: false } }),
    previewOrder: async (payload) => { previews++; assert.equal(payload.couponCode, null); return { payableAmount: 990 } },
  }, { navigateTo: () => assert.fail('coupon navigation is disabled') })
  instance.planId = 'monthly_pro'
  instance.setData({ coupon: { code: 'OLD' } })
  await instance.load()
  instance.chooseCoupon()
  assert.equal(previews, 1)
  assert.equal(instance.data.couponsEnabled, false)
})

test('unsupported iOS version and totals are stopped before creating an order', async () => {
  for (const [system, version, amount] of [['iOS 14.0', '8.0.68', 990], ['iOS 15.0', '8.0.67', 990], ['iOS 15.0', '8.0.68', 99]]) {
    let creates = 0
    const { instance } = checkout({ createOrder: async () => { creates++ } }, {
      getDeviceInfo: () => ({ platform: 'ios', system }),
      getAppBaseInfo: () => ({ version }),
    })
    instance.setData({ payableAmount: amount })
    await instance.confirmPayment()
    assert.equal(creates, 0)
    assert.match(instance.data.paymentMessage, /iOS/)
  }
})


test('payment transport failure retains order for return-to-page server reconciliation', async () => {
  const { instance, toasts } = checkout({
    createOrder: async () => ({ orderId: 'order-a', status: 'pending', payment: { ready: true, provider: 'official_virtual_payment', requestVirtualPaymentArgs: { signData: 'fixture' } } }),
    getOrderForUser: async () => ({ order: { status: 'paid' } }),
  }, { requestVirtualPayment: ({ fail }) => fail({ errMsg: 'network error' }) })
  await instance.confirmPayment()
  assert.equal(instance.data.awaitingConfirmation, true)
  assert.equal(instance.pendingOrderId, 'order-a')
  assert.deepEqual(toasts, [])
  await instance.onShow()
  assert.deepEqual(toasts, ['会员已开通'])
})
