const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const PLAN_DISPLAY_ORDER = { monthly_pro: 0, yearly_pro: 1 }

const DEFAULT_PLANS = [
  {
    planId: 'yearly_pro',
    name: '年度会员',
    price: 9900,
    durationDays: 365,
    badge: '推荐',
    sort: 0,
  },
  {
    planId: 'monthly_pro',
    name: '月度会员',
    price: 990,
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
  },
]

const DEFAULT_ENTITLEMENT = {
  planName: '免费版',
  limits: {
    maxOwnedFamilies: 1,
    maxMembers: 3,
    maxSharedUsers: 2,
    maxAttachments: 10,
    aiAssistantMonthly: 10,
    aiImageParseMonthly: 3,
  },
}

const DEFAULT_FAMILY_POLICY = {
  ownedFamilyCount: 1,
  maxOwnedFamilies: 1,
}

Page({
  data: {
    loading: true,
    family: {},
    entitlement: DEFAULT_ENTITLEMENT,
    usage: {},
    familyPolicy: DEFAULT_FAMILY_POLICY,
    plans: [],
    benefitRows: buildBenefitRows(DEFAULT_ENTITLEMENT.limits, {}, DEFAULT_FAMILY_POLICY),
    comparisonRows: buildComparisonRows(),
    isFreeMembership: true,
    expireText: '',
    redeemCode: '',
    redeemInputFocused: false,
    redeeming: false,
    redeemResult: null,
  },

  onLoad(options) {
    this.shouldFocusRedeem = options.focus === 'redeem'
  },

  onShow() {
    const app = getApp()
    if (app.globalData && app.globalData.focusMembershipRedeem) {
      app.globalData.focusMembershipRedeem = false
      this.shouldFocusRedeem = true
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      this.setData({ loading: false })
      return
    }
    let membership = {
      family: {},
      entitlement: this.data.entitlement,
      usage: {},
      plans: [],
    }
    let planData = { plans: [] }
    let familyPolicy = this.data.familyPolicy

    try {
      membership = await api.getMembershipStatus()
    } catch (error) {
      membership = {
        family: {},
        entitlement: this.data.entitlement,
        usage: {},
        plans: [],
      }
    }

    try {
      planData = await api.getPlans()
    } catch (error) {
      planData = { plans: [] }
    }

    try {
      familyPolicy = await api.listMyFamilies()
    } catch (error) {
      familyPolicy = this.data.familyPolicy
    }

    const planSource = pickPlans(planData.plans, membership.plans)
    const plans = decoratePlans(planSource)
    const entitlement = membership.entitlement || this.data.entitlement
    const usage = membership.usage || {}

    this.setData({
      loading: false,
      family: membership.family || {},
      entitlement,
      usage,
      familyPolicy,
      plans,
      benefitRows: buildBenefitRows(entitlement.limits || {}, usage, familyPolicy),
      isFreeMembership: isFreePlan(entitlement),
      expireText: formatExpireAt(entitlement.proExpireAt || entitlement.expireAt),
    })
    if (this.shouldFocusRedeem) {
      this.shouldFocusRedeem = false
      this.focusRedeem()
    }
  },

  onRedeemInput(event) {
    this.setData({
      redeemCode: String(event.detail.value || '').trim().toUpperCase(),
    })
  },

  async redeemMembershipCode() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    if (!this.data.redeemCode) {
      wx.showToast({ title: '请输入会员兑换码', icon: 'none' })
      return
    }
    this.setData({ redeeming: true, redeemResult: null })
    wx.showLoading({ title: '兑换中' })
    try {
      const result = await api.redeemMembershipCode({
        code: this.data.redeemCode,
      })
      wx.hideLoading()
      this.setData({
        redeeming: false,
        redeemCode: '',
        redeemResult: result,
      })
      wx.showToast({ title: '会员已激活' })
      await this.load()
    } catch (error) {
      wx.hideLoading()
      this.setData({ redeeming: false })
      wx.showToast({ title: error.message || '兑换失败', icon: 'none' })
    }
  },

  focusRedeem() {
    this.setData({ redeemInputFocused: false })
    wx.pageScrollTo({ selector: '#redeem-section', duration: 300 })
    setTimeout(() => {
      this.setData({ redeemInputFocused: true })
    }, 320)
  },

})

function pickPlans(primaryPlans, fallbackPlans) {
  const plans = [primaryPlans, fallbackPlans].find((items) => Array.isArray(items) && items.length)
  return plans && plans.length ? plans : DEFAULT_PLANS
}

function decoratePlans(plans) {
  return (plans || [])
    .slice()
    .sort((a, b) => (
      (PLAN_DISPLAY_ORDER[a.planId] ?? 10 + Number(a.sort || 0))
      - (PLAN_DISPLAY_ORDER[b.planId] ?? 10 + Number(b.sort || 0))
    ))
    .map((plan) => ({
      ...plan,
      priceText: formatMoney(plan.price),
      audienceText: buildPlanAudienceText(plan),
    }))
}

function buildPlanAudienceText(plan) {
  const durationDays = Number(plan.durationDays || 0)
  if (plan.planId === 'monthly_pro' || (durationDays > 0 && durationDays <= 31)) {
    return '适合初次体验会员服务的家庭'
  }
  if (plan.planId === 'yearly_pro' || durationDays >= 365) {
    return '适合长期管理家人健康的家庭'
  }
  return '适合需要持续管理家人健康的家庭'
}

function buildBenefitRows(limits, usage, familyPolicy) {
  return [
    {
      label: '创建家庭',
      used: familyPolicy.ownedFamilyCount || 0,
      limit: familyPolicy.maxOwnedFamilies || limits.maxOwnedFamilies || 1,
    },
    { label: '家庭成员', used: usage.members || 0, limit: limits.maxMembers || 3 },
    { label: '额外关联账号', used: usage.sharedUsers || 0, limit: limits.maxSharedUsers || 2 },
    { label: '附件上传', used: usage.attachments || 0, limit: limits.maxAttachments || 10 },
    { label: '记录查询', used: usage.aiAssistantMonthly || 0, limit: limits.aiAssistantMonthly || 10 },
    { label: 'AI 图片解析', used: usage.aiImageParseMonthly || 0, limit: limits.aiImageParseMonthly || 0 },
  ].map((item) => ({
    ...item,
    progress: item.limit ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0,
  }))
}

function buildComparisonRows() {
  return [
    { label: '可创建家庭', free: '1 个', pro: '3 个' },
    { label: '家庭成员', free: '3 位', pro: '10 位' },
    { label: '成员账号关联', free: '3 位成员均可管理或编辑', pro: '除创建者外 6 位多角色' },
    { label: '附件上传', free: '10 个', pro: '100 个' },
    { label: '记录查询', free: '10 次/月', pro: '300 次/月' },
  ]
}

function isFreePlan(entitlement = {}) {
  return entitlement.plan === 'free' || String(entitlement.planName || '').includes('免费')
}

function formatExpireAt(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10)
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
}
