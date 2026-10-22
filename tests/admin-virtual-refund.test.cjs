const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const EventEmitter = require('node:events')
const https = require('node:https')
const path = require('node:path')
const test = require('node:test')

const modulePath = path.resolve(__dirname, '../cloudfunctions/adminApi/virtual-refund.js')
const envKeys = ['WX_APPID', 'WX_APP_SECRET', 'VIRTUAL_PAYMENT_APP_KEY', 'VIRTUAL_PAYMENT_ENABLED', 'VIRTUAL_PAYMENT_TEST_OPENID']

function fixture(t, responses) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]))
  process.env.WX_APPID = 'wxc3d708e7c51d5c87'
  process.env.WX_APP_SECRET = 'fixture-secret'
  process.env.VIRTUAL_PAYMENT_APP_KEY = 'fixture-key'
  process.env.VIRTUAL_PAYMENT_ENABLED = 'true'
  const originalRequest = https.request
  const requests = []
  https.request = (options, callback) => {
    const recorded = { ...options }
    requests.push(recorded)
    const req = new EventEmitter()
    req.setTimeout = () => {}
    req.destroy = (error) => queueMicrotask(() => req.emit('error', error))
    req.end = (body) => {
      recorded.body = body
      const spec = responses.shift() || {}
      const res = new EventEmitter()
      res.statusCode = 200
      res.setEncoding = () => {}
      queueMicrotask(() => { callback(res); res.emit('data', JSON.stringify(spec)); res.emit('end') })
    }
    return req
  }
  delete require.cache[modulePath]
  t.after(() => {
    https.request = originalRequest
    delete require.cache[modulePath]
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return { provider: require(modulePath), requests }
}

const order = { _id: 'order-a', orderNo: 'M0000001', payerOpenid: 'openid-1', payableAmount: 990, paymentTradeNo: 'wx-trade-1' }

test('admin refund uses a fresh platform balance and signs the exact requested amount', async (t) => {
  const f = fixture(t, [
    { access_token: 'fixture-token', expires_in: 7200 },
    { order: { order_id: order.orderNo, env_type: 1, order_type: 0, status: 4, paid_fee: 990, left_fee: 990, wx_order_id: 'wx-trade-1' } },
    { refund_order_id: 'rf_12345678' },
  ])
  assert.equal((await f.provider.queryPaidOrder(order)).leftFee, 990)
  await f.provider.requestRefund(order, { refundOrderId: 'rf_12345678', refundAmount: 100, leftFee: 990 })
  const request = f.requests[2]
  const url = new URL(request.path, 'https://api.weixin.qq.com')
  assert.equal(url.pathname, '/xpay/refund_order')
  const body = JSON.parse(request.body)
  assert.equal(body.refund_fee, 100)
  assert.equal(body.left_fee, 990)
  assert.equal(body.refund_order_id, 'rf_12345678')
  assert.equal(body.req_from, 1)
  assert.equal(body.env, 0)
  assert.equal(url.searchParams.get('pay_sig'), crypto.createHmac('sha256', 'fixture-key').update(`/xpay/refund_order&${request.body}`).digest('hex'))
})

test('admin refund rejects mismatched platform trade or balance', async (t) => {
  const f = fixture(t, [
    { access_token: 'fixture-token', expires_in: 7200 },
    { order: { order_id: order.orderNo, env_type: 1, order_type: 0, status: 4, paid_fee: 990, left_fee: 990, wx_order_id: 'wrong-trade' } },
  ])
  await assert.rejects(f.provider.queryPaidOrder(order), /平台订单信息与本地不一致/)
  assert.equal(f.requests.length, 2)
})

test('one-yuan tester order can be refunded while normal payment is closed', async (t) => {
  const f = fixture(t, [
    { access_token: 'fixture-token', expires_in: 7200 },
    { order: { order_id: order.orderNo, env_type: 1, order_type: 0, status: 4, paid_fee: 100, left_fee: 100, wx_order_id: 'wx-trade-1' } },
    { refund_order_id: 'rf_12345678' },
  ])
  process.env.VIRTUAL_PAYMENT_ENABLED = 'false'
  process.env.VIRTUAL_PAYMENT_TEST_OPENID = 'openid-1'
  const testOrder = { ...order, planId: 'test_monthly_pro', productId: 'pay_test_01', payableAmount: 100 }
  assert.equal((await f.provider.queryPaidOrder(testOrder)).leftFee, 100)
  await f.provider.requestRefund(testOrder, { refundOrderId: 'rf_12345678', refundAmount: 100, leftFee: 100 })
  assert.equal(JSON.parse(f.requests[2].body).refund_fee, 100)
  await assert.rejects(f.provider.queryPaidOrder({ ...testOrder, payerOpenid: 'another-user' }), /配置尚未完成/)
  await assert.rejects(f.provider.queryPaidOrder({ ...testOrder, productId: 'other-product' }), /配置尚未完成/)
  assert.equal(f.requests.length, 3)
})
