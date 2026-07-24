const cloud = require('wx-server-sdk')
const https = require('node:https')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database({
  throwOnNotFound: false,
})
const _ = db.command
const WECHAT_API_HOST = 'api.weixin.qq.com'
let cachedAccessToken = null
let cachedAccessTokenExpiresAt = 0

exports.main = async () => {
  const config = readSubscriptionConfig()
  if (!config.ready) {
    console.warn('health todo subscription is not configured', config.reason)
    return { ok: false, skipped: true, reason: config.reason }
  }

  const nowMs = Date.now()
  const result = await db
    .collection('reminders')
    .where({
      status: 'active',
      deliveryStatus: 'scheduled',
      remindAtMs: _.lte(nowMs),
      deletedAt: _.exists(false),
    })
    .orderBy('remindAtMs', 'asc')
    .limit(100)
    .get()

  const outcomes = []
  for (const todo of result.data) {
    const claimed = await claimTodo(todo._id)
    if (!claimed) {
      continue
    }
    outcomes.push(await sendHealthTodo(todo, config))
  }

  return {
    ok: true,
    due: result.data.length,
    sent: outcomes.filter((item) => item.status === 'sent').length,
    failed: outcomes.filter((item) => item.status === 'failed').length,
  }
}

async function claimTodo(id) {
  return db.runTransaction(async (transaction) => {
    const reference = transaction.collection('reminders').doc(id)
    const result = await reference.get()
    const current = result.data
    if (!current || current.deletedAt || current.status !== 'active' || current.deliveryStatus !== 'scheduled') {
      return false
    }
    await reference.update({
      data: {
        deliveryStatus: 'sending',
        deliveryStartedAt: db.serverDate(),
      },
    })
    return true
  })
}

async function sendHealthTodo(todo, config) {
  try {
    if (!todo.notificationOpenid) {
      throw new Error('notification recipient is missing')
    }
    await sendSubscriptionMessage({
      touser: todo.notificationOpenid,
      page: 'pages/reminders/index',
      lang: 'zh_CN',
      template_id: config.templateId,
      miniprogram_state: config.miniprogramState,
      data: buildTemplateData(todo, config.fields),
    }, config)
    await updateDelivery(todo._id, {
      deliveryStatus: 'sent',
      deliveredAt: db.serverDate(),
      lastDeliveryError: '',
    })
    return { id: todo._id, status: 'sent' }
  } catch (error) {
    const message = safeErrorMessage(error)
    console.error('health todo delivery failed', todo._id, message)
    await updateDelivery(todo._id, {
      deliveryStatus: 'failed',
      deliveryFailedAt: db.serverDate(),
      lastDeliveryError: message,
    })
    return { id: todo._id, status: 'failed' }
  }
}

function buildTemplateData(todo, fields) {
  const data = {
    [fields.title]: { value: truncate(todo.title || '健康待办', 20) },
    [fields.time]: { value: formatTemplateTime(todo.remindAtMs, todo.remindAt) },
  }
  if (fields.member) {
    data[fields.member] = { value: truncate(todo.memberNameSnapshot || '家人', 20) }
  }
  if (fields.note) {
    data[fields.note] = { value: truncate(todo.note || todo.illnessSummarySnapshot || '请按计划处理', 20) }
  }
  return data
}

function readSubscriptionConfig() {
  const templateId = String(process.env.HEALTH_TODO_TEMPLATE_ID || '').trim()
  const appId = String(process.env.WECHAT_MINIPROGRAM_APP_ID || '').trim()
  const appSecret = String(process.env.WECHAT_MINIPROGRAM_APP_SECRET || '').trim()
  let fields = {}
  try {
    fields = JSON.parse(process.env.HEALTH_TODO_TEMPLATE_FIELDS || '{}')
  } catch (error) {
    return { ready: false, reason: 'HEALTH_TODO_TEMPLATE_FIELDS is not valid JSON' }
  }
  if (!templateId) {
    return { ready: false, reason: 'HEALTH_TODO_TEMPLATE_ID is empty' }
  }
  if (!appId || !appSecret) {
    return { ready: false, reason: 'WeChat server credentials are not configured' }
  }
  if (!fields.title || !fields.time) {
    return { ready: false, reason: 'template field mapping requires title and time' }
  }
  return {
    ready: true,
    templateId,
    appId,
    appSecret,
    fields,
    miniprogramState: String(process.env.HEALTH_TODO_MINIPROGRAM_STATE || 'formal').trim(),
  }
}

async function sendSubscriptionMessage(payload, config) {
  let accessToken = await getAccessToken(config)
  let result = await requestWechatJson({
    method: 'POST',
    path: `/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
    body: payload,
  })
  if (result.errcode === 40001 || result.errcode === 42001) {
    clearAccessTokenCache()
    accessToken = await getAccessToken(config)
    result = await requestWechatJson({
      method: 'POST',
      path: `/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
      body: payload,
    })
  }
  ensureWechatSuccess(result, 'subscribe message send')
}

async function getAccessToken(config) {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now()) {
    return cachedAccessToken
  }
  const result = await requestWechatJson({
    path: `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(config.appId)}&secret=${encodeURIComponent(config.appSecret)}`,
  })
  ensureWechatSuccess(result, 'access token request')
  if (!result.access_token) {
    throw new Error('WeChat access token is missing')
  }
  cachedAccessToken = result.access_token
  cachedAccessTokenExpiresAt = Date.now() + Math.max((Number(result.expires_in) || 7200) - 300, 60) * 1000
  return cachedAccessToken
}

function clearAccessTokenCache() {
  cachedAccessToken = null
  cachedAccessTokenExpiresAt = 0
}

function requestWechatJson({ method = 'GET', path, body }) {
  const payload = body ? JSON.stringify(body) : ''
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: WECHAT_API_HOST,
      method,
      path,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : undefined,
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch (error) {
          reject(new Error(`WeChat API returned invalid JSON: ${raw.slice(0, 200)}`))
        }
      })
    })
    request.setTimeout(10000, () => request.destroy(new Error('WeChat API request timed out')))
    request.on('error', reject)
    if (payload) {
      request.write(payload)
    }
    request.end()
  })
}

function ensureWechatSuccess(result, action) {
  if (result && Number(result.errcode || 0) === 0) {
    return
  }
  const code = result && result.errcode !== undefined ? result.errcode : 'unknown'
  const message = result && result.errmsg ? result.errmsg : 'unknown error'
  throw new Error(`WeChat ${action} failed: ${code} ${message}`)
}

function formatTemplateTime(timestamp, fallback) {
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) {
    return String(fallback || '').replace('-', '年').replace('-', '月').replace(' ', '日 ')
  }
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const year = chinaTime.getUTCFullYear()
  const month = `${chinaTime.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${chinaTime.getUTCDate()}`.padStart(2, '0')
  const hour = `${chinaTime.getUTCHours()}`.padStart(2, '0')
  const minute = `${chinaTime.getUTCMinutes()}`.padStart(2, '0')
  return `${year}年${month}月${day}日 ${hour}:${minute}`
}

function truncate(value, limit) {
  return Array.from(String(value || '')).slice(0, limit).join('')
}

function safeErrorMessage(error) {
  const message = String((error && (error.errMsg || error.message)) || error || 'unknown error')
  return message.slice(0, 200)
}

function updateDelivery(id, data) {
  return db.collection('reminders').doc(id).update({
    data: {
      ...data,
      updatedAt: db.serverDate(),
    },
  })
}
