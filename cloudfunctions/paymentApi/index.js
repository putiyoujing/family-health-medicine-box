const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const PRO_LIMITS = {
  maxMembers: 10,
  maxSharedUsers: 6,
  maxMedicines: 300,
  maxHealthRecords: 3000,
  maxMedicationLogs: 10000,
  maxAttachments: 1000,
  aiImageParseMonthly: 100,
  aiAssistantMonthly: 300,
  exportData: true,
  familyMonthlyReport: true,
}

const PLANS = [
  {
    planId: 'yearly_pro',
    name: '年度会员',
    price: 9900,
    displayPrice: '99',
    durationDays: 365,
    badge: '推荐',
    sort: 0,
    benefits: PRO_LIMITS,
  },
  {
    planId: 'monthly_pro',
    name: '月度会员',
    price: 990,
    displayPrice: '9.9',
    durationDays: 30,
    sort: 1,
    benefits: PRO_LIMITS,
  },
]

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action
  const payload = event.payload || {}

  try {
    switch (action) {
      case 'getPlans':
        return ok(await getPlans())
      case 'previewOrder':
        return ok(await previewOrder(openid, payload))
      case 'createOrder':
        return ok(await createOrder(openid, payload))
      case 'applyCoupon':
        return ok(await applyCoupon(openid, payload))
      case 'listCouponsForUser':
        return ok(await listCouponsForUser(openid, payload))
      case 'mockPaymentSuccess':
        return ok(await mockPaymentSuccess(openid, payload))
      default:
        return fail(`unknown payment action: ${action || 'empty'}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'payment server error')
  }
}

async function getPlans() {
  const dbPlans = await safeGetPlansFromDb()
  return {
    plans: dbPlans.length ? dbPlans : PLANS,
  }
}

async function previewOrder(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyManager(openid, familyId)
  const plan = await getPlan(payload.planId)
  const coupon = payload.couponCode ? await findCouponForOrder(payload.couponCode, openid, familyId, plan) : null
  const discountAmount = coupon ? calcDiscount(plan, coupon) : 0
  const payableAmount = Math.max(0, plan.price - discountAmount)
  return {
    plan,
    coupon,
    originalAmount: plan.price,
    discountAmount,
    payableAmount,
    familyId,
    payerOpenid: openid,
  }
}

async function createOrder(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyManager(openid, familyId)
  const plan = await getPlan(payload.planId)
  const coupon = payload.couponCode ? await findCouponForOrder(payload.couponCode, openid, familyId, plan) : null
  const discountAmount = coupon ? calcDiscount(plan, coupon) : 0
  const payableAmount = Math.max(0, plan.price - discountAmount)
  const orderNo = await createOrderNo()
  const now = db.serverDate()
  const result = await db.collection('orders').add({
    data: {
      orderNo,
      familyId,
      payerOpenid: openid,
      planId: plan.planId,
      planName: plan.name,
      originalAmount: plan.price,
      discountAmount,
      payableAmount,
      couponId: coupon ? coupon._id : '',
      couponCode: coupon ? coupon.code : '',
      status: 'pending',
      paymentProvider: 'mock',
      paymentTradeNo: '',
      createdAt: now,
      updatedAt: now,
    },
  })
  if (coupon) {
    await markCouponPending(coupon, openid, familyId, result._id, plan.planId, discountAmount)
  }
  return {
    orderId: result._id,
    orderNo,
    status: 'pending',
    plan,
    coupon,
    originalAmount: plan.price,
    discountAmount,
    payableAmount,
    familyId,
  }
}

async function applyCoupon(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyManager(openid, familyId)
  const plan = await getPlan(payload.planId)
  const coupon = await findCouponForOrder(payload.couponCode, openid, familyId, plan)
  const discountAmount = calcDiscount(plan, coupon)
  return {
    coupon,
    originalAmount: plan.price,
    discountAmount,
    payableAmount: Math.max(0, plan.price - discountAmount),
    familyId,
  }
}

async function listCouponsForUser(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyAccess(openid, familyId)
  const plan = payload.planId ? await getPlan(payload.planId) : null
  const result = await db
    .collection('coupons')
    .where({
      status: 'active',
      deletedAt: _.exists(false),
    })
    .limit(50)
    .get()
  const coupons = []
  for (const coupon of result.data) {
    const validation = await validateCoupon(coupon, {
      openid,
      familyId,
      plan,
      strictLimit: false,
    })
    if (validation.ok) {
      coupons.push({
        ...coupon,
        discountPreview: buildDiscountPreview(coupon),
      })
    }
  }
  return {
    coupons,
  }
}

async function mockPaymentSuccess(openid, payload) {
  const orderId = payload.orderId
  if (!orderId) {
    throw new Error('orderId is required')
  }
  const orderResult = await db.collection('orders').doc(orderId).get()
  if (!orderResult.data) {
    throw new Error('order not found')
  }
  const order = orderResult.data
  if (order.payerOpenid !== openid) {
    await assertFamilyManager(openid, order.familyId)
  }
  if (order.status === 'paid') {
    return {
      orderId,
      status: 'paid',
      familyId: order.familyId,
    }
  }
  if (order.status !== 'pending') {
    throw new Error('order is not payable')
  }

  const now = db.serverDate()
  const plan = await getPlan(order.planId)
  const expireAt = await getSubscriptionExpireAt(order.familyId, plan.durationDays)
  const tradeNo = `MOCK${Date.now()}`

  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'paid',
      paymentTradeNo: tradeNo,
      paidAt: now,
      updatedAt: now,
    },
  })

  const subscriptionResult = await db.collection('subscriptions').add({
    data: {
      familyId: order.familyId,
      orderId,
      planId: order.planId,
      planName: order.planName,
      payerOpenid: order.payerOpenid,
      status: 'active',
      startedAt: now,
      expireAt,
      createdAt: now,
      updatedAt: now,
    },
  })

  await activateFamilyPlan(order.familyId, plan, expireAt, order.couponCode || 'mock_payment')
  if (order.couponId) {
    await markCouponUsed(order, orderId, openid)
  }

  return {
    orderId,
    subscriptionId: subscriptionResult._id,
    status: 'paid',
    expireAt,
    familyId: order.familyId,
    plan,
  }
}

async function safeGetPlansFromDb() {
  try {
    const result = await db
      .collection('plans')
      .where({
        status: 'active',
        deletedAt: _.exists(false),
      })
      .orderBy('sort', 'asc')
      .limit(20)
      .get()
    return result.data
  } catch (error) {
    console.warn('plans collection unavailable', error.message)
    return []
  }
}

async function resolveFamilyId(openid, familyId) {
  if (familyId) {
    return familyId
  }
  const userResult = await db
    .collection('users')
    .where({
      openid,
    })
    .limit(1)
    .get()
  const currentFamilyId = userResult.data[0] && userResult.data[0].currentFamilyId
  if (currentFamilyId) {
    return currentFamilyId
  }
  throw new Error('familyId is required')
}

async function assertFamilyAccess(openid, familyId) {
  const result = await db
    .collection('family_roles')
    .where({
      openid,
      familyId,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('no family permission')
  }
  return result.data[0]
}

async function assertFamilyManager(openid, familyId) {
  const role = await assertFamilyAccess(openid, familyId)
  if (!['owner', 'admin'].includes(role.role)) {
    throw new Error('只有家庭创建者或管理员可以购买会员')
  }
  return role
}

async function getPlan(planId) {
  const builtInPlan = PLANS.find((item) => item.planId === planId)
  if (builtInPlan) {
    return builtInPlan
  }
  const result = await db
    .collection('plans')
    .where({
      planId,
      status: 'active',
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('plan not found')
  }
  return result.data[0]
}

async function findCouponForOrder(code, openid, familyId, plan) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!normalizedCode) {
    throw new Error('coupon code is required')
  }
  const result = await db
    .collection('coupons')
    .where({
      code: normalizedCode,
      status: 'active',
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('优惠券不存在')
  }
  const coupon = result.data[0]
  const validation = await validateCoupon(coupon, {
    openid,
    familyId,
    plan,
    strictLimit: true,
  })
  if (!validation.ok) {
    throw new Error(validation.message)
  }
  return coupon
}

async function validateCoupon(coupon, context) {
  const now = Date.now()
  if (coupon.startAt && new Date(coupon.startAt).getTime() > now) {
    return invalid('优惠券尚未开始')
  }
  if (coupon.endAt && new Date(coupon.endAt).getTime() < now) {
    return invalid('优惠券已过期')
  }
  if (context.familyId && coupon.familyId && coupon.familyId !== context.familyId) {
    return invalid('优惠券不属于当前家庭')
  }
  if (context.plan) {
    if (!isCouponApplicableToPlan(coupon, context.plan)) {
      return invalid('优惠券不适用于当前套餐')
    }
    if (Number(coupon.minAmount || 0) > 0 && context.plan.price < Number(coupon.minAmount || 0)) {
      return invalid('订单金额未达到优惠券门槛')
    }
  }
  if (Number(coupon.totalQuantity || 0) > 0 && Number(coupon.usedQuantity || 0) >= Number(coupon.totalQuantity || 0)) {
    return invalid('优惠券已领完')
  }
  if (context.strictLimit) {
    const [userUsed, familyUsed] = await Promise.all([
      countCouponUsage({
        couponId: coupon._id,
        userOpenid: context.openid,
      }),
      countCouponUsage({
        couponId: coupon._id,
        familyId: context.familyId,
      }),
    ])
    if (Number(coupon.perUserLimit || 0) > 0 && userUsed >= Number(coupon.perUserLimit || 0)) {
      return invalid('当前用户已达到优惠券使用上限')
    }
    if (Number(coupon.perFamilyLimit || 0) > 0 && familyUsed >= Number(coupon.perFamilyLimit || 0)) {
      return invalid('当前家庭已达到优惠券使用上限')
    }
  }
  return {
    ok: true,
  }
}

async function countCouponUsage(query) {
  const result = await db
    .collection('coupon_redemptions')
    .where({
      ...query,
      status: 'used',
    })
    .count()
  return result.total || 0
}

function invalid(message) {
  return {
    ok: false,
    message,
  }
}

function isCouponApplicableToPlan(coupon, plan) {
  if (!coupon.applicablePlans || !coupon.applicablePlans.length) {
    return true
  }
  const planGroup = plan.durationDays >= 365 ? 'yearly' : 'monthly'
  return coupon.applicablePlans.includes(planGroup) || coupon.applicablePlans.includes(plan.planId)
}

function calcDiscount(plan, coupon) {
  if (!coupon) {
    return 0
  }
  if (!isCouponApplicableToPlan(coupon, plan)) {
    return 0
  }
  let discount = 0
  if (coupon.type === 'percent_off') {
    discount = Math.floor((plan.price * (100 - Number(coupon.value || 0))) / 100)
  } else if (coupon.type === 'trial_days') {
    discount = 0
  } else {
    discount = Number(coupon.value || 0)
  }
  if (Number(coupon.maxDiscountAmount || 0) > 0) {
    discount = Math.min(discount, Number(coupon.maxDiscountAmount || 0))
  }
  return Math.max(0, Math.min(plan.price, discount))
}

async function createOrderNo() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `FH${datePart}${randomPart}`
}

async function markCouponPending(coupon, openid, familyId, orderId, planId, discountAmount) {
  try {
    await db.collection('coupon_redemptions').add({
      data: {
        couponId: coupon._id,
        code: coupon.code,
        userOpenid: openid,
        familyId,
        orderId,
        planId,
        discountAmount,
        usedAt: null,
        status: 'pending',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
  } catch (error) {
    console.warn('coupon_redemptions pending failed', error.message)
  }
}

async function markCouponUsed(order, orderId, openid) {
  const pending = await db
    .collection('coupon_redemptions')
    .where({
      couponId: order.couponId,
      orderId,
      status: 'pending',
    })
    .limit(1)
    .get()
  const now = db.serverDate()
  if (pending.data.length) {
    await db.collection('coupon_redemptions').doc(pending.data[0]._id).update({
      data: {
        status: 'used',
        usedAt: now,
        updatedAt: now,
      },
    })
  } else {
    await db.collection('coupon_redemptions').add({
      data: {
        couponId: order.couponId,
        code: order.couponCode,
        userOpenid: openid,
        familyId: order.familyId,
        orderId,
        planId: order.planId,
        discountAmount: order.discountAmount,
        usedAt: now,
        status: 'used',
        createdAt: now,
        updatedAt: now,
      },
    })
  }
  await db.collection('coupons').doc(order.couponId).update({
    data: {
      usedQuantity: _.inc(1),
      updatedAt: now,
    },
  })
}

async function getSubscriptionExpireAt(familyId, durationDays) {
  let start = Date.now()
  try {
    const active = await db
      .collection('subscriptions')
      .where({
        familyId,
        status: 'active',
      })
      .orderBy('expireAt', 'desc')
      .limit(1)
      .get()
    if (active.data.length && active.data[0].expireAt) {
      start = Math.max(start, new Date(active.data[0].expireAt).getTime())
    }
  } catch (error) {
    console.warn('subscriptions lookup failed', error.message)
  }
  return new Date(start + durationDays * 86400000)
}

async function activateFamilyPlan(familyId, plan, expireAt, source) {
  if (!familyId) {
    return
  }
  await db
    .collection('families')
    .doc(familyId)
    .update({
      data: {
        plan: 'pro',
        proExpireAt: expireAt,
        proSource: source || plan.planId,
        proUpdatedAt: db.serverDate(),
        currentQuotaSnapshot: PRO_LIMITS,
        updatedAt: db.serverDate(),
      },
    })
}

function buildDiscountPreview(coupon) {
  if (coupon.type === 'percent_off') {
    return `${coupon.value / 10} 折`
  }
  if (coupon.type === 'trial_days') {
    return `${coupon.value} 天体验`
  }
  return `减 ¥${formatMoney(Number(coupon.value || 0))}`
}

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
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
