import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

interface AdminRequest {
  action?: string
  adminToken?: string
  token?: string
  payload?: Row
}

const DATA_FILE = fileURLToPath(new URL('../.local-data/admin-api.json', import.meta.url))
const LOCAL_ADMIN_TOKEN = 'local-dev-token'
const DAY_MS = 24 * 60 * 60 * 1000

const DATA_TABLES = [
  { id: 'users', name: 'Users', collection: 'users', statKey: 'users' },
  { id: 'families', name: 'Families', collection: 'families', statKey: 'families' },
  { id: 'orders', name: 'Orders', collection: 'orders', statKey: 'orders' },
  { id: 'subscriptions', name: 'Subscriptions', collection: 'subscriptions', statKey: 'subscriptions' },
  { id: 'coupons', name: 'Coupons', collection: 'coupons', statKey: 'coupons' },
  {
    id: 'couponBatches',
    name: 'Coupon code batches',
    collection: 'coupon_code_batches',
    statKey: 'couponCodeBatches',
  },
  { id: 'couponCodes', name: 'Membership coupon codes', collection: 'coupon_codes', statKey: 'couponCodes' },
  { id: 'aiUsage', name: 'AI usage logs', collection: 'ai_usage_logs', statKey: 'aiUsageLogs' },
  { id: 'medicines', name: 'Medicines', collection: 'medicines', statKey: 'medicines' },
  { id: 'illness', name: 'Illness records', collection: 'illness_records', statKey: 'illnessRecords' },
  { id: 'medication', name: 'Medication logs', collection: 'medication_logs', statKey: 'medicationLogs' },
  { id: 'attachments', name: 'Attachments', collection: 'attachments', statKey: 'attachments' },
  { id: 'feedback', name: 'User feedback', collection: 'feedback', statKey: 'feedback' },
] as const

const COLLECTIONS = [
  ...DATA_TABLES.map((table) => table.collection),
  'family_members',
  'reminders',
  'coupon_redemptions',
] as const

const LIST_ACTIONS: Record<string, string> = {
  adminListAiUsage: 'ai_usage_logs',
  adminListCouponCodeBatches: 'coupon_code_batches',
  adminListCouponCodes: 'coupon_codes',
  adminListCoupons: 'coupons',
  adminListOrders: 'orders',
  adminListSubscriptions: 'subscriptions',
  listAiUsage: 'ai_usage_logs',
  listAttachments: 'attachments',
  listCouponCodeBatches: 'coupon_code_batches',
  listCouponCodes: 'coupon_codes',
  listCoupons: 'coupons',
  listFamilies: 'families',
  listFeedback: 'feedback',
  listIllness: 'illness_records',
  listMedication: 'medication_logs',
  listMedicines: 'medicines',
  listOrders: 'orders',
  listSubscriptions: 'subscriptions',
  listUsers: 'users',
}

export async function handleLocalAdminApi(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method not allowed' })
    return
  }

  try {
    const request = await readJsonRequest(req)
    const token = stringValue(request.adminToken || request.token || headerToken(req))
    if (!isValidAdminToken(token)) {
      sendJson(res, 401, { ok: false, message: 'invalid local admin token' })
      return
    }

    const action = request.action || 'getDashboard'
    const data = await dispatchAction(action, request.payload || {})
    sendJson(res, 200, { ok: true, data, local: true })
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      message: error instanceof Error ? error.message : 'local admin api error',
    })
  }
}

async function dispatchAction(action: string, payload: Row) {
  const store = await loadStore()
  const listCollection = LIST_ACTIONS[action]
  if (listCollection) {
    return pageList(store, listCollection, payload)
  }

  switch (action) {
    case 'getDashboard':
      return buildDashboard(store)
    case 'getDataOverview':
      return getDataOverview(store)
    case 'createCoupon':
    case 'adminCreateCoupon':
      return createCoupon(store, payload)
    case 'updateCoupon':
    case 'adminUpdateCoupon':
      return updateCoupon(store, payload)
    case 'batchGenerateCouponCodes':
    case 'adminBatchGenerateCouponCodes':
      return batchGenerateCouponCodes(store, payload)
    case 'exportCouponCodes':
    case 'adminExportCouponCodes':
      return exportCouponCodes(store, payload)
    case 'markCouponCodeIssued':
    case 'adminMarkCouponCodeIssued':
      return markCouponCodeIssued(store, payload)
    case 'disableCouponCodeBatch':
    case 'adminDisableCouponCodeBatch':
      return disableCouponCodeBatch(store, payload)
    default:
      throw new Error(`unknown local admin action: ${action}`)
  }
}

