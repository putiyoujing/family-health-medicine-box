const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const virtualPayment = require('./virtual-payment')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database({
  throwOnNotFound: false,
})
const _ = db.command
const DEFAULT_MEMBERSHIP_PURCHASE_GUIDE = '请输入已有会员兑换码完成权益激活。'

const PRO_LIMITS = {
  maxOwnedFamilies: 3,
  maxMembers: 10,
  maxAttachments: 100,
  aiImageParseMonthly: 100,
  aiAssistantMonthly: 300,
  familyMonthlyReport: true,
  quickRecordLimit: 30,
  quickRecordPeriod: 'monthly',
}

const UNLIMITED_LIMITS = {
  ...PRO_LIMITS,
  quickRecordLimit: null,
  quickRecordPeriod: 'unlimited',
}

const PLANS = [
  {
    planId: 'yearly_pro',
    name: '安心版（年度）',
    price: 9900,
    displayPrice: '99',
    durationDays: 365,
    badge: '推荐',
    sort: 0,
    membershipTier: 'paid',
    benefits: PRO_LIMITS,
  },
  {
    planId: 'monthly_pro',
    name: '安心版（月度）',
    price: 990,
    displayPrice: '9.9',
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
    membershipTier: 'paid',
    benefits: PRO_LIMITS,
  },
  {
    planId: 'yearly_unlimited',
    name: '畅享版（年度）',
    price: 19900,
    displayPrice: '199',
    durationDays: 365,
    badge: '年度更划算',
    sort: 2,
    membershipTier: 'unlimited',
    benefits: UNLIMITED_LIMITS,
  },
  {
    planId: 'monthly_unlimited',
    name: '畅享版（月度）',
    price: 1990,
    displayPrice: '19.9',
    durationDays: 30,
    badge: '不限次数',
    sort: 3,
    membershipTier: 'unlimited',
    benefits: UNLIMITED_LIMITS,
  },
  // 兼容历史兑换码，不在会员中心作为可购买套餐展示。
  {
    planId: 'unlimited_pro',
    name: '畅享版（年度）',
    price: 19900,
    displayPrice: '199',
    durationDays: 365,
    badge: '不限次数',
    sort: 99,
    visible: false,
    membershipTier: 'unlimited',
    benefits: UNLIMITED_LIMITS,
  },
]

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  if (wxContext.SOURCE === 'wx_paycallback') {
    if (event.Event === 'xpay_goods_deliver_notify') return handleVirtualPaymentCallback(event)
    if (event.MsgType === 'event') return { ErrCode: 1, ErrMsg: 'fail' }
  }
  if (wxContext.SOURCE === 'wx_trigger') return reconcilePendingVirtualOrders()
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
      case 'redeemMembershipCode':
        return ok(await redeemMembershipCode(openid, payload))
      case 'listCouponsForUser':
        return ok(await listCouponsForUser(openid, payload))
      case 'listOrdersForUser':
        return ok(await listOrdersForUser(openid, payload))
      case 'getOrderForUser':
        return ok(await getOrderForUser(openid, payload))
      case 'cancelOrderForUser':
        return ok(await cancelOrderForUser(openid, payload))
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
  const [dbPlans, membershipPurchaseGuide] = await Promise.all([
    safeGetPlansFromDb(),
    getMembershipPurchaseGuide(),
  ])
  return {
    plans: (dbPlans.length ? mergePlanDefaults(dbPlans) : PLANS).filter((plan) => plan.visible !== false),
    membershipPurchaseGuide,
    paymentCapability: getPaymentCapability(),
  }
}

function mergePlanDefaults(dbPlans) {
  const builtInsById = new Map(PLANS.map((plan) => [plan.planId, plan]))
  const configured = dbPlans.map((plan) => {
    const builtInPlan = builtInsById.get(plan.planId)
    return builtInPlan
      ? {
        ...builtInPlan,
        ...plan,
        name: String(plan.name || builtInPlan.name),
        membershipTier: builtInPlan.membershipTier,
        benefits: {
          ...builtInPlan.benefits,
          ...(plan.benefits || {}),
          quickRecordLimit: builtInPlan.benefits.quickRecordLimit,
          quickRecordPeriod: builtInPlan.benefits.quickRecordPeriod,
        },
      }
      : plan
  })
  const configuredIds = new Set(configured.map((plan) => plan.planId))
  return configured.concat(PLANS.filter((plan) => !configuredIds.has(plan.planId)))
}

