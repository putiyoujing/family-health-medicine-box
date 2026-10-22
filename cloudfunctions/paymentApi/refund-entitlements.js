const DAY_MS = 86400000

function time(value) {
  const result = value ? new Date(value).getTime() : 0
  if (!Number.isFinite(result)) throw new Error('会员权益时间异常，请人工核查')
  return result
}

function replayWithoutRefundedOrder(target, laterSubscriptions) {
  if (!target || target.status !== 'active') throw new Error('退款订单权益记录异常，请人工核查')
  let previousExpireAt = target.previousExpireAt || null
  let previousPlan = target.previousPlan || 'free'
  let previousPlanId = target.previousPlanId || 'free'
  let previousMembershipTier = target.previousMembershipTier || 'free'
  const patches = []
  const later = laterSubscriptions.filter((item) => item.status === 'active')
    .sort((a, b) => time(a.startedAt) - time(b.startedAt) || String(a._id).localeCompare(String(b._id)))
  for (const item of later) {
    const started = time(item.startedAt)
    const originalBase = Math.max(started, time(item.previousExpireAt))
    const duration = time(item.expireAt) - originalBase
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 3660 * DAY_MS) throw new Error('会员权益时长异常，请人工核查')
    const expireAt = new Date(Math.max(started, time(previousExpireAt)) + duration)
    patches.push({ id: item._id, previousExpireAt, previousPlan, previousPlanId, previousMembershipTier, expireAt })
    previousExpireAt = expireAt
    previousPlan = 'pro'
    previousPlanId = item.planId
    previousMembershipTier = item.membershipTier || (String(item.planId).includes('unlimited') ? 'unlimited' : 'paid')
  }
  return { patches, plan: previousPlan, planId: previousPlanId, membershipTier: previousMembershipTier, proExpireAt: previousExpireAt, lastSubscription: later.at(-1) || null }
}

module.exports = { replayWithoutRefundedOrder }