async function loadStore() {
  try {
    const text = await readFile(DATA_FILE, 'utf8')
    return ensureStore(JSON.parse(text) as Partial<Store>)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      const store = seedStore()
      await saveStore(store)
      return store
    }
    throw error
  }
}

async function saveStore(store: Store) {
  await mkdir(dirname(DATA_FILE), { recursive: true })
  await writeFile(DATA_FILE, `${JSON.stringify(ensureStore(store), null, 2)}\n`, 'utf8')
}

function ensureStore(input: Partial<Store>) {
  const store: Store = {}
  for (const collection of COLLECTIONS) {
    const rows = input[collection]
    store[collection] = Array.isArray(rows) ? rows : []
  }
  return store
}

function seedStore() {
  const now = new Date()
  const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY_MS).toISOString()

  return ensureStore({
    ai_usage_logs: [
      {
        _id: 'local_ai_001',
        count: 6,
        createdAt: at(-1),
        familyId: 'local_family_001',
        usageType: 'assistant_query',
        userOpenid: 'local_user_001',
      },
      {
        _id: 'local_ai_002',
        count: 2,
        createdAt: at(-2),
        familyId: 'local_family_001',
        usageType: 'image_parse',
        userOpenid: 'local_user_002',
      },
    ],
    attachments: [
      {
        _id: 'local_attachment_001',
        aiSummary: 'Demo prescription attachment',
        createdAt: at(-3),
        familyId: 'local_family_001',
        fileType: 'image',
        ocrText: '',
        relatedType: 'illness',
      },
    ],
    feedback: [
      {
        _id: 'local_feedback_001',
        contact: '',
        content: '希望病程时间线支持更快追加体温。',
        createdAt: at(-1),
        status: 'pending',
        type: '功能建议',
      },
    ],
    coupon_code_batches: [],
    coupon_codes: [],
    coupon_redemptions: [],
    coupons: [
      {
        _id: 'local_coupon_001',
        code: 'LOCAL10',
        codeMode: 'shared_code',
        codePurpose: 'discount',
        createdAt: at(-5),
        maxDiscountAmount: 1000,
        minAmount: 0,
        name: 'Local test coupon',
        perFamilyLimit: 1,
        perUserLimit: 1,
        status: 'active',
        totalQuantity: 100,
        type: 'fixed_amount',
        updatedAt: at(-5),
        usedQuantity: 3,
        value: 1000,
      },
    ],
    families: [
      {
        _id: 'local_family_001',
        createdAt: at(-8),
        createdBy: 'local_user_001',
        name: 'Local test family',
        subscriptionStatus: 'active',
        updatedAt: at(-1),
      },
    ],
    family_members: [
      {
        _id: 'local_member_001',
        allergyHistory: '',
        createdAt: at(-8),
        familyId: 'local_family_001',
        medicalHistory: '',
        name: 'Demo member',
      },
      {
        _id: 'local_member_002',
        allergyHistory: 'None',
        createdAt: at(-7),
        familyId: 'local_family_001',
        medicalHistory: 'None',
        name: 'Demo admin',
      },
    ],
    illness_records: [
      {
        _id: 'local_illness_001',
        createdAt: at(-3),
        familyId: 'local_family_001',
        memberId: 'local_member_001',
        status: 'recovering',
        summary: 'Local cold test record',
      },
    ],
    medication_logs: [
      {
        _id: 'local_medication_001',
        createdAt: at(-2),
        dosage: '1 tablet',
        illnessRecordId: 'local_illness_001',
        medicineId: 'local_medicine_001',
        takenAt: at(-2),
      },
    ],
    medicines: [
      {
        _id: 'local_medicine_001',
        category: 'cold',
        createdAt: at(-4),
        currentQuantity: 2,
        expireDate: at(28).slice(0, 10),
        familyId: 'local_family_001',
        minQuantity: 3,
        name: 'Local medicine',
        position: 'Home cabinet',
      },
      {
        _id: 'local_medicine_002',
        category: 'external',
        createdAt: at(-2),
        currentQuantity: 10,
        expireDate: at(180).slice(0, 10),
        familyId: 'local_family_001',
        minQuantity: 2,
        name: 'Bandage',
        position: 'First aid kit',
      },
    ],
    orders: [
      {
        _id: 'local_order_001',
        createdAt: at(-6),
        discountAmount: 1000,
        familyId: 'local_family_001',
        paidAt: at(-6),
        payableAmount: 8900,
        planId: 'yearly_pro',
        status: 'paid',
        totalAmount: 9900,
      },
      {
        _id: 'local_order_002',
        createdAt: at(-1),
        discountAmount: 0,
        familyId: 'local_family_001',
        payableAmount: 1900,
        planId: 'monthly_pro',
        status: 'pending',
        totalAmount: 1900,
      },
    ],
    reminders: [
      {
        _id: 'local_reminder_001',
        createdAt: at(-1),
        familyId: 'local_family_001',
        remindAt: at(1),
        status: 'active',
        title: 'Local medicine reminder',
      },
    ],
    subscriptions: [
      {
        _id: 'local_subscription_001',
        createdAt: at(-6),
        endAt: at(359),
        familyId: 'local_family_001',
        orderId: 'local_order_001',
        planId: 'yearly_pro',
        startAt: at(-6),
        status: 'active',
      },
    ],
    users: [
      {
        _id: 'local_user_001',
        createdAt: at(-9),
        currentFamilyId: 'local_family_001',
        lastLoginAt: at(-1),
        nickname: 'Local Admin',
        openid: 'local_openid_admin',
      },
      {
        _id: 'local_user_002',
        createdAt: at(-4),
        currentFamilyId: 'local_family_001',
        lastLoginAt: at(-2),
        nickname: 'Local Tester',
        openid: 'local_openid_tester',
      },
    ],
  })
}

