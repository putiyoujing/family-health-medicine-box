const crypto = require('crypto')
const https = require('https')

const APP_ID = 'wxc3d708e7c51d5c87'
let cachedToken = null

function config() {
  const appId = String(process.env.WX_APPID || APP_ID).trim()
  const secret = String(process.env.WX_APP_SECRET || '').trim()
  const appKey = String(process.env.VIRTUAL_PAYMENT_APP_KEY || '').trim()
  if (appId !== APP_ID || !secret || !appKey || process.env.VIRTUAL_PAYMENT_ENABLED !== 'true') {
    throw new Error('后台退款支付配置尚未完成')
  }
  return { appId, secret, appKey }
}

function request(path, body) {
  const data = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.weixin.qq.com', path, method: data === undefined ? 'GET' : 'POST',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk; if (raw.length > 262144) req.destroy(new Error('response too large')) })
      res.on('error', reject)
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('微信支付接口暂不可用'))
        let result
        try { result = JSON.parse(raw) } catch { return reject(new Error('微信支付接口响应异常')) }
        if (!result || typeof result !== 'object' || Array.isArray(result)) return reject(new Error('微信支付接口响应异常'))
        if (result.errcode !== undefined && result.errcode !== 0) return reject(new Error(`微信支付接口错误 ${Number(result.errcode) || 'unknown'}`))
        resolve(result)
      })
    })
    req.setTimeout(6000, () => req.destroy(new Error('timeout')))
    req.on('error', () => reject(new Error('微信支付网络暂不可用')))
    req.end(data)
  })
}

async function signedRequest(path, body) {
  const { appId, secret, appKey } = config()
  if (!cachedToken || cachedToken.expiresAt <= Date.now()) {
    const token = await request('/cgi-bin/stable_token', { grant_type: 'client_credential', appid: appId, secret, force_refresh: false })
    if (!token.access_token || !Number.isFinite(Number(token.expires_in))) throw new Error('微信支付凭证暂不可用')
    cachedToken = { value: token.access_token, expiresAt: Date.now() + Math.max(0, Number(token.expires_in) - 120) * 1000 }
  }
  const raw = JSON.stringify(body)
  const paySig = crypto.createHmac('sha256', appKey).update(`${path}&${raw}`, 'utf8').digest('hex')
  const query = new URLSearchParams({ access_token: cachedToken.value, pay_sig: paySig })
  return request(`${path}?${query}`, body)
}

async function queryPaidOrder(order) {
  if (!order.orderNo || !order.payerOpenid) throw new Error('订单支付信息不完整')
  const result = await signedRequest('/xpay/query_order', { openid: order.payerOpenid, env: 0, order_id: order.orderNo })
  const remote = result.order
  if (!remote || remote.order_id !== order.orderNo || remote.env_type !== 1 || remote.order_type !== 0
    || ![2, 3, 4].includes(remote.status) || remote.paid_fee !== Number(order.payableAmount)
    || remote.wx_order_id !== order.paymentTradeNo || !Number.isSafeInteger(remote.left_fee)) {
    throw new Error('平台订单信息与本地不一致，请先核查')
  }
  return { leftFee: remote.left_fee }
}

async function requestRefund(order, { refundOrderId, refundAmount, leftFee }) {
  const response = await signedRequest('/xpay/refund_order', {
    openid: order.payerOpenid, order_id: order.orderNo, refund_order_id: refundOrderId,
    left_fee: leftFee, refund_fee: refundAmount, biz_meta: JSON.stringify({ orderId: order._id }),
    refund_reason: 5, req_from: 1, env: 0,
  })
  if (response.refund_order_id !== refundOrderId) throw new Error('平台退款单号不一致')
  return response
}

module.exports = { queryPaidOrder, requestRefund }
