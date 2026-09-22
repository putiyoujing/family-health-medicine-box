const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const EventEmitter = require('node:events')
const https = require('node:https')
const path = require('node:path')
const test = require('node:test')

const providerPath = path.resolve(__dirname, '../cloudfunctions/paymentApi/virtual-payment.js')
const planIds = ['monthly_pro', 'yearly_pro', 'monthly_unlimited', 'yearly_unlimited']
const productEnvNames = planIds.map((planId) => `VIRTUAL_PAYMENT_PRODUCT_${planId.toUpperCase()}`)
const scopedEnvNames = [
  'WX_APPID', 'WX_APP_SECRET', 'VIRTUAL_PAYMENT_ENABLED', 'VIRTUAL_PAYMENT_OFFER_ID',
  'VIRTUAL_PAYMENT_APP_KEY', 'VIRTUAL_PAYMENT_IOS_ENABLED', ...productEnvNames,
]
const configuredEnv = {
  WX_APPID: 'wxc3d708e7c51d5c87',
  WX_APP_SECRET: 'test-wx-app-secret',
  VIRTUAL_PAYMENT_ENABLED: 'true',
  VIRTUAL_PAYMENT_OFFER_ID: '1450655131',
  VIRTUAL_PAYMENT_APP_KEY: 'test-virtual-payment-app-key',
  VIRTUAL_PAYMENT_IOS_ENABLED: 'false',
  ...Object.fromEntries(productEnvNames.map((name, index) => [name, `test-product-${planIds[index]}`])),
}

function createProvider(responses = [], overrides = {}) {
  const previousEnv = new Map(scopedEnvNames.map((name) => [name, process.env[name]]))
  for (const name of scopedEnvNames) delete process.env[name]
  for (const [name, value] of Object.entries({ ...configuredEnv, ...overrides })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  const requests = []
  const queuedResponses = [...responses]
  const originalRequest = https.request
  https.request = (options, callback) => {
    const record = { ...options, body: undefined }
    requests.push(record)
    const request = new EventEmitter()
    request.setTimeout = () => {}
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error))
    request.end = (body) => {
      record.body = body
      const responseSpec = queuedResponses.shift()
      if (responseSpec && responseSpec.error) {
        queueMicrotask(() => request.emit('error', new Error(responseSpec.error)))
        return
      }
      const response = new EventEmitter()
      response.statusCode = responseSpec && responseSpec.statusCode || 200
      response.setEncoding = () => {}
      queueMicrotask(() => {
        callback(response)
        response.emit('data', responseSpec && responseSpec.raw !== undefined
          ? responseSpec.raw
          : JSON.stringify(responseSpec && responseSpec.body || {}))
        response.emit('end')
      })
    }
    return request
  }

  delete require.cache[providerPath]
  const provider = require(providerPath)
  return {
    provider,
    requests,
    restore() {
      https.request = originalRequest
      delete require.cache[providerPath]
      for (const [name, value] of previousEnv) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    },
  }
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex')
}

function order(overrides = {}) {
  return {
    _id: 'order-document-1',
    orderNo: 'M0000001',
    planId: 'monthly_pro',
    productId: 'test-product-monthly_pro',
    payerOpenid: 'openid-1',
    originalAmount: 990,
    payableAmount: 990,
    goodsPrice: 990,
    ...overrides,
  }
}

function withCleanup(t, fixture) {
  t.after(() => fixture.restore())
  return fixture
}

test('virtual payment readiness requires every published product ID explicitly', (t) => {
  for (const name of productEnvNames) {
    const fixture = withCleanup(t, createProvider([], { [name]: undefined }))
    assert.equal(fixture.provider.getCapability().ready, false, `${name} must block readiness`)
    assert.throws(() => fixture.provider.getProduct({ planId: name.slice('VIRTUAL_PAYMENT_PRODUCT_'.length).toLowerCase(), price: 990 }), /商品配置错误/)
    fixture.restore()
  }
})