function pageList(store: Store, collection: string, payload: Row) {
  const skip = Math.max(toNumber(payload.skip, 0), 0)
  const limit = clamp(toNumber(payload.limit, 100), 1, 500)
  let rows = [...(store[collection] || [])]

  for (const key of ['batchId', 'channel', 'couponId', 'familyId', 'issueStatus', 'issuedChannel', 'redeemPlanId', 'status']) {
    const value = stringValue(payload[key])
    if (value) {
      rows = rows.filter((row) => stringValue(row[key]) === value)
    }
  }

  const keyword = stringValue(payload.keyword || payload.search).toLowerCase()
  if (keyword) {
    rows = rows.filter((row) => Object.values(row).some((value) => String(value || '').toLowerCase().includes(keyword)))
  }

  rows.sort((left, right) => timestamp(right.createdAt || right.updatedAt) - timestamp(left.createdAt || left.updatedAt))

  return {
    hasMore: skip + limit < rows.length,
    limit,
    list: rows.slice(skip, skip + limit),
    skip,
    total: rows.length,
  }
}

function getDataOverview(store: Store) {
  return {
    tables: DATA_TABLES.map((table) => ({
      ...table,
      total: countRows(store, table.collection),
    })),
  }
}

function buildDashboard(store: Store) {
  const paidOrders = store.orders.filter((order) => order.status === 'paid')
  const activeSubscriptions = store.subscriptions.filter(
    (subscription) => subscription.status === 'active' && timestamp(subscription.endAt) > Date.now(),
  )
  const expiringMedicines = store.medicines
    .filter((medicine) => daysUntil(medicine.expireDate) <= 60)
    .sort((left, right) => daysUntil(left.expireDate) - daysUntil(right.expireDate))
    .slice(0, 20)
  const lowStockMedicines = store.medicines.filter((medicine) => isLowStock(medicine)).slice(0, 20)
  const missingProfileMembers = store.family_members.filter((member) => !member.allergyHistory && !member.medicalHistory)
  const pendingOcrAttachments = store.attachments.filter((attachment) => !attachment.ocrText)

  const stats = {
    activeSubscriptions: activeSubscriptions.length,
    aiUsageLogs: countRows(store, 'ai_usage_logs'),
    attachments: countRows(store, 'attachments'),
    feedback: countRows(store, 'feedback'),
    couponCodeBatches: countRows(store, 'coupon_code_batches'),
    couponCodes: countRows(store, 'coupon_codes'),
    couponRedemptions: store.coupon_redemptions.filter((item) => item.status === 'used').length,
    coupons: countRows(store, 'coupons'),
    families: countRows(store, 'families'),
    illnessRecords: countRows(store, 'illness_records'),
    medicationLogs: countRows(store, 'medication_logs'),
    medicines: countRows(store, 'medicines'),
    members: countRows(store, 'family_members'),
    orders: countRows(store, 'orders'),
    paidOrders: paidOrders.length,
    reminders: countRows(store, 'reminders'),
    subscriptions: countRows(store, 'subscriptions'),
    users: countRows(store, 'users'),
  }

  return {
    aiUsage: buildAiUsage(store.ai_usage_logs),
    expiringMedicines,
    generatedAt: new Date().toISOString(),
    health: {
      attachmentCoverageRate: stats.illnessRecords ? round((stats.attachments / stats.illnessRecords) * 100) : 0,
      averageIllnessPerFamily: average(stats.illnessRecords, stats.families),
      averageMedicationPerIllness: average(stats.medicationLogs, stats.illnessRecords),
      averageMedicinesPerFamily: average(stats.medicines, stats.families),
      averageMembersPerFamily: average(stats.members, stats.families),
    },
    lowStockMedicines,
    membership: {
      activeSubscriptions: stats.activeSubscriptions,
      conversionRate: stats.orders ? round((stats.paidOrders / stats.orders) * 100) : 0,
      memberFamilyRate: stats.families ? round((stats.activeSubscriptions / stats.families) * 100) : 0,
      paidOrders: stats.paidOrders,
      pendingOrders: Math.max(stats.orders - stats.paidOrders, 0),
      subscriptions: stats.subscriptions,
    },
    recentAiUsage: latestRows(store.ai_usage_logs, 8),
    recentCouponBatches: latestRows(store.coupon_code_batches, 8),
    recentCouponCodes: latestRows(store.coupon_codes, 8),
    recentCoupons: latestRows(store.coupons, 8),
    recentIllness: latestRows(store.illness_records, 8),
    recentMedication: latestRows(store.medication_logs, 8),
    recentOrders: latestRows(store.orders, 8),
    recentSubscriptions: latestRows(store.subscriptions, 8),
    recentUsers: latestRows(store.users, 8),
    revenue: buildRevenue(paidOrders),
    risk: {
      expiringMedicines: expiringMedicines.length,
      lowStockMedicines: lowStockMedicines.length,
      missingProfileMembers: missingProfileMembers.length,
      pendingOcrAttachments: pendingOcrAttachments.length,
    },
    stats,
    trend: {
      aiUsage: trendCount(store.ai_usage_logs, 'createdAt', 7),
      illnessRecords: trendCount(store.illness_records, 'createdAt', 7),
      medicationLogs: trendCount(store.medication_logs, 'createdAt', 7),
      medicines: trendCount(store.medicines, 'createdAt', 7),
      orders: trendCount(store.orders, 'createdAt', 7),
      paidOrders: trendCount(paidOrders, 'paidAt', 7),
      users: trendCount(store.users, 'createdAt', 7),
    },
  }
}

