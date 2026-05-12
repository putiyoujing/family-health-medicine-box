const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const DATA_TABLES = [
  { id: 'users', name: '用户表', collection: 'users', statKey: 'users' },
  { id: 'families', name: '家庭表', collection: 'families', statKey: 'families' },
  { id: 'orders', name: '订单表', collection: 'orders', statKey: 'orders' },
  { id: 'subscriptions', name: '会员家庭表', collection: 'subscriptions', statKey: 'subscriptions' },
  { id: 'coupons', name: '优惠券表', collection: 'coupons', statKey: 'coupons' },
  { id: 'aiUsage', name: 'AI 用量表', collection: 'ai_usage_logs', statKey: 'aiUsageLogs' },
  { id: 'medicines', name: '药品表', collection: 'medicines', statKey: 'medicines' },
  { id: 'illness', name: '健康记录表', collection: 'illness_records', statKey: 'illnessRecords' },
  { id: 'medication', name: '用药记录表', collection: 'medication_logs', statKey: 'medicationLogs' },
  { id: 'attachments', name: '附件表', collection: 'attachments', statKey: 'attachments' },
]

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'getDashboard'
  const payload = event.payload || {}

  try {
    await assertAdmin(openid, event)

    switch (action) {
      case 'getDashboard':
        return ok(await getDashboard())
      case 'getDataOverview':
        return ok(await getDataOverview())
      case 'listUsers':
        return ok(await pageList('users', payload))
      case 'listFamilies':
        return ok(await pageList('families', payload))
      case 'listMedicines':
        return ok(await pageList('medicines', payload))
      case 'listIllness':
        return ok(await pageList('illness_records', payload))
      case 'listMedication':
        return ok(await pageList('medication_logs', payload))
      case 'listAttachments':
        return ok(await pageList('attachments', payload))
      case 'listOrders':
      case 'adminListOrders':
        return ok(await pageList('orders', payload))
      case 'listSubscriptions':
      case 'adminListSubscriptions':
        return ok(await pageList('subscriptions', payload))
      case 'listCoupons':
      case 'adminListCoupons':
        return ok(await pageList('coupons', payload))
      case 'listAiUsage':
      case 'adminListAiUsage':
        return ok(await pageList('ai_usage_logs', payload))
      case 'createCoupon':
      case 'adminCreateCoupon':
        return ok(await createCoupon(payload))
      case 'updateCoupon':
      case 'adminUpdateCoupon':
        return ok(await updateCoupon(payload))
      default:
        return fail(`unknown admin action: ${action}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'admin server error')
  }
}

async function assertAdmin(openid, event) {
  const webToken = process.env.ADMIN_WEB_TOKEN
  const requestToken =
    event.adminToken ||
    event.token ||
    (event.headers && (event.headers['x-admin-token'] || event.headers['X-Admin-Token']))

  if (webToken && requestToken && requestToken === webToken) {
    return
  }

  const result = await db
    .collection('admins')
    .where({
      openid,
      status: 'active',
    })
    .limit(1)
    .get()

  if (!result.data.length) {
    throw new Error('no admin permission')
  }
}

async function getDashboard() {
  const [
    users,
    families,
    members,
    medicines,
    illnessRecords,
    medicationLogs,
    attachments,
    reminders,
    orders,
    paidOrders,
    subscriptions,
    activeSubscriptions,
    coupons,
    couponRedemptions,
    aiUsageLogs,
  ] =
    await Promise.all([
    count('users'),
    count('families'),
    count('family_members'),
    count('medicines'),
    count('illness_records'),
    count('medication_logs'),
    count('attachments'),
    count('reminders'),
    count('orders'),
    countWhere('orders', { status: 'paid', deletedAt: _.exists(false) }),
    count('subscriptions'),
    countActiveSubscriptions(),
    count('coupons'),
    countWhere('coupon_redemptions', { status: 'used' }),
    count('ai_usage_logs'),
  ])

  const [
    recentUsers,
    recentIllness,
    recentMedication,
    recentOrders,
    recentSubscriptions,
    recentCoupons,
    recentAiUsage,
    medicineSample,
    memberSample,
    attachmentSample,
    paidOrderSample,
  ] =
    await Promise.all([
      latest('users', 8),
      latest('illness_records', 8),
      latest('medication_logs', 8),
      latest('orders', 8),
      latest('subscriptions', 8),
      latest('coupons', 8),
      latest('ai_usage_logs', 8),
      sample('medicines', 100),
      sample('family_members', 100),
      sample('attachments', 100),
      paidOrdersSample(200),
    ])

  const expiringMedicines = medicineSample.data
    .filter((medicine) => daysUntil(medicine.expireDate) <= 60)
    .sort((a, b) => daysUntil(a.expireDate) - daysUntil(b.expireDate))
    .slice(0, 20)
  const lowStockMedicines = medicineSample.data
    .filter((medicine) => isLowStock(medicine))
    .slice(0, 20)
  const missingProfileMembers = memberSample.data.filter(
    (member) => !member.allergyHistory && !member.medicalHistory,
  )
  const pendingOcrAttachments = attachmentSample.data.filter(
    (attachment) => !attachment.ocrText,
  )
  const trend = {
    users: await trendCount('users', 'createdAt', 7),
    illnessRecords: await trendCount('illness_records', 'createdAt', 7),
    medicationLogs: await trendCount('medication_logs', 'createdAt', 7),
    medicines: await trendCount('medicines', 'createdAt', 7),
    orders: await trendCount('orders', 'createdAt', 7),
    paidOrders: await trendCountWhere('orders', 'paidAt', 7, { status: 'paid' }),
    aiUsage: await trendCount('ai_usage_logs', 'createdAt', 7),
  }
  const revenue = buildRevenue(paidOrderSample.data)
  const aiUsage = buildAiUsage(recentAiUsage.data)

  return {
    stats: {
      users,
      families,
      members,
      medicines,
      illnessRecords,
      medicationLogs,
      attachments,
      reminders,
      orders,
      paidOrders,
      subscriptions,
      activeSubscriptions,
      coupons,
      couponRedemptions,
      aiUsageLogs,
    },
    revenue,
    membership: {
      paidOrders,
      pendingOrders: Math.max(orders - paidOrders, 0),
      subscriptions,
      activeSubscriptions,
      conversionRate: ratio(paidOrders, users),
      memberFamilyRate: ratio(activeSubscriptions, families),
    },
    health: {
      averageMembersPerFamily: ratio(members, families),
      averageMedicinesPerFamily: ratio(medicines, families),
      averageIllnessPerFamily: ratio(illnessRecords, families),
      averageMedicationPerIllness: ratio(medicationLogs, illnessRecords),
      attachmentCoverageRate: ratio(attachments, illnessRecords),
    },
    risk: {
      expiringMedicines: expiringMedicines.length,
      lowStockMedicines: lowStockMedicines.length,
      missingProfileMembers: missingProfileMembers.length,
      pendingOcrAttachments: pendingOcrAttachments.length,
    },
    trend,
    aiUsage,
    recentUsers: recentUsers.data,
    recentIllness: recentIllness.data,
    recentMedication: recentMedication.data,
    recentOrders: recentOrders.data,
    recentSubscriptions: recentSubscriptions.data,
    recentCoupons: recentCoupons.data,
    recentAiUsage: recentAiUsage.data,
    expiringMedicines,
    lowStockMedicines,
    missingProfileMembers: missingProfileMembers.slice(0, 20),
    pendingOcrAttachments: pendingOcrAttachments.slice(0, 20),
    generatedAt: new Date().toISOString(),
  }
}

async function count(collection) {
  try {
    const result = await db
      .collection(collection)
      .where({
        deletedAt: _.exists(false),
      })
      .count()
    return result.total
  } catch (error) {
    console.warn(`count ${collection}`, error.message)
    return 0
  }
}

async function countWhere(collection, query) {
  try {
    const result = await db.collection(collection).where(query).count()
    return result.total
  } catch (error) {
    console.warn(`countWhere ${collection}`, error.message)
    return 0
  }
}

async function countActiveSubscriptions() {
  try {
    const result = await db
      .collection('subscriptions')
      .where({
        status: 'active',
        expireAt: _.gt(new Date()),
        deletedAt: _.exists(false),
      })
      .count()
    return result.total
  } catch (error) {
    console.warn('countActiveSubscriptions', error.message)
    return 0
  }
}

async function latest(collection, limit) {
  try {
    return await db
      .collection(collection)
      .where({
        deletedAt: _.exists(false),
      })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
  } catch (error) {
    console.warn(`latest ${collection}`, error.message)
    return {
      data: [],
    }
  }
}

async function sample(collection, limit) {
  try {
    return await db
      .collection(collection)
      .where({
        deletedAt: _.exists(false),
      })
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get()
  } catch (error) {
    console.warn(`sample ${collection}`, error.message)
    return {
      data: [],
    }
  }
}

async function paidOrdersSample(limit) {
  try {
    return db
      .collection('orders')
      .where({
        deletedAt: _.exists(false),
        status: 'paid',
      })
      .orderBy('paidAt', 'desc')
      .limit(limit)
      .get()
  } catch (error) {
    console.warn('paidOrdersSample', error.message)
    return {
      data: [],
    }
  }
}

async function trendCount(collection, field, days) {
  return trendCountWhere(collection, field, days, {})
}

async function trendCountWhere(collection, field, days, extraQuery) {
  const trend = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = dateOffset(-index)
    const nextDay = dateOffset(-index + 1)
    let total = 0
    try {
      const result = await db
        .collection(collection)
        .where({
          ...extraQuery,
          deletedAt: _.exists(false),
          [field]: _.gte(day).and(_.lt(nextDay)),
        })
        .count()
      total = result.total
    } catch (error) {
      console.warn(`trend ${collection}`, error.message)
    }
    trend.push({
      date: formatDateLabel(day),
      count: total,
    })
  }
  return trend
}

async function pageList(collection, payload) {
  const limit = Math.min(Number(payload.limit || 50), 100)
  const skip = Math.max(Number(payload.skip || 0), 0)
  const query = {
    deletedAt: _.exists(false),
  }
  let result = {
    data: [],
  }
  let total = 0
  try {
    const collectionRef = db.collection(collection).where(query)
    const [countResult, listResult] = await Promise.all([
      collectionRef.count(),
      collectionRef.orderBy('createdAt', 'desc').skip(skip).limit(limit).get(),
    ])
    total = countResult.total || 0
    result = listResult
  } catch (error) {
    console.warn(`pageList ${collection}`, error.message)
  }
  return {
    list: result.data,
    skip,
    limit,
    total,
    hasMore: skip + result.data.length < total,
  }
}

async function getDataOverview() {
  const rows = await Promise.all(
    DATA_TABLES.map(async (table) => ({
      ...table,
      total: await count(table.collection),
    })),
  )
  return {
    tables: rows,
    generatedAt: new Date().toISOString(),
  }
}

async function createCoupon(payload) {
  const code = String(payload.code || '').trim().toUpperCase()
  if (!code) {
    throw new Error('coupon code is required')
  }
  const existing = await db
    .collection('coupons')
    .where({
      code,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (existing.data.length) {
    throw new Error('coupon code already exists')
  }
  const now = db.serverDate()
  const data = normalizeCouponPayload(payload)
  const result = await db.collection('coupons').add({
    data: {
      ...data,
      code,
      usedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  })
  return {
    id: result._id,
    code,
  }
}

async function updateCoupon(payload) {
  const id = payload._id || payload.id
  if (!id) {
    throw new Error('coupon id is required')
  }
  const data = normalizeCouponPayload(payload)
  delete data.code
  await db.collection('coupons').doc(id).update({
    data: {
      ...data,
      updatedAt: db.serverDate(),
    },
  })
  return {
    id,
  }
}

function normalizeCouponPayload(payload) {
  return {
    name: payload.name || '未命名优惠券',
    code: payload.code ? String(payload.code).trim().toUpperCase() : undefined,
    type: payload.type || 'fixed_amount',
    value: Number(payload.value || 0),
    applicablePlans: Array.isArray(payload.applicablePlans) ? payload.applicablePlans : [],
    minAmount: Number(payload.minAmount || 0),
    maxDiscountAmount: Number(payload.maxDiscountAmount || 0),
    totalQuantity: Number(payload.totalQuantity || 0),
    perUserLimit: Number(payload.perUserLimit || 1),
    perFamilyLimit: Number(payload.perFamilyLimit || 1),
    startAt: payload.startAt || null,
    endAt: payload.endAt || null,
    familyId: payload.familyId || '',
    status: payload.status || 'active',
  }
}

function buildRevenue(orders) {
  const paid = orders || []
  const revenueAmount = paid.reduce((sum, order) => sum + Number(order.payableAmount || 0), 0)
  const discountAmount = paid.reduce((sum, order) => sum + Number(order.discountAmount || 0), 0)
  const yearlyOrders = paid.filter((order) => order.planId === 'yearly_pro').length
  const monthlyOrders = paid.filter((order) => order.planId === 'monthly_pro').length
  return {
    revenueAmount,
    discountAmount,
    averageOrderAmount: paid.length ? Math.round(revenueAmount / paid.length) : 0,
    yearlyOrders,
    monthlyOrders,
  }
}

function buildAiUsage(logs) {
  const summary = {
    total: logs.length,
    assistantQuery: 0,
    imageParse: 0,
  }
  logs.forEach((log) => {
    if (log.usageType === 'image_parse') {
      summary.imageParse += Number(log.count || 1)
    } else {
      summary.assistantQuery += Number(log.count || 1)
    }
  })
  return summary
}

function dateOffset(offset) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

function formatDateLabel(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysUntil(dateValue) {
  if (!dateValue) {
    return Number.POSITIVE_INFINITY
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateValue)
  if (Number.isNaN(target.getTime())) {
    return Number.POSITIVE_INFINITY
  }
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function isLowStock(medicine) {
  const total = Number(medicine.totalQuantity || 0)
  const remaining = Number(medicine.remainingQuantity || 0)
  return total > 0 && remaining <= Math.max(1, total * 0.25)
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return 0
  }
  return Math.round((numerator / denominator) * 100) / 100
}

function ok(data) {
  return {
    ok: true,
    data,
  }
}

function fail(message) {
  return {
    ok: false,
    message,
  }
}