test('virtual payment products use only their configured IDs', (t) => {
  const fixture = withCleanup(t, createProvider())
  assert.equal(fixture.provider.getCapability().ready, true)
  for (const [index, planId] of planIds.entries()) {
    assert.deepEqual(fixture.provider.getProduct({ planId, price: 990 }), {
      productId: `test-product-${planId}`,
      goodsPrice: 990,
    })
  }
  assert.throws(() => fixture.provider.getProduct({ planId: 'monthly_pro', price: 0 }), /价格配置错误/)
  assert.throws(() => fixture.provider.getProduct({ planId: 'other', price: 990 }), /暂不支持在线购买/)
})

test('preparePayment exchanges login code, checks identity, and signs exact client payload', async (t) => {
  const fixture = withCleanup(t, createProvider([{ body: { openid: 'openid-1', session_key: 'test-session-key' } }]))
  const result = await fixture.provider.preparePayment(order(), { loginCode: 'fresh-login-code', platform: 'android' })
  const request = fixture.requests[0]
  const query = new URL(request.path, 'https://api.weixin.qq.com').searchParams
  assert.equal(request.method, 'GET')
  assert.equal(new URL(request.path, 'https://api.weixin.qq.com').pathname, '/sns/jscode2session')
  assert.equal(query.get('appid'), configuredEnv.WX_APPID)
  assert.equal(query.get('secret'), configuredEnv.WX_APP_SECRET)
  assert.equal(query.get('js_code'), 'fresh-login-code')
  assert.equal(query.get('grant_type'), 'authorization_code')

  const args = result.requestVirtualPaymentArgs
  const signData = JSON.parse(args.signData)
  assert.deepEqual(signData, {
    offerId: configuredEnv.VIRTUAL_PAYMENT_OFFER_ID,
    buyQuantity: 1,
    env: 0,
    currencyType: 'CNY',
    productId: 'test-product-monthly_pro',
    goodsPrice: 990,
    outTradeNo: 'M0000001',
    attach: JSON.stringify({ orderId: 'order-document-1' }),
  })
  assert.equal(args.mode, 'short_series_goods')
  assert.equal(args.paySig, hmac(configuredEnv.VIRTUAL_PAYMENT_APP_KEY, `requestVirtualPayment&${args.signData}`))
  assert.equal(args.signature, hmac('test-session-key', args.signData))
  assert.equal(JSON.stringify(result).includes('test-session-key'), false)
})

test('preparePayment rejects wrong identity, invalid order amounts, and closed iOS gate before payment', async (t) => {
  const wrongIdentity = withCleanup(t, createProvider([{ body: { openid: 'openid-other', session_key: 'session' } }]))
  await assert.rejects(wrongIdentity.provider.preparePayment(order(), { loginCode: 'code' }), /身份不一致/)

  wrongIdentity.restore()
  const invalidAmount = withCleanup(t, createProvider())
  await assert.rejects(invalidAmount.provider.preparePayment(order({ goodsPrice: 991 }), { loginCode: 'code' }), /订单金额不一致/)
  await assert.rejects(invalidAmount.provider.preparePayment(order(), { loginCode: 'code', platform: 'ios' }), /iPhone 支付暂未开放/)
  assert.equal(invalidAmount.requests.length, 0)

  invalidAmount.restore()
  const lowIosAmount = withCleanup(t, createProvider([], { VIRTUAL_PAYMENT_IOS_ENABLED: 'true' }))
  await assert.rejects(lowIosAmount.provider.preparePayment(order({ originalAmount: 99, payableAmount: 99, goodsPrice: 99 }), { loginCode: 'code', platform: 'ios' }), /不能低于 1 元/)
  assert.equal(lowIosAmount.requests.length, 0)
})

