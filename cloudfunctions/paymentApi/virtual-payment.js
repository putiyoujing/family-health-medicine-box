const crypto = require('crypto')
const https = require('https')

const APP_ID = 'wxc3d708e7c51d5c87'
const OFFER_ID = '1450655131'
const PROVIDER = 'official_virtual_payment'
const PLAN_IDS = ['monthly_pro', 'yearly_pro', 'monthly_unlimited', 'yearly_unlimited']
const PRODUCT_ENV_PREFIX = 'VIRTUAL_PAYMENT_PRODUCT_'
let tokenCache = null
let tokenRequest = null

function settings() {
  return {
    appId: process.env.WX_APPID || APP_ID,
    appSecret: String(process.env.WX_APP_SECRET || '').trim(),
    offerId: String(process.env.VIRTUAL_PAYMENT_OFFER_ID || OFFER_ID).trim(),
    appKey: String(process.env.VIRTUAL_PAYMENT_APP_KEY || '').trim(),
  }
}

function getCapability() {
  const config = settings()
  const productsReady = PLAN_IDS.every((planId) => {
    const productId = String(process.env[`${PRODUCT_ENV_PREFIX}${planId.toUpperCase()}`] || '').trim()
    return productId.length > 0 && productId.length <= 128
  })
  const ready = process.env.VIRTUAL_PAYMENT_ENABLED === 'true'
    && config.appId === APP_ID && /^\d+$/.test(config.offerId)
    && Boolean(config.appSecret && config.appKey && productsReady)
  return {
    ready,
    provider: PROVIDER,
    iosEnabled: ready && process.env.VIRTUAL_PAYMENT_IOS_ENABLED === 'true',
    couponsEnabled: false,
    reason: ready ? '' : '在线支付准备中，可使用已有会员兑换码。',
  }
}

function requireConfigured() {
  if (!getCapability().ready) throw new Error(getCapability().reason)
  return settings()
}

function getProduct(plan) {
  if (!plan || !PLAN_IDS.includes(plan.planId)) throw new Error('该套餐暂不支持在线购买')
  const goodsPrice = Number(plan.price)
  if (!Number.isSafeInteger(goodsPrice) || goodsPrice <= 0) throw new Error('套餐价格配置错误')
  const productId = String(process.env[`${PRODUCT_ENV_PREFIX}${plan.planId.toUpperCase()}`] || '').trim()
  if (!productId || productId.length > 128) throw new Error('套餐商品配置错误')
  return { productId, goodsPrice }
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex')
}

async function preparePayment(order, { loginCode, platform } = {}) {
  const config = requireConfigured()
  if (platform === 'ios' && !getCapability().iosEnabled) throw new Error('iPhone 支付暂未开放，可使用已有兑换码。')
  if (typeof loginCode !== 'string' || !loginCode.trim() || loginCode.length > 256) throw new Error('请重新登录后再支付')
  const amount = Number(order.payableAmount)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount !== Number(order.originalAmount) || amount !== Number(order.goodsPrice)) throw new Error('订单金额不一致，请重新确认套餐')
  if (platform === 'ios' && amount < 100) throw new Error('iPhone 支付金额不能低于 1 元')
  if (!/^[A-Za-z0-9|*@-][A-Za-z0-9_|*@-]{7,31}$/.test(order.orderNo || '') || !order.productId || !order.payerOpenid) throw new Error('订单支付信息不完整')
  const query = new URLSearchParams({ appid: config.appId, secret: config.appSecret, js_code: loginCode, grant_type: 'authorization_code' })
  const session = await requestJson(`/sns/jscode2session?${query}`)
  if (session.openid !== order.payerOpenid || !session.session_key) throw new Error('支付登录身份不一致，请重新登录')
  const signData = JSON.stringify({
    offerId: config.offerId, buyQuantity: 1, env: 0, currencyType: 'CNY',
    productId: order.productId, goodsPrice: amount, outTradeNo: order.orderNo,
    attach: JSON.stringify({ orderId: order._id || order.orderId }),
  })
  return {
    ready: true,
    provider: PROVIDER,
    requestVirtualPaymentArgs: {
      signData, mode: 'short_series_goods',
      paySig: hmac(config.appKey, `requestVirtualPayment&${signData}`),
      signature: hmac(session.session_key, signData),
    },
  }
}