async function createCoupon(store: Store, payload: Row) {
  const now = new Date().toISOString()
  const coupon = {
    _id: createId('coupon'),
    ...normalizeCouponPayload(payload),
    createdAt: now,
    updatedAt: now,
  }
  store.coupons.push(coupon)
  await saveStore(store)
  return { id: coupon._id }
}

async function updateCoupon(store: Store, payload: Row) {
  const id = stringValue(payload._id || payload.id)
  if (!id) {
    throw new Error('coupon id is required')
  }
  const coupon = store.coupons.find((item) => item._id === id)
  if (!coupon) {
    throw new Error('coupon not found')
  }
  Object.assign(coupon, normalizeCouponPayload(payload), {
    code: coupon.code,
    updatedAt: new Date().toISOString(),
  })
  await saveStore(store)
  return { id }
}

async function batchGenerateCouponCodes(store: Store, payload: Row) {
  const quantity = clamp(toNumber(payload.quantity, 50), 1, 1000)
  const codeLength = clamp(toNumber(payload.codeLength, 8), 6, 16)
  const prefix = normalizeCodePrefix(payload.prefix || 'XHSVIP')
  const channel = stringValue(payload.channel) || 'xiaohongshu'
  const redeemPlanId = stringValue(payload.redeemPlanId || payload.planId) || 'yearly_pro'
  const redeemDurationDays = toNumber(payload.redeemDurationDays, 365)
  const couponId = stringValue(payload.couponId) || createMembershipRedeemCoupon(store, payload, prefix, redeemPlanId, redeemDurationDays)
  const coupon = store.coupons.find((item) => item._id === couponId)

  if (!coupon) {
    throw new Error('coupon not found')
  }

  const now = new Date().toISOString()
  const batch = {
    _id: createId('batch'),
    channel,
    codeLength,
    couponId,
    createdAt: now,
    exportedAt: null,
    generatedByAdminId: 'local-admin',
    generatedCount: 0,
    name: stringValue(payload.name) || `${prefix} membership code batch`,
    prefix,
    purpose: stringValue(payload.purpose) || 'membership_redeem',
    quantity,
    redeemDurationDays,
    redeemPlanId,
    status: 'active',
    updatedAt: now,
    usedQuantity: 0,
  }
  const pendingCodes = new Set<string>()
  const codes: Row[] = []

  for (let index = 0; index < quantity; index += 1) {
    const code = createUniqueCouponCode(store, prefix, codeLength, pendingCodes)
    pendingCodes.add(code)
    const record = {
      _id: createId('code'),
      activatedSubscriptionId: '',
      batchId: batch._id,
      code,
      couponId,
      createdAt: now,
      externalOrderId: '',
      issueStatus: 'unissued',
      issuedAt: null,
      issuedChannel: channel,
      issuedToNote: '',
      redeemedAt: null,
      redeemedByOpenid: '',
      redeemedFamilyId: '',
      redeemDurationDays,
      redeemPlanId,
      status: 'active',
      updatedAt: now,
    }
    store.coupon_codes.push(record)
    codes.push({ _id: record._id, code })
  }

  batch.generatedCount = codes.length
  coupon.totalQuantity = toNumber(coupon.totalQuantity, 0) + codes.length
  coupon.updatedAt = now
  store.coupon_code_batches.push(batch)
  await saveStore(store)

  return {
    batchId: batch._id,
    codes,
    couponId,
    generatedCount: codes.length,
  }
}