async function getMembershipPurchaseGuide() {
  const config = await safeGetDoc('app_configs', 'membership')
  return String(config && config.membershipPurchaseGuide || '').trim()
    || DEFAULT_MEMBERSHIP_PURCHASE_GUIDE
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

function getPaymentCapability() {
  return virtualPayment.getCapability()
}

async function createOrder(openid, payload) {
  const capability = getPaymentCapability()
  let mock = false
  try { assertMockPaymentEnabled(); mock = true } catch {}
  if (!mock && !capability.ready) throw new Error(capability.reason)
  if (!mock && payload.couponCode) throw new Error('虚拟支付暂不支持优惠券，请移除后重试')
  const familyId = await resolveFamilyId(openid, payload.familyId)
  const managerRole = await assertFamilyManager(openid, familyId)
  const plan = await getPlan(payload.planId)
  const product = mock ? null : virtualPayment.getProduct(plan)
  if (!mock && !payload.loginCode) throw new Error('支付登录信息已失效，请重试')
  const idempotencyKey = String(payload.idempotencyKey || '').trim()
  const deterministicOrderId = idempotencyKey
    ? `idem_${crypto.createHash('sha256').update(`${openid}:${idempotencyKey}`).digest('hex').slice(0, 24)}`
    : ''
  const coupon = payload.couponCode ? await findCouponForOrder(payload.couponCode, openid, familyId, plan) : null
  const discountAmount = coupon ? calcDiscount(plan, coupon) : 0
  const payableAmount = Math.max(0, plan.price - discountAmount)
  const membershipChange = await getMembershipChangeContext(familyId)
  const orderNo = await createOrderNo()
  const now = db.serverDate()
  const orderData = {
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
      couponName: coupon ? coupon.name || '' : '',
      previousPlan: membershipChange.previousPlan,
      previousPlanId: membershipChange.previousPlanId,
      previousMembershipTier: membershipChange.previousMembershipTier,
      previousExpireAt: membershipChange.previousExpireAt,
      status: 'pending',
      paymentProvider: 'official_virtual_payment',
      paymentMode: mock ? 'mock' : 'virtual',
      planDurationDays: plan.durationDays,
      planBenefits: plan.benefits,
      planMembershipTier: plan.membershipTier,
      productId: product ? product.productId : '',
      goodsPrice: product ? product.goodsPrice : payableAmount,
      paymentTradeNo: '',
      idempotencyKey,
      paymentReady: false,
      paymentPreparation: mock ? 'mock' : 'preparing',
      createdAt: now,
      updatedAt: now,
  }
  if (typeof db.runTransaction !== 'function') throw new Error('会员服务暂不可用，请稍后重试')
  const orderId = deterministicOrderId || `order_${crypto.randomBytes(16).toString('hex')}`
  const existing = await db.runTransaction(async (transaction) => {
    await assertTransactionManager(transaction, managerRole, openid, familyId)
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (current) {
      if (current.familyId !== familyId || current.planId !== plan.planId || current.couponCode !== orderData.couponCode || current.payerOpenid !== openid) throw new Error('重复请求参数不一致，请重新发起')
      if (!mock && current.status === 'pending' && current.paymentPreparation === 'failed') {
        await transaction.collection('orders').doc(orderId).update({ data: { paymentPreparation: 'preparing', updatedAt: now } })
        return { ...current, retryPreparation: true }
      }
      return current
    }
    const family = (await transaction.collection('families').doc(familyId).get()).data
    assertPlanTransition(family, plan)
    await transaction.collection('orders').doc(orderId).set({ data: orderData })
    if (coupon) await transaction.collection('coupon_redemptions').doc(`pending_${orderId}`).set({ data: {
      couponId: coupon._id, code: coupon.code, userOpenid: openid, familyId, orderId,
      planId: plan.planId, discountAmount, usedAt: null, status: 'pending', createdAt: now, updatedAt: now,
    } })
    return null
  })
  const order = existing || { ...orderData, _id: orderId }
  if (order.status !== 'pending') return { ...formatOrder(order), payment: { ready: false, provider: 'official_virtual_payment', reason: '订单已处理，请查看订单状态' } }
  if (!mock && existing && !existing.retryPreparation) {
    await reconcileVirtualOrder(order)
    return { ...formatOrder((await db.collection('orders').doc(orderId).get()).data), requiresConfirmation: true, payment: { ready: false, provider: 'official_virtual_payment', reason: '已有待确认支付订单，请在订单详情查看状态' } }
  }
  let payment = { ready: false, provider: 'official_virtual_payment', reason: 'official payment parameters are not configured' }
  if (!mock) {
    try {
      payment = await virtualPayment.preparePayment(order, { loginCode: payload.loginCode, platform: payload.platform })
    } catch (error) {
      await db.collection('orders').doc(orderId).update({ data: { paymentPreparation: 'failed', updatedAt: db.serverDate() } })
      throw error
    }
    await db.collection('orders').doc(orderId).update({ data: { paymentPreparation: 'signed', paymentReady: true, updatedAt: db.serverDate() } })
  }

  return { ...formatOrder(order), plan, coupon, payment }

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

async function redeemMembershipCode(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  const managerRole = await assertFamilyManager(openid, familyId)
  const code = normalizeRedeemCode(payload.code || payload.couponCode || payload.redeemCode)
  if (!code) {
    throw new Error('请输入会员兑换码')
  }

  const initialCodeRecord = await findMembershipCode(code)
  const plansById = new Map(await Promise.all(PLANS.map(async (item) => [item.planId, await getPlan(item.planId)])))
  if (typeof db.runTransaction !== 'function') throw new Error('会员服务暂不可用，请稍后重试')
  return db.runTransaction(async (transaction) => {
    await assertTransactionManager(transaction, managerRole, openid, familyId)
    const codeRecord = (await transaction.collection('coupon_codes').doc(initialCodeRecord._id).get()).data
    if (!codeRecord || codeRecord.deletedAt) throw new Error('会员兑换码不存在')
    const initialBatch = codeRecord.batchId
      ? (await transaction.collection('coupon_code_batches').doc(codeRecord.batchId).get()).data : null
    if (codeRecord.batchId && !initialBatch) throw new Error('兑换码批次不存在')
    validateMembershipCode(codeRecord)
    validateMembershipCodeBatch(initialBatch)
    const initialPlanConfig = resolveMembershipCodePlan(codeRecord, initialBatch)
    if (!plansById.has(initialPlanConfig.planId)) throw new Error('plan not found')
    const redeemDurationDays = initialPlanConfig.durationDays
    const plan = {
      ...plansById.get(initialPlanConfig.planId),
      durationDays: redeemDurationDays,
    }
    const family = (await transaction.collection('families').doc(familyId).get()).data
    if (!family || family.deletedAt) throw new Error('family not found')
    assertPlanTransition(family, plan)
    const expireAt = subscriptionExpireAt(family, redeemDurationDays)
    const membershipChange = membershipChangeContext(family)
    const externalOrderId = String(codeRecord.externalOrderId || payload.externalOrderId || '').trim()
    const now = db.serverDate()

    const subscriptionId = `code_${codeRecord._id}`
    await assertUnclaimedRecord(transaction, 'subscriptions', subscriptionId)
    await assertUnclaimedRecord(transaction, 'coupon_redemptions', subscriptionId)
    await transaction.collection('subscriptions').doc(subscriptionId).set({
      data: {
        familyId,
        orderId: '',
        externalOrderId,
        source: 'membership_code',
        ...membershipChange,
        sourceCodeId: codeRecord._id,
        code,
        planId: plan.planId,
        planName: plan.name,
        payerOpenid: openid,
        status: 'active',
        startedAt: now,
        expireAt,
        createdAt: now,
        updatedAt: now,
      },
  })

  await transaction.collection('coupon_codes').doc(codeRecord._id).update({
    data: {
      status: 'used',
      issueStatus: 'issued',
      issuedChannel: codeRecord.issuedChannel || payload.issuedChannel || 'xiaohongshu',
      issuedToNote: codeRecord.issuedToNote || payload.issuedToNote || '',
      externalOrderId,
      redeemedByOpenid: openid,
      redeemedFamilyId: familyId,
      activatedSubscriptionId: subscriptionId,
      redeemedPlanId: plan.planId,
      redeemedPlanName: plan.name,
      redeemedMembershipTier: plan.membershipTier || 'paid',
      redeemedAt: now,
      updatedAt: now,
    },
  })

  await transaction.collection('coupon_redemptions').doc(`code_${codeRecord._id}`).set({
    data: {
      codeId: codeRecord._id,
      batchId: codeRecord.batchId || '',
      code,
      userOpenid: openid,
      familyId,
      orderId: '',
      externalOrderId,
      planId: plan.planId,
      planName: plan.name,
      membershipTier: plan.membershipTier || 'paid',
      redemptionType: 'membership_redeem',
      discountAmount: 0,
      membershipDays: redeemDurationDays,
      usedAt: now,
      status: 'used',
      createdAt: now,
      updatedAt: now,
    },
  })

  if (codeRecord.batchId) {
    await transaction.collection('coupon_code_batches').doc(codeRecord.batchId).update({
      data: {
        usedQuantity: _.inc(1),
        updatedAt: db.serverDate(),
      },
    })
  }

  await activateFamilyPlan(familyId, plan, expireAt, 'membership_code', transaction)

  return {
    subscriptionId: subscriptionId,
    familyId,
    status: 'active',
    plan,
    expireAt,
    code,
  }
  })
}

async function listCouponsForUser(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyAccess(openid, familyId)
  const plan = payload.planId ? await getPlan(payload.planId) : null
  const [result, userRedemptions, familyRedemptions] = await Promise.all([
    db.collection('coupons').where({ deletedAt: _.exists(false) }).limit(100).get(),
    db.collection('coupon_redemptions').where({ userOpenid: openid, status: 'used' }).limit(100).get(),
    db.collection('coupon_redemptions').where({ familyId, status: 'used' }).limit(100).get(),
  ])
  const usedCouponIds = new Set(userRedemptions.data.concat(familyRedemptions.data).map((item) => item.couponId).filter(Boolean))
  const coupons = []
  for (const coupon of result.data) {
    const validation = await validateCoupon(coupon, {
      openid,
      familyId,
      plan,
      strictLimit: false,
    })
    const expired = coupon.status !== 'active' || (coupon.endAt && new Date(coupon.endAt).getTime() < Date.now())
    if (usedCouponIds.has(coupon._id)) {
      coupons.push({ ...coupon, statusGroup: 'used', discountPreview: buildDiscountPreview(coupon) })
    } else if (expired) {
      coupons.push({ ...coupon, statusGroup: 'expired', discountPreview: buildDiscountPreview(coupon) })
    } else if (validation.ok) {
      coupons.push({
        ...coupon,
        statusGroup: 'active',
        discountPreview: buildDiscountPreview(coupon),
      })
    }
  }
  return {
    coupons,
  }
}

async function listOrdersForUser(openid, payload) {
  const familyId = await resolveFamilyId(openid, payload.familyId)
  await assertFamilyAccess(openid, familyId)
  let result
  try {
    result = await db.collection('orders').where({ familyId }).orderBy('createdAt', 'desc').limit(50).get()
  } catch (error) {
    console.warn('orders query fallback', error.message)
    result = await db.collection('orders').where({ familyId }).limit(50).get()
  }
  return { familyId, orders: result.data.map(formatOrder) }
}

async function getOrderForUser(openid, payload) {
  const orderId = String(payload.orderId || '').trim()
  if (!orderId) throw new Error('orderId is required')
  const result = await db.collection('orders').doc(orderId).get()
  if (!result.data) throw new Error('order not found')
  await assertFamilyAccess(openid, result.data.familyId)
  if (result.data.paymentMode === 'virtual') {
    await reconcileVirtualOrder(result.data)
    return { order: formatOrder((await db.collection('orders').doc(orderId).get()).data) }
  }
  return { order: formatOrder(result.data) }
}

async function cancelOrderForUser(openid, payload) {
  const orderId = String(payload.orderId || '').trim()
  if (!orderId) throw new Error('orderId is required')
  const result = await db.collection('orders').doc(orderId).get()
  const order = result.data
  if (!order) throw new Error('order not found')
  const managerRole = await assertFamilyManager(openid, order.familyId)
  if (typeof db.runTransaction !== 'function') throw new Error('会员服务暂不可用，请稍后重试')
  return db.runTransaction(async (transaction) => {
    await assertTransactionManager(transaction, managerRole, openid, order.familyId)
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (!current || current.familyId !== order.familyId) throw new Error('order changed')
    if (current.status === 'cancelled') return { orderId, status: 'cancelled' }
    if (current.status !== 'pending') throw new Error('只有待支付订单可以取消')
    if (current.paymentMode === 'virtual') throw new Error('虚拟支付订单请等待微信确认关闭，不能直接取消')
    const now = db.serverDate()
    await transaction.collection('orders').doc(orderId).update({ data: { status: 'cancelled', cancelledAt: now, updatedAt: now } })
    if (current.couponId) {
      const pendingId = `pending_${orderId}`
      const pending = (await transaction.collection('coupon_redemptions').doc(pendingId).get()).data
      if (pending && pending.status === 'pending') await transaction.collection('coupon_redemptions').doc(pendingId).update({ data: { status: 'cancelled', updatedAt: now } })
    }
    return { orderId, status: 'cancelled' }
  })
}

function formatOrder(order = {}) {
  return {
    orderId: order.orderId || order._id || '',
    orderNo: String(order.orderNo || ''),
    planId: String(order.planId || ''),
    planName: String(order.planName || ''),
    status: String(order.status || ''),
    originalAmount: Number(order.originalAmount || 0),
    discountAmount: Number(order.discountAmount || 0),
    payableAmount: Number(order.payableAmount || 0),
    couponName: order.couponName || '',
    createdAt: order.createdAt || null,
    paidAt: order.paidAt || null,
    deliveryStatus: order.deliveryStatus || '',
    canCancel: order.status === 'pending' && order.paymentMode !== 'virtual',
  }
}

async function reconcilePendingVirtualOrders() {
  const [pending, awaitingDelivery] = await Promise.all([
    db.collection('orders').where({ paymentMode: 'virtual', status: 'pending' }).orderBy('createdAt', 'asc').limit(20).get(),
    db.collection('orders').where({ paymentMode: 'virtual', status: 'paid', deliveryStatus: _.in(['pending', 'sending']) })
      .orderBy('createdAt', 'asc').limit(20).get(),
  ])
  const orders = [...new Map([...pending.data, ...awaitingDelivery.data].map((order) => [order._id, order])).values()]
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))
    .slice(0, 20)
  let cursor = 0
  let succeeded = 0
  let failed = 0
  const worker = async () => {
    while (cursor < orders.length) {
      const order = orders[cursor++]
      try {
        await reconcileVirtualOrder(order)
        succeeded += 1
      } catch (error) {
        failed += 1
        console.warn('virtual payment reconciliation failed', error.message)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, orders.length) }, worker))
  return { ok: failed === 0, scanned: orders.length, succeeded, failed }
}

