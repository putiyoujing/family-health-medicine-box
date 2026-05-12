const api = require('../../services/api')

Page({
  data: {
    loading: true,
    paying: false,
    family: {},
    entitlement: {
      planName: '免费版',
      limits: {},
    },
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
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const [membership, planData] = await Promise.all([
        api.getMembershipStatus(),
        api.getPlans(),
      ])
      const plans = decoratePlans(planData.plans || membership.plans || [], this.data.selectedPlanId)
      const selectedPlanId = plans[0] ? plans[0].planId : this.data.selectedPlanId
      this.setData({
        loading: false,
        family: membership.family,
        entitlement: membership.entitlement,
        usage: membership.usage,
        plans: decoratePlans(plans, selectedPlanId),
        selectedPlanId,
        benefitRows: buildBenefitRows(membership.entitlement.limits, membership.usage),
      })
      await this.loadCoupons()
      await this.refreshPreview()
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
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
      this.confirmMockPay(order)
    } catch (error) {
      wx.hideLoading()
      this.setData({ paying: false })
      wx.showToast({ title: error.message || '下单失败', icon: 'none' })
    }
  },

  confirmMockPay(order) {
    wx.showModal({
      title: '确认支付',
      content: `订单 ${order.orderNo}，应付 ¥${formatMoney(order.payableAmount)}。当前版本使用模拟支付完成会员开通。`,
      confirmText: '模拟支付',
      success: (res) => {
        if (res.confirm) {
          this.mockPay(order.orderId)
        }
      },
    })
  },

  async mockPay(orderId) {
    this.setData({ paying: true })
    wx.showLoading({ title: '支付中' })
    try {
      await api.mockPaymentSuccess({ orderId })
      wx.hideLoading()
      wx.showToast({ title: '会员已开通' })
      this.setData({
        paying: false,
        couponCode: '',
        latestOrder: null,
      })
      await this.load()
    } catch (error) {
      wx.hideLoading()
      this.setData({ paying: false })
      wx.showToast({ title: error.message || '支付失败', icon: 'none' })
    }
  },
})

function decoratePlans(plans, selectedPlanId) {
  return (plans || [])
    .slice()
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map((plan) => ({
      ...plan,
      active: plan.planId === selectedPlanId,
      priceText: formatMoney(plan.price),
    }))
}

function buildBenefitRows(limits, usage) {
  return [
    { label: '家庭成员', used: usage.members, limit: limits.maxMembers },
    { label: '共享成员', used: usage.sharedUsers, limit: limits.maxSharedUsers },
    { label: '药品数量', used: usage.medicines, limit: limits.maxMedicines },
    { label: '健康记录', used: usage.healthRecords, limit: limits.maxHealthRecords },
    { label: '用药记录', used: usage.medicationLogs, limit: limits.maxMedicationLogs },
    { label: '附件上传', used: usage.attachments, limit: limits.maxAttachments },
    { label: 'AI 问答', used: usage.aiAssistantMonthly, limit: limits.aiAssistantMonthly },
    { label: 'AI 图片解析', used: usage.aiImageParseMonthly, limit: limits.aiImageParseMonthly },
  ]
}

function formatMoney(amount) {
  return (Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')
}