function createMembershipRedeemCoupon(
  store: Store,
  payload: Row,
  prefix: string,
  redeemPlanId: string,
  redeemDurationDays: number,
) {
  const now = new Date().toISOString()
  const coupon = {
    _id: createId('coupon'),
    applicablePlans: [redeemPlanId],
    code: createUniqueCouponRuleCode(store, prefix),
    codeMode: 'unique_codes',
    codePurpose: 'membership_redeem',
    createdAt: now,
    endAt: payload.endAt || null,
    familyId: '',
    maxDiscountAmount: 0,
    minAmount: 0,
    name: stringValue(payload.couponName || payload.name) || `${prefix} membership redeem rule`,
    perFamilyLimit: 1,
    perUserLimit: 1,
    redeemDurationDays,
    redeemPlanId,
    startAt: payload.startAt || null,
    status: 'active',
    totalQuantity: 0,
    type: 'trial_days',
    updatedAt: now,
    usedQuantity: 0,
    value: redeemDurationDays,
  }
  store.coupons.push(coupon)
  return stringValue(coupon._id)
}

async function exportCouponCodes(store: Store, payload: Row) {
  const batchId = stringValue(payload.batchId || payload.id)
  if (!batchId) {
    throw new Error('batchId is required')
  }
  const batch = store.coupon_code_batches.find((item) => item._id === batchId)
  if (!batch) {
    throw new Error('coupon code batch not found')
  }
  const limit = clamp(toNumber(payload.limit, 1000), 1, 1000)
  const rows = store.coupon_codes
    .filter((item) => item.batchId === batchId)
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
    .slice(0, limit)
    .map((item) => ({
      code: item.code,
      externalOrderId: item.externalOrderId || '',
      issueStatus: item.issueStatus || 'unissued',
      issuedChannel: item.issuedChannel || '',
      issuedToNote: item.issuedToNote || '',
      status: item.status,
    }))

  const now = new Date().toISOString()
  batch.exportedAt = now
  batch.updatedAt = now
  await saveStore(store)

  return {
    batchId,
    csv: buildCodesCsv(rows),
    rows,
  }
}