async function mockPaymentSuccess(openid, payload) {
  assertMockPaymentEnabled()
  const orderId = payload.orderId
  if (!orderId) {
    throw new Error('orderId is required')
  }
  const orderResult = await db.collection('orders').doc(orderId).get()
  if (!orderResult.data) {
    throw new Error('order not found')
  }
  const order = orderResult.data
  const managerRole = await assertFamilyManager(openid, order.familyId)
  const plan = await getPlan(order.planId)
  const couponUsage = order.couponId ? {
    user: await countCouponUsage({ couponId: order.couponId, userOpenid: order.payerOpenid }),
    family: await countCouponUsage({ couponId: order.couponId, familyId: order.familyId }),
  } : null
  if (typeof db.runTransaction !== 'function') throw new Error('会员服务暂不可用，请稍后重试')
  return db.runTransaction(async (transaction) => {
    await assertTransactionManager(transaction, managerRole, openid, order.familyId)
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (!current || current.familyId !== order.familyId || current.payerOpenid !== order.payerOpenid || current.planId !== order.planId) throw new Error('order changed')
    if (current.status === 'paid') {
      const subscription = current.subscriptionId && (await transaction.collection('subscriptions').doc(current.subscriptionId).get()).data
      if (!subscription || subscription.orderId !== orderId || subscription.familyId !== current.familyId) throw new Error('订单权益待核查，请联系客服')
      return { orderId, subscriptionId: current.subscriptionId, status: 'paid', familyId: current.familyId, expireAt: subscription.expireAt, plan }
    }
    if (current.status !== 'pending') throw new Error('order is not payable')
    const family = (await transaction.collection('families').doc(current.familyId).get()).data
    if (!family || family.deletedAt) throw new Error('family not found')
    const now = db.serverDate()
    assertPlanTransition(family, plan)
    const expireAt = subscriptionExpireAt(family, plan.durationDays)
    const subscriptionId = `order_${orderId}`
    await assertUnclaimedRecord(transaction, 'subscriptions', subscriptionId)
    await transaction.collection('subscriptions').doc(subscriptionId).set({ data: {
      familyId: current.familyId, orderId, source: 'mock_payment', ...membershipChangeContext(family),
      planId: current.planId, planName: current.planName, payerOpenid: current.payerOpenid,
      status: 'active', startedAt: now, expireAt, createdAt: now, updatedAt: now,
    } })
    await activateFamilyPlan(current.familyId, plan, expireAt, current.couponCode || 'mock_payment', transaction)
    if (current.couponId) await markCouponUsed(current, orderId, current.payerOpenid, transaction, couponUsage)
    await transaction.collection('orders').doc(orderId).update({ data: {
      status: 'paid', subscriptionId, paymentTradeNo: `MOCK${orderId}`, paidAt: now, updatedAt: now,
    } })
    return { orderId, subscriptionId, status: 'paid', expireAt, familyId: current.familyId, plan }
  })
}

