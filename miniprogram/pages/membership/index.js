const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { EVENT_IDS, track, trackServiceError } = require('../../utils/analytics')

const DEFAULT_MEMBERSHIP_PURCHASE_GUIDE = '请输入已有会员兑换码完成权益激活。'
const GUIDE_CACHE_KEY = 'membership-guide'

const DEFAULT_ENTITLEMENT = {
  plan: 'free', tier: 'free', planName: '基础版', limits: { maxOwnedFamilies: 1, maxMembers: 3, maxAttachments: 10, quickRecordLimit: 3 },
}

Page({
  data: {
    loading: true, family: {}, entitlement: DEFAULT_ENTITLEMENT, usageRows: [], plans: [], redeemCode: '', redeeming: false,
    redeemResult: null, membershipPurchaseGuide: DEFAULT_MEMBERSHIP_PURCHASE_GUIDE, isFreeMembership: true, isUnlimitedMembership: false, expireText: '',
    paymentReady: false, paymentReason: '在线支付暂未开放，可使用已有兑换码。',
    periodOptions: [{ value: 'monthly', label: '月度' }, { value: 'yearly', label: '年度' }], selectedPeriod: 'monthly', selectedPlanId: '', selectedPlan: {}, planCards: [],
  },

  onShareAppMessage() { return require('../../utils/share').getDefaultShareConfig() },

  onLoad(options = {}) {
    try {
      const cached = wx.getStorageSync(GUIDE_CACHE_KEY)
      if (cached && cached.membershipPurchaseGuide) this.setData({ membershipPurchaseGuide: cached.membershipPurchaseGuide })
    } catch (_) { /* 缓存不可用不影响在线加载 */ }
    const home = api.getCachedHome && api.getCachedHome()
    if (home) this.applyMembership(home)
    this.focusRedeem = options.focus === 'redeem'
  },

  async onShow() { await this.load() },

  applyMembership(membership) {
    const entitlement = membership.entitlement || DEFAULT_ENTITLEMENT
    this.setData({
      family: membership.family || {}, entitlement,
      usageRows: buildUsageRows(entitlement.limits || {}, membership.usage || {}, membership.familyPolicy || {}),
      isFreeMembership: isFreePlan(entitlement), isUnlimitedMembership: isUnlimitedPlan(entitlement),
      expireText: formatDate(entitlement.proExpireAt || entitlement.expireAt),
    })
  },

  async load() {
    this.setData({ loading: true, paymentReady: false })
    if (!await ensureLoginReady({ silent: true })) { this.setData({ loading: false, family: {} }); return }
    const results = await Promise.allSettled([
      api.getMembershipStatus().then((membership) => this.applyMembership(membership)),
      api.getPlans().then((planData) => {
        const plans = normalizePlans(planData.plans || [])
        const selectedPlanId = resolveSelectedPlanId(plans, this.data.selectedPlanId, this.data.entitlement)
        const selectedPlan = plans.find((plan) => plan.planId === selectedPlanId) || {}
        const membershipPurchaseGuide = String(planData.membershipPurchaseGuide || DEFAULT_MEMBERSHIP_PURCHASE_GUIDE)
        let platform = ''
        try { platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform } catch (_) { /* 旧客户端仍由支付页校验 */ }
        const capability = planData.paymentCapability || {}
        const iosBlocked = platform === 'ios' && capability.iosEnabled !== true
        this.setData({
          plans, membershipPurchaseGuide, selectedPlanId, selectedPlan,
          selectedPeriod: selectedPlan.period || 'monthly',
          planCards: buildPlanCards(plans, selectedPlan.period || 'monthly'),
          paymentReady: capability.ready === true && !iosBlocked,
          paymentReason: iosBlocked ? '当前暂未开通 iOS 支付，可使用已有兑换码。' : capability.reason || '在线支付暂未开放，可使用已有兑换码。',
        })
        try { wx.setStorageSync(GUIDE_CACHE_KEY, { membershipPurchaseGuide }) } catch (_) { /* 缓存写入失败不影响展示 */ }
      }),
    ])
    this.setData({ loading: false })
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) {
      trackServiceError('membership_load')
      wx.showToast({ title: failed.reason.message || '会员信息加载失败', icon: 'none' })
    }
    if (this.focusRedeem && wx.pageScrollTo) {
      wx.pageScrollTo({ selector: '#redeem-section', duration: 0 })
      this.focusRedeem = false
    }
  },

  selectPeriod(event) {
    const period = event.currentTarget.dataset.period
    if (!period || period === this.data.selectedPeriod) return
    const selectedTier = this.data.selectedPlan && this.data.selectedPlan.membershipTier
    const plan = this.data.plans.find((item) => item.period === period && item.membershipTier === selectedTier)
      || this.data.plans.find((item) => item.period === period)
    if (plan) this.setData({ selectedPeriod: period, selectedPlanId: plan.planId, selectedPlan: plan, planCards: buildPlanCards(this.data.plans, period) })
  },

  selectPlan(event) {
    const planId = event.currentTarget.dataset.planId
    const plan = this.data.plans.find((item) => item.planId === planId)
    if (!plan) return
    this.setData({ selectedPeriod: plan.period, selectedPlanId: plan.planId, selectedPlan: plan, planCards: buildPlanCards(this.data.plans, plan.period) })
  },

  goBack() { wx.navigateBack({ delta: 1 }) },

  openProfile() { wx.switchTab({ url: '/pages/profile/index' }) },

  openFamilySwitch() { wx.navigateTo({ url: '/pages/family/switch' }) },

  async buySelectedPlan() {
    const planId = this.data.selectedPlanId
    if (!planId) return
    if (!this.data.paymentReady) { wx.showToast({ title: this.data.paymentReason, icon: 'none' }); return }
    if (!await ensureLoginReady()) return
    if (!this.data.family || !this.data.family._id) { wx.showToast({ title: '请先创建或加入家庭', icon: 'none' }); return }
    wx.navigateTo({ url: `/pages/membership/checkout?planId=${encodeURIComponent(planId)}` })
  },

  onRedeemInput(event) { this.setData({ redeemCode: String(event.detail.value || '').trim().toUpperCase() }) },

  async redeemMembershipCode() {
    if (this._redeeming) return
    this._redeeming = true
    try { await this.performRedemption() } finally { this._redeeming = false }
  },

  async performRedemption() {
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
  const visible = plans.filter((plan) => plan && plan.visible !== false && ['monthly_pro', 'yearly_pro', 'monthly_unlimited', 'yearly_unlimited', 'unlimited_pro'].includes(plan.planId))
  return visible.map((plan) => ({ ...plan, membershipTier: plan.membershipTier || (plan.planId.includes('unlimited') ? 'unlimited' : 'paid') })).map((plan) => ({
    ...plan, tierLabel: plan.membershipTier === 'unlimited' ? '畅享版' : '安心版', badgeLabel: plan.membershipTier === 'unlimited' ? '高频使用' : '适合持续记录', period: Number(plan.durationDays) >= 365 ? 'yearly' : 'monthly', periodLabel: Number(plan.durationDays) >= 365 ? '年度' : '月度',
    priceText: (Number(plan.price || 0) / 100).toFixed(2), benefitItems: buildPlanBenefits(plan),
  })).sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
}

function buildPlanCards(plans, period) {
  return ['paid', 'unlimited'].map((membershipTier) => {
    const current = plans.find((plan) => plan.membershipTier === membershipTier && plan.period === period)
    const monthly = plans.find((plan) => plan.membershipTier === membershipTier && plan.period === 'monthly')
    const yearly = plans.find((plan) => plan.membershipTier === membershipTier && plan.period === 'yearly')
    if (!current) return null
    return {
      ...current,
      monthlyPriceText: monthly ? monthly.priceText : '--',
      yearlyPriceText: yearly ? yearly.priceText : '--',
    }
  }).filter(Boolean)
}

function resolveSelectedPlanId(plans, currentPlanId, entitlement) {
  if (plans.some((plan) => plan.planId === currentPlanId)) return currentPlanId
  const preferredTier = isUnlimitedPlan(entitlement) ? 'unlimited' : 'paid'
  return (plans.find((plan) => plan.period === 'monthly' && plan.membershipTier === preferredTier) || plans[0] || {}).planId || ''
}

function buildPlanBenefits(plan) {
  const benefits = plan.benefits || {}
  const quickRecordLimit = benefits.quickRecordLimit === undefined && plan.membershipTier === 'unlimited' ? null : benefits.quickRecordLimit
  return [`${benefits.maxOwnedFamilies || 3} 个家庭`, `${benefits.maxMembers || 10} 位成员`, `${benefits.maxAttachments || 100} 个附件`, quickRecordLimit === null ? '快速记录不限次数' : `快速记录 ${quickRecordLimit || 30} 次/月`]
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