async function markCouponCodeIssued(store: Store, payload: Row) {
  const record = getCouponCodeRecord(store, payload)
  const now = new Date().toISOString()
  record.issueStatus = 'issued'
  record.issuedAt = stringValue(payload.issuedAt) || now
  record.issuedChannel = stringValue(payload.issuedChannel) || stringValue(record.issuedChannel) || 'xiaohongshu'
  record.issuedToNote = stringValue(payload.issuedToNote || record.issuedToNote)
  record.externalOrderId = stringValue(payload.externalOrderId || record.externalOrderId)
  record.updatedAt = now
  await saveStore(store)
  return {
    code: record.code,
    id: record._id,
    issueStatus: 'issued',
  }
}

async function disableCouponCodeBatch(store: Store, payload: Row) {
  const batchId = stringValue(payload.batchId || payload.id)
  if (!batchId) {
    throw new Error('batchId is required')
  }
  const batch = store.coupon_code_batches.find((item) => item._id === batchId)
  if (!batch) {
    throw new Error('coupon code batch not found')
  }

  const now = new Date().toISOString()
  batch.status = 'disabled'
  batch.disabledReason = stringValue(payload.reason) || 'manual_disabled'
  batch.updatedAt = now
  for (const code of store.coupon_codes) {
    if (code.batchId === batchId && code.status === 'active') {
      code.status = 'disabled'
      code.disabledReason = stringValue(payload.reason) || 'batch_disabled'
      code.updatedAt = now
    }
  }
  await saveStore(store)
  return {
    batchId,
    status: 'disabled',
  }
}

function normalizeCouponPayload(payload: Row) {
  const redeemPlanId = stringValue(payload.redeemPlanId)
  const redeemDurationDays = toNumber(payload.redeemDurationDays, 0)
  return {
    applicablePlans: Array.isArray(payload.applicablePlans) ? payload.applicablePlans : redeemPlanId ? [redeemPlanId] : [],
    code: stringValue(payload.code).toUpperCase() || `LOCAL_${randomCode(6)}`,
    codeMode: stringValue(payload.codeMode) || 'shared_code',
    codePurpose: stringValue(payload.codePurpose || payload.purpose) || 'discount',
    endAt: payload.endAt || null,
    familyId: stringValue(payload.familyId),
    maxDiscountAmount: toNumber(payload.maxDiscountAmount, 0),
    minAmount: toNumber(payload.minAmount, 0),
    name: stringValue(payload.name) || 'Local coupon',
    perFamilyLimit: toNumber(payload.perFamilyLimit, 1),
    perUserLimit: toNumber(payload.perUserLimit, 1),
    redeemDurationDays,
    redeemPlanId,
    startAt: payload.startAt || null,
    status: stringValue(payload.status) || 'active',
    totalQuantity: toNumber(payload.totalQuantity, 0),
    type: stringValue(payload.type) || 'fixed_amount',
    usedQuantity: toNumber(payload.usedQuantity, 0),
    value: toNumber(payload.value, 0),
  }
}

function getCouponCodeRecord(store: Store, payload: Row) {
  const id = stringValue(payload.id || payload._id)
  if (id) {
    const record = store.coupon_codes.find((item) => item._id === id)
    if (record) {
      return record
    }
  }

  const code = stringValue(payload.code).toUpperCase()
  if (!code) {
    throw new Error('coupon code id or code is required')
  }
  const record = store.coupon_codes.find((item) => stringValue(item.code).toUpperCase() === code)
  if (!record) {
    throw new Error('coupon code not found')
  }
  return record
}