function assertPlanTransition(family, plan) {
  if (!family || family.deletedAt) throw new Error('family not found')
  if (family.membershipTier === 'unlimited' && new Date(family.proExpireAt).getTime() > Date.now() && plan.membershipTier !== 'unlimited') {
    throw new Error('畅享版权益有效期内不能开通安心版，请选择畅享版续期')
  }
}

async function reconcileVirtualOrder(order) {
  const orderId = order._id
  if (!['pending', 'paid'].includes(order.status)) return
  const verified = await virtualPayment.queryOrder(order)
  if (['refunded', 'refund_review'].includes(verified.state)) {
    await db.collection('orders').doc(orderId).update({ data: { status: 'refund_review', updatedAt: db.serverDate() } })
    return
  }
  if (verified.state === 'closed') {
    if (order.status === 'pending') {
      await db.runTransaction(async (transaction) => {
        const current = (await transaction.collection('orders').doc(orderId).get()).data
        if (current && current.status === 'pending' && current.paymentMode === 'virtual') {
          await transaction.collection('orders').doc(orderId).update({ data: { status: 'closed', updatedAt: db.serverDate() } })
        }
      })
    }
    return
  }
  if (verified.state !== 'paid') return
  await fulfillVirtualOrder(order, verified)
}

async function handleVirtualPaymentCallback(event) {
  try {
    const goodsInfo = event.GoodsInfo || {}
    const paymentInfo = event.WeChatPayInfo || {}
    const outTradeNo = String(event.OutTradeNo || '').trim()
    const tradeNo = String(paymentInfo.MchOrderNo || '').trim()
    if (event.MsgType !== 'event' || event.Event !== 'xpay_goods_deliver_notify'
      || event.Env !== 0 || !event.OpenId || !outTradeNo || !tradeNo
      || typeof goodsInfo.ProductId !== 'string' || goodsInfo.Quantity !== 1) {
      throw new Error('invalid virtual payment delivery notification')
    }
    const result = await db.collection('orders').where({ orderNo: outTradeNo }).limit(1).get()
    const order = result.data && result.data[0]
    if (!order || order.paymentMode !== 'virtual' || order.orderNo !== outTradeNo
      || order.payerOpenid !== event.OpenId || order.productId !== goodsInfo.ProductId
      || !Number.isSafeInteger(order.goodsPrice) || order.goodsPrice <= 0
      || order.goodsPrice !== Number(order.payableAmount) || order.goodsPrice !== Number(order.originalAmount)
      || (goodsInfo.GoodsPrice !== undefined && Number(goodsInfo.GoodsPrice) !== order.goodsPrice)) {
      throw new Error('virtual payment delivery notification does not match order')
    }
    const verified = await virtualPayment.queryOrder(order)
    if (verified.state !== 'paid' || verified.tradeNo !== tradeNo) {
      throw new Error('virtual payment order verification failed')
    }
    if (!await fulfillVirtualOrder(order, { ...verified, platformDelivered: true })) throw new Error('virtual payment delivery confirmation is pending')
    return { ErrCode: 0, ErrMsg: 'success' }
  } catch (error) {
    console.error('virtual payment callback failed', error)
    return { ErrCode: 1, ErrMsg: 'fail' }
  }
}