test('queryOrder signs exact request body and confirms matching paid amount', async (t) => {
  const paidTime = 1790000000
  const fixture = withCleanup(t, createProvider([
    { body: { access_token: 'test-access-token', expires_in: 7200 } },
    { body: { order: { order_id: 'M0000001', env_type: 1, order_type: 0, status: 2, paid_fee: 990, order_fee: 990, wx_order_id: 'wx-trade-1', paid_time: paidTime } } },
  ]))
  const result = await fixture.provider.queryOrder(order())
  assert.equal(result.state, 'paid')
  assert.equal(result.tradeNo, 'wx-trade-1')
  assert.equal(result.paidAt, new Date(paidTime * 1000).toISOString())
  const request = fixture.requests[1]
  const query = new URL(request.path, 'https://api.weixin.qq.com').searchParams
  assert.equal(new URL(request.path, 'https://api.weixin.qq.com').pathname, '/xpay/query_order')
  assert.equal(query.get('access_token'), 'test-access-token')
  assert.equal(query.get('pay_sig'), hmac(configuredEnv.VIRTUAL_PAYMENT_APP_KEY, `/xpay/query_order&${request.body}`))
  assert.deepEqual(JSON.parse(request.body), { openid: 'openid-1', env: 0, order_id: 'M0000001' })
})

test('queryOrder rejects mismatched identity, status, and platform amount evidence', async (t) => {
  const cases = [
    [{ order_id: 'other-order', env_type: 1, order_type: 0, status: 2, paid_fee: 990, order_fee: 990, wx_order_id: 'wx-trade', paid_time: 1790000000 }, /订单信息不一致/],
    [{ order_id: 'M0000001', env_type: 1, order_type: 0, status: 2, paid_fee: 989, order_fee: 990, wx_order_id: 'wx-trade', paid_time: 1790000000 }, /付款金额或凭据不一致/],
    [{ order_id: 'M0000001', env_type: 1, order_type: 0, status: 2, paid_fee: 990, order_fee: 991, wx_order_id: 'wx-trade', paid_time: 1790000000 }, /付款金额或凭据不一致/],
    [{ order_id: 'M0000001', env_type: 1, order_type: 0, status: 11, paid_fee: 990, order_fee: 990, wx_order_id: 'wx-trade', paid_time: 1790000000 }, /订单状态未知/],
  ]
  for (const [remote, message] of cases) {
    const fixture = withCleanup(t, createProvider([
      { body: { access_token: 'test-access-token', expires_in: 7200 } },
      { body: { order: remote } },
    ]))
    await assert.rejects(fixture.provider.queryOrder(order()), message)
    fixture.restore()
  }
})

test('queryOrder maps closed and refund states without granting paid status', async (t) => {
  for (const [status, expected] of [[5, 'refunded'], [6, 'closed'], [7, 'refund_review'], [8, 'refunded'], [9, 'refund_review'], [10, 'refund_review']]) {
    const fixture = withCleanup(t, createProvider([
      { body: { access_token: 'test-access-token', expires_in: 7200 } },
      { body: { order: { order_id: 'M0000001', env_type: 1, order_type: 0, status } } },
    ]))
    assert.equal((await fixture.provider.queryOrder(order())).state, expected)
    fixture.restore()
  }
})

test('notifyDelivery signs the platform fulfillment request and hides provider details on failure', async (t) => {
  const fixture = withCleanup(t, createProvider([
    { body: { access_token: 'test-access-token', expires_in: 7200 } },
    { body: { errcode: 0 } },
  ]))
  await fixture.provider.notifyDelivery(order())
  const request = fixture.requests[1]
  const query = new URL(request.path, 'https://api.weixin.qq.com').searchParams
  assert.equal(new URL(request.path, 'https://api.weixin.qq.com').pathname, '/xpay/notify_provide_goods')
  assert.equal(query.get('pay_sig'), hmac(configuredEnv.VIRTUAL_PAYMENT_APP_KEY, `/xpay/notify_provide_goods&${request.body}`))
  assert.deepEqual(JSON.parse(request.body), { order_id: 'M0000001', env: 0 })

  fixture.restore()
  const failed = withCleanup(t, createProvider([
    { body: { errcode: 40001, errmsg: 'contains test-access-token and test-virtual-payment-app-key' } },
  ]))
  await assert.rejects(failed.provider.notifyDelivery(order()), (error) => {
    assert.match(error.message, /支付请求未完成/)
    assert.doesNotMatch(error.message, /test-access-token|test-virtual-payment-app-key|contains/)
    return true
  })
})