function buildRevenue(orders: Row[]) {
  const revenueAmount = orders.reduce((sum, order) => sum + toNumber(order.payableAmount, 0), 0)
  const discountAmount = orders.reduce((sum, order) => sum + toNumber(order.discountAmount, 0), 0)
  const yearlyOrders = orders.filter((order) => order.planId === 'yearly_pro').length
  const monthlyOrders = orders.filter((order) => order.planId === 'monthly_pro').length

  return {
    averageOrderAmount: orders.length ? Math.round(revenueAmount / orders.length) : 0,
    discountAmount,
    monthlyOrders,
    revenueAmount,
    yearlyOrders,
  }
}

function buildAiUsage(rows: Row[]) {
  const total = rows.reduce((sum, row) => sum + toNumber(row.count, 1), 0)
  return {
    assistantQuery: rows
      .filter((row) => row.usageType === 'assistant_query')
      .reduce((sum, row) => sum + toNumber(row.count, 1), 0),
    imageParse: rows.filter((row) => row.usageType === 'image_parse').reduce((sum, row) => sum + toNumber(row.count, 1), 0),
    total,
  }
}

function trendCount(rows: Row[], field: string, days: number) {
  const today = new Date()
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * DAY_MS).toISOString().slice(0, 10)
    const count = rows.filter((row) => stringValue(row[field]).slice(0, 10) === date).length
    return { count, date }
  })
}

function latestRows(rows: Row[], limit: number) {
  return [...rows]
    .sort((left, right) => timestamp(right.createdAt || right.updatedAt) - timestamp(left.createdAt || left.updatedAt))
    .slice(0, limit)
}

function createUniqueCouponCode(store: Store, prefix: string, codeLength: number, pendingCodes: Set<string>) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = `${prefix}-${randomCode(codeLength)}`
    const exists = pendingCodes.has(code) || store.coupon_codes.some((item) => item.code === code)
    if (!exists) {
      return code
    }
  }
  throw new Error('cannot generate unique coupon code')
}

function createUniqueCouponRuleCode(store: Store, prefix: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = `${prefix}_RULE_${randomCode(6)}`
    if (!store.coupons.some((item) => item.code === code)) {
      return code
    }
  }
  throw new Error('cannot generate unique coupon rule code')
}

function buildCodesCsv(rows: Row[]) {
  const header = ['code', 'status', 'issueStatus', 'issuedChannel', 'externalOrderId', 'issuedToNote']
  const lines = rows.map((row) =>
    header.map((key) => `"${String(row[key] || '').replace(/"/g, '""')}"`).join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

function normalizeCodePrefix(value: unknown) {
  const text = stringValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
  return text || 'XHSVIP'
}

function randomCode(length: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let text = ''
  for (let index = 0; index < length; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return text
}

function countRows(store: Store, collection: string) {
  return (store[collection] || []).filter((row) => !row.deletedAt).length
}

function average(value: number, divider: number) {
  return divider ? round(value / divider) : 0
}

function round(value: number) {
  return Number(value.toFixed(2))
}

function isLowStock(row: Row) {
  return toNumber(row.currentQuantity ?? row.quantity, 0) <= toNumber(row.minQuantity, 1)
}

function daysUntil(value: unknown) {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }
  return Math.ceil((timestamp(value) - Date.now()) / DAY_MS)
}

function timestamp(value: unknown) {
  const time = value ? new Date(String(value)).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toNumber(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function createId(prefix: string) {
  return `local_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function readJsonRequest(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) {
    return {} as AdminRequest
  }
  const value = JSON.parse(text) as unknown
  if (!isRecord(value)) {
    throw new Error('request body must be a JSON object')
  }
  return value as AdminRequest
}

function isValidAdminToken(token: string) {
  return token === LOCAL_ADMIN_TOKEN
}

function headerToken(req: IncomingMessage) {
  const token = req.headers['x-admin-token']
  return Array.isArray(token) ? token[0] : token
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res: ServerResponse, statusCode: number, data: Row) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function isRecord(value: unknown): value is Row {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
