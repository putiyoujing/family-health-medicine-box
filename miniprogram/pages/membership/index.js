const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { EVENT_IDS, track, trackServiceError } = require('../../utils/analytics')

const DEFAULT_PLANS = [
  { planId: 'monthly_pro', name: '安心版', durationDays: 30, price: 990, membershipTier: 'paid', badge: '灵活体验' },
  { planId: 'yearly_pro', name: '安心版', durationDays: 365, price: 9900, membershipTier: 'paid', badge: '年度更划算' },
  { planId: 'monthly_unlimited', name: '畅享版', durationDays: 30, price: 1990, membershipTier: 'unlimited', badge: '不限次数' },
  { planId: 'yearly_unlimited', name: '畅享版', durationDays: 365, price: 19900, membershipTier: 'unlimited', badge: '年度更划算' },
]

const DEFAULT_ENTITLEMENT = {
  plan: 'free', tier: 'free', planName: '基础版', limits: { maxOwnedFamilies: 1, maxMembers: 3, maxAttachments: 10, quickRecordLimit: 3 },
}

Page({
  data: {
    loading: true, family: {}, entitlement: DEFAULT_ENTITLEMENT, usageRows: [], plans: [], redeemCode: '', redeeming: false,
    redeemResult: null, membershipPurchaseGuide: '请输入已有会员兑换码完成权益激活。', isFreeMembership: true, isUnlimitedMembership: false, expireText: '',
  },

  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },

  async onShow() { await this.load() },

  async load() {
    this.setData({ loading: true })
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false }); return }
    try {
      const [membership, planData] = await Promise.all([api.getMembershipStatus(), api.getPlans()])
      const entitlement = membership.entitlement || DEFAULT_ENTITLEMENT
      const plans = normalizePlans(planData.plans && planData.plans.length ? planData.plans : DEFAULT_PLANS)
      this.setData({
        loading: false, family: membership.family || {}, entitlement,
        usageRows: buildUsageRows(entitlement.limits || {}, membership.usage || {}, membership.familyPolicy || {}), plans,
        membershipPurchaseGuide: String(planData.membershipPurchaseGuide || this.data.membershipPurchaseGuide),
        isFreeMembership: isFreePlan(entitlement), isUnlimitedMembership: isUnlimitedPlan(entitlement),
        expireText: formatDate(entitlement.proExpireAt || entitlement.expireAt),
      })
    } catch (error) {
      this.setData({ loading: false }); trackServiceError('membership_load')
      wx.showToast({ title: error.message || '会员信息加载失败', icon: 'none' })
    }
  },

  selectPlan(event) {
    const planId = event.currentTarget.dataset.planId
    if (!planId) return
    ensureLoginReady().then((loggedIn) => {
      if (!loggedIn) return
      if (!this.data.family || !this.data.family._id) { wx.showToast({ title: '请先创建或加入家庭', icon: 'none' }); return }
      wx.navigateTo({ url: `/pages/membership/checkout?planId=${encodeURIComponent(planId)}` })
    })
  },

  onRedeemInput(event) { this.setData({ redeemCode: String(event.detail.value || '').trim().toUpperCase() }) },

  async redeemMembershipCode() {
    if (!await ensureLoginReady()) return
    if (!this.data.family || !this.data.family._id) { wx.showToast({ title: '请先创建或加入家庭', icon: 'none' }); return }
    if (!this.data.redeemCode) { wx.showToast({ title: '请输入会员兑换码', icon: 'none' }); return }
    this.setData({ redeeming: true, redeemResult: null })
    try {
      const result = await api.redeemMembershipCode({ code: this.data.redeemCode })
      this.setData({ redeeming: false, redeemCode: '', redeemResult: result })
      track(EVENT_IDS.MEMBERSHIP_REDEEM_RESULT, { status: 'success', tier: result.plan && result.plan.membershipTier })
      wx.showToast({ title: '会员已激活' }); await this.load()
    } catch (error) {
      this.setData({ redeeming: false }); track(EVENT_IDS.MEMBERSHIP_REDEEM_RESULT, { status: 'fail', tier: 'unknown' }); trackServiceError('membership_redeem')
      wx.showToast({ title: error.message || '兑换失败', icon: 'none' })
    }
  },
})

function normalizePlans(plans) {
  const visible = plans.filter((plan) => plan && plan.visible !== false && ['monthly_pro', 'yearly_pro', 'monthly_unlimited', 'yearly_unlimited'].includes(plan.planId))
  const source = visible.length ? visible : DEFAULT_PLANS
  return source.map((plan) => ({
    ...plan, tierLabel: plan.membershipTier === 'unlimited' ? '畅享版' : '安心版', periodLabel: Number(plan.durationDays) >= 365 ? '年度' : '月度',
    priceText: (Number(plan.price || 0) / 100).toFixed(2), benefitItems: buildPlanBenefits(plan),
  })).sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
}

function buildPlanBenefits(plan) {
  const benefits = plan.benefits || {}
  return [`${benefits.maxOwnedFamilies || 3} 个家庭`, `${benefits.maxMembers || 10} 位成员`, `${benefits.maxAttachments || 100} 个附件`, benefits.quickRecordLimit === null ? '快速记录不限次数' : `快速记录 ${benefits.quickRecordLimit || 30} 次/月`]
}

function buildUsageRows(limits, usage, familyPolicy) {
  return [
    { label: '家庭数量', used: familyPolicy.ownedFamilyCount || 0, limit: familyPolicy.maxOwnedFamilies || limits.maxOwnedFamilies || 1 },
    { label: '家庭成员', used: usage.members || 0, limit: limits.maxMembers || 3 },
    { label: '快速记录', used: usage.quickRecord ? usage.quickRecord.used : 0, limit: limits.quickRecordLimit === null ? '不限' : (limits.quickRecordLimit || 3) },
    { label: '附件空间', used: usage.attachments || 0, limit: limits.maxAttachments || 10 },
  ].map((item) => ({ ...item, progress: item.limit === '不限' ? 18 : Math.min(100, Math.round((item.used / item.limit) * 100)) }))
}

function isFreePlan(entitlement = {}) { return entitlement.tier === 'free' || entitlement.plan === 'free' || /基础|免费/.test(String(entitlement.planName || '')) }
function isUnlimitedPlan(entitlement = {}) { return entitlement.tier === 'unlimited' || /畅享/.test(String(entitlement.planName || '')) }
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