async function fulfillVirtualOrder(order, verified) {
  const orderId = order._id
  const plan = { planId: order.planId, name: order.planName, durationDays: order.planDurationDays, benefits: order.planBenefits, membershipTier: order.planMembershipTier }
  if (!Number.isFinite(plan.durationDays) || plan.durationDays <= 0 || !plan.benefits) throw new Error('订单套餐记录不完整，请联系客服')
  if (typeof db.runTransaction !== 'function') throw new Error('会员服务暂不可用，请稍后重试')
  await db.runTransaction(async (transaction) => {
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (!current || current.paymentMode !== 'virtual' || current.orderNo !== order.orderNo
      || current.payerOpenid !== order.payerOpenid || current.productId !== order.productId
      || Number(current.goodsPrice) !== Number(order.goodsPrice)) throw new Error('order changed')
    if (current.status === 'paid') {
      const subscription = current.subscriptionId && (await transaction.collection('subscriptions').doc(current.subscriptionId).get()).data
      if (!subscription || subscription.orderId !== orderId || subscription.familyId !== current.familyId
        || current.paymentTradeNo !== verified.tradeNo) throw new Error('订单权益待核查，请联系客服')
      if (verified.platformDelivered && current.deliveryStatus !== 'confirmed') {
        await transaction.collection('orders').doc(orderId).update({ data: { deliveryStatus: 'confirmed', updatedAt: db.serverDate() } })
      }
      return
    }
    if (current.status !== 'pending') throw new Error('订单状态待核查，请联系客服')
    if (current.goodsPrice !== Number(current.payableAmount) || current.goodsPrice !== Number(current.originalAmount)) throw new Error('订单金额待核查，请联系客服')
    const family = (await transaction.collection('families').doc(current.familyId).get()).data
    assertPlanTransition(family, plan)
    const expireAt = subscriptionExpireAt(family, plan.durationDays)
    const now = db.serverDate()
    const subscriptionId = `wx_${crypto.createHash('sha256').update(verified.tradeNo).digest('hex').slice(0, 32)}`
    await assertUnclaimedRecord(transaction, 'subscriptions', subscriptionId)
    await transaction.collection('subscriptions').doc(subscriptionId).set({ data: {
      familyId: current.familyId, orderId, source: 'virtual_payment', ...membershipChangeContext(family),
      planId: current.planId, planName: current.planName, payerOpenid: current.payerOpenid,
      status: 'active', startedAt: now, expireAt, createdAt: now, updatedAt: now,
    } })
    await activateFamilyPlan(current.familyId, plan, expireAt, 'virtual_payment', transaction)
    await transaction.collection('orders').doc(orderId).update({ data: {
      status: 'paid', subscriptionId, paymentTradeNo: verified.tradeNo, paidAt: verified.paidAt || now,
      deliveryStatus: verified.platformDelivered ? 'confirmed' : 'pending', updatedAt: now,
    } })
  })
  if (verified.platformDelivered) return true
  return confirmVirtualPaymentDelivery(orderId)
}