async function getAccessToken() {
  const config = requireConfigured()
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value
  if (!tokenRequest) {
    tokenRequest = requestJson('/cgi-bin/stable_token', {
      grant_type: 'client_credential', appid: config.appId, secret: config.appSecret, force_refresh: false,
    }).then((result) => {
      if (!result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new Error('支付凭证暂不可用，请稍后重试')
      tokenCache = { value: result.access_token, expiresAt: Date.now() + Math.max(0, Number(result.expires_in) - 120) * 1000 }
      return tokenCache.value
    }).finally(() => { tokenRequest = null })
  }
  return tokenRequest
}

async function signedRequest(path, data) {
  const config = requireConfigured()
  const body = JSON.stringify(data)
  const accessToken = await getAccessToken()
  const query = new URLSearchParams({ access_token: accessToken, pay_sig: hmac(config.appKey, `${path}&${body}`) })
  try {
    return await requestJson(`${path}?${query}`, body)
  } catch (error) {
    if ([40001, 40014, 42001].includes(error.wechatCode)) tokenCache = null
    throw error
  }
}

async function queryOrder(order) {
  if (!order.orderNo || !order.payerOpenid) throw new Error('订单支付信息不完整')
  const response = await signedRequest('/xpay/query_order', { openid: order.payerOpenid, env: 0, order_id: order.orderNo })
  const remote = response.order
  if (!remote || remote.order_id !== order.orderNo || remote.env_type !== 1 || ![0, 7].includes(remote.order_type)) throw new Error('平台订单信息不一致，请联系客服核查')
  const status = remote.status
  if (!Number.isInteger(status) || status < 0 || status > 10) throw new Error('平台订单状态未知，请稍后重试')
  const result = { status, state: 'pending', tradeNo: remote.wx_order_id || '', platformDelivered: status === 4 }
  if ([5, 8].includes(status)) return { ...result, state: 'refunded' }
  if ([7, 9, 10].includes(status)) return { ...result, state: 'refund_review' }
  if (status === 6) return { ...result, state: 'closed' }
  if (![2, 3, 4].includes(status)) return result
  if (!Number.isSafeInteger(remote.paid_fee) || remote.paid_fee !== Number(order.payableAmount)
    || remote.order_fee !== Number(order.payableAmount) || !remote.wx_order_id
    || !Number.isFinite(remote.paid_time) || remote.paid_time <= 0) throw new Error('平台付款金额或凭据不一致，请联系客服核查')
  return { ...result, state: 'paid', paidAt: new Date(remote.paid_time * 1000).toISOString() }
}

async function notifyDelivery(order) {
  if (!order.orderNo) throw new Error('订单支付信息不完整')
  await signedRequest('/xpay/notify_provide_goods', { order_id: order.orderNo, env: 0 })
}

function requestJson(path, data) {
  const body = data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data)
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'api.weixin.qq.com', path, method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        text += chunk
        if (text.length > 262144) request.destroy(new Error('response too large'))
      })
      response.on('error', () => reject(new Error('支付服务响应中断，请稍后重试')))
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error('支付服务暂不可用，请稍后重试'))
        let result
        try { result = JSON.parse(text) } catch { return reject(new Error('支付服务响应异常，请稍后重试')) }
        if (!result || typeof result !== 'object' || Array.isArray(result)) return reject(new Error('支付服务响应异常，请稍后重试'))
        if (result.errcode !== undefined && result.errcode !== 0) {
          const code = Number(result.errcode)
          const error = new Error(`微信支付请求未完成（${Number.isFinite(code) ? code : 'unknown'}），请稍后重试`)
          error.wechatCode = code
          return reject(error)
        }
        resolve(result)
      })
    })
    request.setTimeout(6000, () => request.destroy(new Error('timeout')))
    request.on('error', () => reject(new Error('支付网络暂不可用，请稍后重试')))
    request.end(body)
  })
}

module.exports = { getCapability, getProduct, preparePayment, queryOrder, notifyDelivery }
