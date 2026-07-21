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
  { id: 'couponBatches', name: '兑换码批次表', collection: 'coupon_code_batches', statKey: 'couponCodeBatches' },
  { id: 'couponCodes', name: '会员兑换码表', collection: 'coupon_codes', statKey: 'couponCodes' },
  { id: 'aiUsage', name: 'AI 用量表', collection: 'ai_usage_logs', statKey: 'aiUsageLogs' },
  { id: 'medicines', name: '药品表', collection: 'medicines', statKey: 'medicines' },
  { id: 'illness', name: '健康记录表', collection: 'illness_records', statKey: 'illnessRecords' },
  { id: 'medication', name: '用药记录表', collection: 'medication_logs', statKey: 'medicationLogs' },
  { id: 'attachments', name: '附件表', collection: 'attachments', statKey: 'attachments' },
  { id: 'feedback', name: '用户反馈表', collection: 'feedback', statKey: 'feedback' },
]

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'getDashboard'
  const payload = event.payload || {}

  try {
    await assertAdmin(openid)
    await logAdminAccess(openid, action, payload)

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
      case 'listFeedback':
        return ok(await pageList('feedback', payload))
      case 'listOrders':
      case 'adminListOrders':
        return ok(await pageList('orders', payload))
      case 'listSubscriptions':
      case 'adminListSubscriptions':
        return ok(await pageList('subscriptions', payload))
      case 'listCoupons':
      case 'adminListCoupons':
        return ok(await pageList('coupons', payload))
      case 'listCouponCodeBatches':
      case 'adminListCouponCodeBatches':
        return ok(await pageList('coupon_code_batches', payload))
      case 'listCouponCodes':
      case 'adminListCouponCodes':
        return ok(await pageList('coupon_codes', payload))
      case 'listAiUsage':
      case 'adminListAiUsage':
        return ok(await pageList('ai_usage_logs', payload))
      case 'createCoupon':
      case 'adminCreateCoupon':
        return ok(await createCoupon(payload))
      case 'updateCoupon':
      case 'adminUpdateCoupon':
        return ok(await updateCoupon(payload))
      case 'batchGenerateCouponCodes':
      case 'adminBatchGenerateCouponCodes':
        return ok(await batchGenerateCouponCodes(openid, payload))
      case 'exportCouponCodes':
      case 'adminExportCouponCodes':
        return ok(await exportCouponCodes(payload))
      case 'markCouponCodeIssued':
      case 'adminMarkCouponCodeIssued':
        return ok(await markCouponCodeIssued(payload))
      case 'disableCouponCodeBatch':
      case 'adminDisableCouponCodeBatch':
        return ok(await disableCouponCodeBatch(payload))
      default:
        return fail(`unknown admin action: ${action}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'admin server error')
  }
}

async function assertAdmin(openid) {
  if (!openid) {
    throw new Error('admin login required')
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

async function logAdminAccess(openid, action, payload = {}) {
  await db.collection('admin_operation_logs').add({
    data: {
      action,
      adminOpenid: openid,
      createdAt: db.serverDate(),
      familyId: safeAuditValue(payload.familyId),
      targetId: safeAuditValue(payload.id || payload._id || payload.batchId || payload.orderId),
    },
  })
}

function safeAuditValue(value) {
  return typeof value === 'string' ? value.slice(0, 128) : ''
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
    feedback,
    reminders,
    orders,
    paidOrders,
    subscriptions,
    activeSubscriptions,
    coupons,
    couponCodeBatches,
    couponCodes,
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
    count('feedback'),
    count('reminders'),
    count('orders'),
    countWhere('orders', { status: 'paid', deletedAt: _.exists(false) }),
    count('subscriptions'),
    countActiveSubscriptions(),
    count('coupons'),
    count('coupon_code_batches'),
    count('coupon_codes'),
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
    recentCouponBatches,
    recentCouponCodes,
    recentAiUsage,
    medicineSample,
    memberSample,
    attachmentSample,
    paidOrderRows,
    aiUsageRows,
  ] =
    await Promise.all([
      latest('users', 8),
      latest('illness_records', 8),
      latest('medication_logs', 8),
      latest('orders', 8),
      latest('subscriptions', 8),
      latest('coupons', 8),
      latest('coupon_code_batches', 8),
      latest('coupon_codes', 8),
      latest('ai_usage_logs', 8),
      allRows('medicines'),
      allRows('family_members'),
      allRows('attachments'),
      allRows('orders', { status: 'paid' }),
      allRows('ai_usage_logs'),
    ])

  const expiringMedicinesAll = medicineSample.data
    .filter((medicine) => daysUntil(medicine.expireDate) <= 60)
    .sort((a, b) => daysUntil(a.expireDate) - daysUntil(b.expireDate))
  const lowStockMedicinesAll = medicineSample.data.filter((medicine) => isLowStock(medicine))
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
  const revenue = buildRevenue(paidOrderRows.data)
  const aiUsage = buildAiUsage(aiUsageRows.data)

  return {
    stats: {
      users,
      families,
      members,
      medicines,
      illnessRecords,
      medicationLogs,
      attachments,
      feedback,
      reminders,
      orders,
      paidOrders,
      subscriptions,
      activeSubscriptions,
      coupons,
      couponCodeBatches,
      couponCodes,
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
      expiringMedicines: expiringMedicinesAll.length,
      lowStockMedicines: lowStockMedicinesAll.length,
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
    recentCouponBatches: recentCouponBatches.data,
    recentCouponCodes: recentCouponCodes.data,
    recentAiUsage: recentAiUsage.data,
    expiringMedicines: expiringMedicinesAll.slice(0, 20),
    lowStockMedicines: lowStockMedicinesAll.slice(0, 20),
    missingProfileMembers: missingProfileMembers.slice(0, 20),
    pendingOcrAttachments: pendingOcrAttachments.slice(0, 20),
    generatedAt: new Date().toISOString(),
  }
}

async function count(collection) {
  const result = await db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .count()
  return result.total
}

async function countWhere(collection, query) {
  const result = await db.collection(collection).where(query).count()
  return result.total
}

async function countActiveSubscriptions() {
  const result = await db
    .collection('subscriptions')
    .where({
      status: 'active',
      expireAt: _.gt(new Date()),
      deletedAt: _.exists(false),
    })
    .count()
  return result.total
}

async function latest(collection, limit) {
  return db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
}

async function allRows(collection, extraQuery = {}) {
  const pageSize = 100
  const maxPages = 100
  const data = []
  for (let page = 0; page < maxPages; page += 1) {
    const result = await db
      .collection(collection)
      .where({
        ...extraQuery,
        deletedAt: _.exists(false),
      })
      .skip(page * pageSize)
      .limit(pageSize)
      .get()
    data.push(...result.data)
    if (result.data.length < pageSize) {
      return { data }
    }
  }
  throw new Error(`${collection} exceeds dashboard scan limit; use an aggregated metric job`)
}

async function trendCount(collection, field, days) {
  return trendCountWhere(collection, field, days, {})
}

async function trendCountWhere(collection, field, days, extraQuery) {
  const trend = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = dateOffset(-index)
    const nextDay = dateOffset(-index + 1)
    const result = await db
      .collection(collection)
      .where({
        ...extraQuery,
        deletedAt: _.exists(false),
        [field]: _.gte(day).and(_.lt(nextDay)),
      })
      .count()
    const total = result.total
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
  const query = buildPageQuery(collection, payload)
  const collectionRef = db.collection(collection).where(query)
  const [countResult, result] = await Promise.all([
    collectionRef.count(),
    collectionRef.orderBy('createdAt', 'desc').skip(skip).limit(limit).get(),
  ])
  const total = countResult.total || 0
  return {
    list: result.data,
    skip,
    limit,
    total,
    hasMore: skip + result.data.length < total,
  }
}

function buildPageQuery(collection, payload = {}) {
  const query = {
    deletedAt: _.exists(false),
  }
  const filterKeys = {
    coupon_code_batches: ['couponId', 'status', 'purpose', 'channel', 'redeemPlanId'],
    coupon_codes: ['couponId', 'batchId', 'status', 'issueStatus', 'issuedChannel', 'redeemedFamilyId'],
    coupons: ['status', 'codePurpose', 'type'],
    orders: ['status', 'paymentProvider', 'familyId'],
    subscriptions: ['status', 'familyId', 'planId'],
  }[collection] || []

  filterKeys.forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== '') {
      query[key] = payload[key]
    }
  })

  return query
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
    codeMode: payload.codeMode || 'shared_code',
    codePurpose: payload.codePurpose || payload.purpose || 'discount',
    type: payload.type || 'fixed_amount',
    value: Number(payload.value || 0),
    redeemPlanId: payload.redeemPlanId || '',
    redeemDurationDays: Number(payload.redeemDurationDays || 0),
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

async function batchGenerateCouponCodes(adminOpenid, payload = {}) {
  const quantity = Math.min(Math.max(Number(payload.quantity || 0), 1), 1000)
  const codeLength = Math.min(Math.max(Number(payload.codeLength || 8), 6), 16)
  const prefix = normalizeCodePrefix(payload.prefix || 'XHSVIP')
  const redeemPlanId = payload.redeemPlanId || payload.planId || 'yearly_pro'
  const redeemDurationDays = Number(payload.redeemDurationDays || 365)
  const now = db.serverDate()
  const couponId = payload.couponId || (await createMembershipRedeemCoupon(payload, prefix, redeemPlanId, redeemDurationDays))

  const batchResult = await db.collection('coupon_code_batches').add({
    data: {
      couponId,
      name: payload.name || `${prefix} 会员兑换码批次`,
      prefix,
      purpose: payload.purpose || 'membership_redeem',
      channel: payload.channel || 'xiaohongshu',
      redeemPlanId,
      redeemDurationDays,
      quantity,
      codeLength,
      generatedCount: 0,
      exportedAt: null,
      generatedByAdminId: payload.generatedByAdminId || adminOpenid || '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  })

  const codes = []
  for (let index = 0; index < quantity; index += 1) {
    const code = await createUniqueCouponCode(prefix, codeLength, codes)
    const addResult = await db.collection('coupon_codes').add({
      data: {
        couponId,
        batchId: batchResult._id,
        code,
        status: 'active',
        issueStatus: 'unissued',
        issuedChannel: payload.channel || 'xiaohongshu',
        issuedToNote: '',
        externalOrderId: '',
        issuedAt: null,
        redeemedByOpenid: '',
        redeemedFamilyId: '',
        activatedSubscriptionId: '',
        redeemedAt: null,
        redeemPlanId,
        redeemDurationDays,
        createdAt: now,
        updatedAt: now,
      },
    })
    codes.push({
      _id: addResult._id,
      code,
    })
  }

  await db.collection('coupon_code_batches').doc(batchResult._id).update({
    data: {
      generatedCount: codes.length,
      updatedAt: db.serverDate(),
    },
  })

  await db.collection('coupons').doc(couponId).update({
    data: {
      totalQuantity: _.inc(codes.length),
      updatedAt: db.serverDate(),
    },
  })

  return {
    batchId: batchResult._id,
    couponId,
    generatedCount: codes.length,
    codes,
  }
}

async function createMembershipRedeemCoupon(payload, prefix, redeemPlanId, redeemDurationDays) {
  const code = await createUniqueCouponRuleCode(prefix)
  const now = db.serverDate()
  const result = await db.collection('coupons').add({
    data: {
      name: payload.couponName || payload.name || `${prefix} 会员兑换规则`,
      code,
      codeMode: 'unique_codes',
      codePurpose: 'membership_redeem',
      type: 'trial_days',
      value: redeemDurationDays,
      redeemPlanId,
      redeemDurationDays,
      applicablePlans: [redeemPlanId],
      minAmount: 0,
      maxDiscountAmount: 0,
      totalQuantity: 0,
      usedQuantity: 0,
      perUserLimit: 1,
      perFamilyLimit: 1,
      startAt: payload.startAt || null,
      endAt: payload.endAt || null,
      familyId: '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  })
  return result._id
}

async function createUniqueCouponRuleCode(prefix) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${prefix}_RULE_${randomCode(6)}`
    const existing = await db
      .collection('coupons')
      .where({
        code,
        deletedAt: _.exists(false),
      })
      .limit(1)
      .get()
    if (!existing.data.length) {
      return code
    }
  }
  throw new Error('cannot generate unique coupon rule code')
}