async function confirmVirtualPaymentDelivery(orderId) {
  const claimTtlMs = 60000
  const claimToken = Date.now()
  const claim = await db.runTransaction(async (transaction) => {
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (!current || current.status !== 'paid' || !current.paymentTradeNo) return { state: 'not_ready' }
    if (current.deliveryStatus === 'confirmed') return { state: 'confirmed' }
    const claimedAt = Number(current.deliveryClaimedAt || 0)
    if (current.deliveryStatus === 'sending' && claimToken - claimedAt < claimTtlMs) return { state: 'busy' }
    await transaction.collection('orders').doc(orderId).update({ data: {
      deliveryStatus: 'sending', deliveryClaimedAt: claimToken, updatedAt: db.serverDate(),
    } })
    return { state: 'claimed', order: current }
  })
  if (claim.state === 'confirmed') return true
  if (claim.state !== 'claimed') return false
  try {
    await virtualPayment.notifyDelivery(claim.order)
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const current = (await transaction.collection('orders').doc(orderId).get()).data
      if (current && current.deliveryStatus === 'sending' && current.deliveryClaimedAt === claimToken) {
        await transaction.collection('orders').doc(orderId).update({ data: { deliveryStatus: 'pending', updatedAt: db.serverDate() } })
      }
    })
    console.warn('virtual payment delivery confirmation pending', error.message)
    return false
  }
  await db.runTransaction(async (transaction) => {
    const current = (await transaction.collection('orders').doc(orderId).get()).data
    if (current && current.deliveryStatus === 'sending' && current.deliveryClaimedAt === claimToken) {
      await transaction.collection('orders').doc(orderId).update({ data: { deliveryStatus: 'confirmed', updatedAt: db.serverDate() } })
    }
  })
  return true
}

