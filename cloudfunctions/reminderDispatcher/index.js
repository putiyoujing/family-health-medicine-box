const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database({
  throwOnNotFound: false,
})
const _ = db.command

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
    await cloud.openapi.subscribeMessage.send({
      touser: todo.notificationOpenid,
      page: 'pages/reminders/index',
      lang: 'zh_CN',
      templateId: config.templateId,
      miniprogramState: config.miniprogramState,
      data: buildTemplateData(todo, config.fields),
    })
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
  let fields = {}
  try {
    fields = JSON.parse(process.env.HEALTH_TODO_TEMPLATE_FIELDS || '{}')
  } catch (error) {
    return { ready: false, reason: 'HEALTH_TODO_TEMPLATE_FIELDS is not valid JSON' }
  }
  if (!templateId) {
    return { ready: false, reason: 'HEALTH_TODO_TEMPLATE_ID is empty' }
  }
  if (!fields.title || !fields.time) {
    return { ready: false, reason: 'template field mapping requires title and time' }
  }
  return {
    ready: true,
    templateId,
    fields,
    miniprogramState: String(process.env.HEALTH_TODO_MINIPROGRAM_STATE || 'formal').trim(),
  }
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
