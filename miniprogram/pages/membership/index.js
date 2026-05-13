const api = require('../../services/api')

const DEFAULT_PLANS = [
  {
    planId: 'yearly_pro',
    name: '年度会员',
    price: 9900,
    durationDays: 365,
    badge: '推荐',
    sort: 0,
    benefitsText: '10 位家庭成员、6 位共享成员、长期健康记录、AI 问答与数据导出',
  },
  {
    planId: 'monthly_pro',
    name: '月度会员',
    price: 990,
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
    benefitsText: '适合先体验完整家庭共享、用药记录和药箱管理能力',
  },
]

const DEFAULT_ENTITLEMENT = {
  planName: '免费版',
  limits: {
    maxMembers: 3,
    maxSharedUsers: 1,
    maxMedicines: 50,
    maxHealthRecords: 200,
    maxMedicationLogs: 500,
    maxAttachments: 20,
    aiAssistantMonthly: 20,
    aiImageParseMonthly: 0,
  },
}

Page({
  data: {
    loading: true,
    paying: false,
    family: {},
    entitlement: DEFAULT_ENTITLEMENT,
    usage: {},
    plans: [],
    coupons: [],
    benefitRows: [],
    selectedPlanId: 'yearly_pro',
    couponCode: '',
    preview: null,
    latestOrder: null,
  },

  onShow() {
    const app = getApp()
    if (app.globalData && app.globalData.selectedCouponCode) {
      this.setData({ couponCode: app.globalData.selectedCouponCode })
      app.globalData.selectedCouponCode = ''
      this.refreshPreview()
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    let membership = {
      family: {},
      entitlement: this.data.entitlement,
      usage: {},
      plans: [],
    }
    let planData = { plans: [] }

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

    const planSource = pickPlans(planData.plans, membership.plans)
    const selectedPlanId = planSource.some((plan) => plan.planId === this.data.selectedPlanId)
      ? this.data.selectedPlanId
      : planSource[0].planId
    const plans = decoratePlans(planSource, selectedPlanId)
    const entitlement = membership.entitlement || this.data.entitlement
    const usage = membership.usage || {}

    this.setData({
      loading: false,
      family: membership.family || {},
      entitlement,
      usage,
      plans,
      selectedPlanId,
      benefitRows: buildBenefitRows(entitlement.limits || {}, usage),
    })
    await this.loadCoupons()
    await this.refreshPreview()
  },

  async loadCoupons() {
    try {
      const data = await api.listCouponsForUser({
        planId: this.data.selectedPlanId,
      })
      this.setData({
        coupons: data.coupons || [],
      })
    } catch (error) {
      this.setData({ coupons: [] })
    }
  },

  async choosePlan(event) {
    const planId = event.currentTarget.dataset.id
    this.setData({
      selectedPlanId: planId,
      plans: decoratePlans(this.data.plans, planId),
      preview: null,
    })
    await this.loadCoupons()
    await this.refreshPreview()
  },

  onCouponInput(event) {
    this.setData({
      couponCode: String(event.detail.value || '').trim().toUpperCase(),
    })
  },

  chooseCoupon(event) {
    const code = event.currentTarget.dataset.code
    this.setData({ couponCode: code || '' })
    this.refreshPreview()
  },

  async applyCoupon() {
    if (!this.data.couponCode) {
      wx.showToast({ title: '请输入优惠码', icon: 'none' })
      return
    }
    await this.refreshPreview(true)
  },

  async clearCoupon() {
    this.setData({ couponCode: '' })
    await this.refreshPreview()
  },

  async refreshPreview(showToast = false) {
    if (!this.data.selectedPlanId) {
      return
    }
    const selectedPlan = this.data.plans.find((plan) => plan.planId === this.data.selectedPlanId)
    try {
      const preview = await api.previewOrder({
        planId: this.data.selectedPlanId,
        couponCode: this.data.couponCode,
      })
      this.setData({ preview })
      if (showToast) {
        wx.showToast({ title: preview.discountAmount ? '优惠已生效' : '已更新价格' })
      }
    } catch (error) {
      if (showToast) {
        wx.showToast({ title: error.message || '优惠不可用', icon: 'none' })
      }
      if (this.data.couponCode) {
        this.setData({ preview: null })
      } else if (selectedPlan) {
        this.setData({ preview: buildLocalPreview(selectedPlan) })
      }
    }
  },

  async createOrder() {
    if (!this.data.selectedPlanId) {
      wx.showToast({ title: '请选择套餐', icon: 'none' })
      return
    }
    this.setData({ paying: true })
    wx.showLoading({ title: '生成订单' })
    try {
      const order = await api.createOrder({
        planId: this.data.selectedPlanId,
        couponCode: this.data.couponCode,
      })
      wx.hideLoading()
      this.setData({
        paying: false,
        latestOrder: order,
        preview: order,
      })
      wx.navigateTo({
        url: `/pages/payment/checkout?orderId=${order.orderId}&orderNo=${order.orderNo}&amount=${order.payableAmount}`,
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ paying: false })
      wx.showToast({ title: error.message || '下单失败', icon: 'none' })
    }
  },

  openCoupons() {
    wx.navigateTo({
      url: `/pages/coupon/index?planId=${this.data.selectedPlanId}&code=${this.data.couponCode || ''}`,
    })
  },

})

function pickPlans(primaryPlans, fallbackPlans) {
  const plans = [primaryPlans, fallbackPlans].find((items) => Array.isArray(items) && items.length)
  return plans && plans.length ? plans : DEFAULT_PLANS
}

function decoratePlans(plans, selectedPlanId) {
  return (plans || [])
    .slice()
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map((plan) => ({
      ...plan,
      active: plan.planId === selectedPlanId,
      priceText: formatMoney(plan.price),
      benefitsText: plan.benefitsText || buildPlanBenefitsText(plan),
    }))
}

function buildPlanBenefitsText(plan) {
  if (plan.benefitsText) {
    return plan.benefitsText
  }
  if (plan.durationDays >= 365) {
    return '适合长期记录家庭健康、药箱信息、用药记录和共享协作'
  }
  return '适合先体验会员权益与家庭共享能力'
}

function buildBenefitRows(limits, usage) {
  return [
    { label: '家庭成员', used: usage.members || 0, limit: limits.maxMembers || 3 },
    { label: '共享成员', used: usage.sharedUsers || 0, limit: limits.maxSharedUsers || 1 },
    { label: '药品数量', used: usage.medicines || 0, limit: limits.maxMedicines || 50 },
    { label: '健康记录', used: usage.healthRecords || 0, limit: limits.maxHealthRecords || 200 },
    { label: '用药记录', used: usage.medicationLogs || 0, limit: limits.maxMedicationLogs || 500 },
    { label: '附件上传', used: usage.attachments || 0, limit: limits.maxAttachments || 20 },
    { label: 'AI 问答', used: usage.aiAssistantMonthly || 0, limit: limits.aiAssistantMonthly || 20 },
    { label: 'AI 图片解析', used: usage.aiImageParseMonthly || 0, limit: limits.aiImageParseMonthly || 0 },
  ]
}

function buildLocalPreview(plan) {
  return {
    originalAmount: plan.price || 0,
    discountAmount: 0,
    payableAmount: plan.price || 0,
  }
}

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
}