function assertMockPaymentEnabled() {
  const allowedEnvironments = ['development', 'test', 'staging', 'local']
  const runtimeEnvironment = String(process.env.NODE_ENV || '').trim().toLowerCase()
  if (process.env.ALLOW_MOCK_PAYMENT !== 'true' || !allowedEnvironments.includes(runtimeEnvironment)) {
    throw new Error(
      'mock payment is disabled; it requires ALLOW_MOCK_PAYMENT=true and NODE_ENV=development|test|staging|local',
    )
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

async function assertTransactionManager(transaction, initialRole, openid, familyId) {
  const role = initialRole && initialRole._id && (await transaction.collection('family_roles').doc(initialRole._id).get()).data
  if (!role || role.deletedAt || role.openid !== openid || role.familyId !== familyId || !['owner', 'admin'].includes(role.role)) {
    throw new Error('家庭管理权限已变更，请刷新后重试')
  }
}

async function assertUnclaimedRecord(transaction, collection, id) {
  if ((await transaction.collection(collection).doc(id).get()).data) throw new Error('存在历史权益记录，请联系客服核查')
}

async function getPlan(planId) {
  try {
    const result = await db.collection('plans').where({ planId, status: 'active', deletedAt: _.exists(false) }).limit(1).get()
    if (result.data.length) {
      const builtInPlan = PLANS.find((item) => item.planId === planId)
      return builtInPlan ? {
        ...builtInPlan,
        ...result.data[0],
        membershipTier: builtInPlan.membershipTier,
        durationDays: builtInPlan.durationDays,
        benefits: { ...builtInPlan.benefits, ...(result.data[0].benefits || {}) },
      } : result.data[0]
    }
  } catch (error) {
    console.warn('configured plan lookup failed', error.message)
  }
  const builtInPlan = PLANS.find((item) => item.planId === planId)
  if (!builtInPlan) throw new Error('plan not found')
  return builtInPlan
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

async function findMembershipCode(code) {
  const result = await db
    .collection('coupon_codes')
    .where({
      code,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('会员兑换码不存在')
  }
  return result.data[0]
}

function validateMembershipCode(codeRecord) {
  if (codeRecord.status === 'processing') throw new Error('这个兑换码有历史未完成记录，请联系客服核查')
  if (codeRecord.status === 'used') {
    throw new Error('这个会员兑换码已被使用')
  }
  if (codeRecord.status === 'disabled') {
    throw new Error('这个会员兑换码已被禁用')
  }
  if (codeRecord.status === 'expired') {
    throw new Error('这个会员兑换码已过期')
  }
  if (codeRecord.status && codeRecord.status !== 'active') {
    throw new Error('这个会员兑换码当前不可用')
  }
  const expiresAt = codeRecord.expiresAt || codeRecord.endAt
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    throw new Error('这个会员兑换码已过期')
  }
}

function validateMembershipCodeBatch(batch) {
  if (batch && (batch.deletedAt || (batch.status && batch.status !== 'active'))) {
    throw new Error('这个兑换码批次已停用')
  }
  const now = Date.now()
  const startAt = batch && batch.startAt
  const endAt = batch && batch.endAt
  if (startAt && new Date(startAt).getTime() > now) {
    throw new Error('这个会员兑换码尚未开始使用')
  }
  if (endAt && new Date(endAt).getTime() < now) {
    throw new Error('这个会员兑换码已过期')
  }
}

function resolveMembershipCodePlan(codeRecord, batch) {
  const planId =
    codeRecord.redeemPlanId ||
    (batch && batch.redeemPlanId) ||
    'yearly_pro'
  const defaultPlan = PLANS.find((item) => item.planId === planId) || PLANS[0]
  const requestedDurationDays = Number(
    codeRecord.redeemDurationDays ||
      (batch && batch.redeemDurationDays) ||
      defaultPlan.durationDays,
  )
  if (!Number.isFinite(requestedDurationDays) || requestedDurationDays < 1 || requestedDurationDays > 3650) {
    throw new Error('兑换码会员时长无效')
  }
  return {
    planId,
    durationDays: Math.floor(requestedDurationDays),
  }
}

async function safeGetDoc(collection, id) {
  if (!id) {
    return null
  }
  try {
    const result = await db.collection(collection).doc(id).get()
    return result.data || null
  } catch (error) {
    console.warn(`safeGetDoc ${collection}`, error.message)
    return null
  }
}

function normalizeRedeemCode(value) {
  return String(value || '').trim().toUpperCase()
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

async function markCouponUsed(order, orderId, openid, transaction, usage) {
  const coupon = (await transaction.collection('coupons').doc(order.couponId).get()).data
  if (!coupon || coupon.status !== 'active' || coupon.deletedAt) throw new Error('优惠券不可用')
  if (Number(coupon.totalQuantity || 0) > 0 && Number(coupon.usedQuantity || 0) >= Number(coupon.totalQuantity)) throw new Error('优惠券已领完')
  for (const [scope, identity, limit] of [['user', openid, coupon.perUserLimit], ['family', order.familyId, coupon.perFamilyLimit]]) {
    const counterId = `usage_${crypto.createHash('sha256').update(`${order.couponId}:${scope}:${identity}`).digest('hex')}`
    const counter = (await transaction.collection('coupon_redemptions').doc(counterId).get()).data
    const used = Math.max(Number(counter && counter.count || 0), Number(usage && usage[scope] || 0))
    if (Number(limit || 0) > 0 && used >= Number(limit)) throw new Error('已达到优惠券使用上限')
    await transaction.collection('coupon_redemptions').doc(counterId).set({ data: { recordType: 'usage_counter', couponId: order.couponId, count: used + 1 } })
  }
  const now = db.serverDate()
  await transaction.collection('coupon_redemptions').doc(`pending_${orderId}`).set({ data: {
    couponId: order.couponId, code: order.couponCode, userOpenid: openid, familyId: order.familyId,
    orderId, planId: order.planId, discountAmount: order.discountAmount, usedAt: now,
    status: 'used', createdAt: now, updatedAt: now,
  } })
  await transaction.collection('coupons').doc(order.couponId).update({ data: { usedQuantity: _.inc(1), updatedAt: now } })
}

async function getMembershipChangeContext(familyId) {
  const family = await safeGetDoc('families', familyId)
  return membershipChangeContext(family)
}

function membershipChangeContext(family) {
  const previousPlan = family?.plan === 'pro' ? 'pro' : 'free'
  return {
    changeType: previousPlan === 'free' ? 'upgrade' : 'renewal',
    previousExpireAt: family?.proExpireAt || null,
    previousPlan,
    previousPlanId: family?.planId || 'free',
    previousMembershipTier: family?.membershipTier || 'free',
  }
}

function subscriptionExpireAt(family, durationDays) {
  const previous = family.proExpireAt ? new Date(family.proExpireAt).getTime() : 0
  if (!Number.isFinite(previous)) throw new Error('会员到期时间异常，请联系客服')
  return new Date(Math.max(Date.now(), previous) + durationDays * 86400000)
}

async function activateFamilyPlan(familyId, plan, expireAt, source, transaction) {
  if (!familyId) {
    return
  }
  await transaction
    .collection('families')
    .doc(familyId)
    .update({
      data: {
        plan: 'pro',
        membershipTier: plan.membershipTier || 'paid',
        planId: plan.planId,
        proExpireAt: expireAt,
        proSource: source || plan.planId,
        proUpdatedAt: db.serverDate(),
        currentQuotaSnapshot: plan.benefits || PRO_LIMITS,
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