async function createUniqueCouponCode(prefix, codeLength, pendingCodes) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = `${prefix}-${randomCode(codeLength)}`
    if (pendingCodes.some((item) => item.code === code)) {
      continue
    }
    const existing = await db
      .collection('coupon_codes')
      .where({
        code,
        deletedAt: _.exists(false),
      })
      .limit(1)
      .get()
    if (!existing.data.length) {
      return code
    }
  }
  throw new Error('cannot generate unique coupon code')
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let text = ''
  for (let index = 0; index < length; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return text
}

function normalizeCodePrefix(value) {
  const text = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
  return text || 'XHSVIP'
}

async function exportCouponCodes(payload = {}) {
  const batchId = payload.batchId
  if (!batchId) {
    throw new Error('batchId is required')
  }
  const result = await db
    .collection('coupon_codes')
    .where({
      batchId,
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .limit(Math.min(Number(payload.limit || 1000), 1000))
    .get()

  await db.collection('coupon_code_batches').doc(batchId).update({
    data: {
      exportedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  const rows = result.data.map((item) => ({
    code: item.code,
    status: item.status,
    issueStatus: item.issueStatus || 'unissued',
    issuedChannel: item.issuedChannel || '',
    externalOrderId: item.externalOrderId || '',
    issuedToNote: item.issuedToNote || '',
  }))
  return {
    batchId,
    rows,
    csv: buildCodesCsv(rows),
  }
}

function buildCodesCsv(rows) {
  const header = ['code', 'status', 'issueStatus', 'issuedChannel', 'externalOrderId', 'issuedToNote']
  const lines = rows.map((row) =>
    header
      .map((key) => `"${String(row[key] || '').replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

async function markCouponCodeIssued(payload = {}) {
  const record = await getCouponCodeRecord(payload)
  const now = db.serverDate()
  await db.collection('coupon_codes').doc(record._id).update({
    data: {
      issueStatus: 'issued',
      issuedChannel: payload.issuedChannel || record.issuedChannel || 'xiaohongshu',
      issuedToNote: payload.issuedToNote || record.issuedToNote || '',
      externalOrderId: payload.externalOrderId || record.externalOrderId || '',
      issuedAt: payload.issuedAt || now,
      updatedAt: now,
    },
  })
  return {
    id: record._id,
    code: record.code,
    issueStatus: 'issued',
  }
}

async function disableCouponCodeBatch(payload = {}) {
  const batchId = payload.batchId || payload.id
  if (!batchId) {
    throw new Error('batchId is required')
  }
  const now = db.serverDate()
  await db.collection('coupon_code_batches').doc(batchId).update({
    data: {
      status: 'disabled',
      disabledReason: payload.reason || 'manual_disabled',
      updatedAt: now,
    },
  })
  await db
    .collection('coupon_codes')
    .where({
      batchId,
      status: 'active',
      deletedAt: _.exists(false),
    })
    .update({
      data: {
        status: 'disabled',
        disabledReason: payload.reason || 'batch_disabled',
        updatedAt: now,
      },
    })
  return {
    batchId,
    status: 'disabled',
  }
}

async function getCouponCodeRecord(payload = {}) {
  if (payload.id || payload._id) {
    const result = await db.collection('coupon_codes').doc(payload.id || payload._id).get()
    if (result.data) {
      return result.data
    }
  }
  const code = String(payload.code || '').trim().toUpperCase()
  if (!code) {
    throw new Error('coupon code id or code is required')
  }
  const result = await db
    .collection('coupon_codes')
    .where({
      code,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('coupon code not found')
  }
  return result.data[0]
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
