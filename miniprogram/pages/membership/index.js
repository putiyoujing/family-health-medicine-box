const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { EVENT_IDS, track, trackServiceError } = require('../../utils/analytics')

const MEMBERSHIP_DISPLAY_CACHE_KEY = 'membership-display-cache'
const DEFAULT_MEMBERSHIP_PURCHASE_GUIDE = '请输入已有会员兑换码完成权益激活。'

const DEFAULT_ENTITLEMENT = {
  plan: 'free',
  tier: 'free',
  planName: '基础版',
  limits: {
    maxOwnedFamilies: 1,
    maxMembers: 3,
    maxAttachments: 10,
    aiAssistantMonthly: 10,
    aiImageParseMonthly: 3,
    quickRecordLimit: 3,
    quickRecordPeriod: 'lifetime',
  },
}

const DEFAULT_FAMILY_POLICY = {
  ownedFamilyCount: 1,
  maxOwnedFamilies: 1,
}

Page({
  onShareAppMessage() {
    return require('../../utils/share').getDefaultShareConfig()
  },

  data: {
    loading: true,
    family: {},
    entitlement: DEFAULT_ENTITLEMENT,
    usage: {},
    familyPolicy: DEFAULT_FAMILY_POLICY,
    benefitRows: buildBenefitRows(DEFAULT_ENTITLEMENT.limits, {}, DEFAULT_FAMILY_POLICY),
    comparisonRows: buildComparisonRows(),
    isFreeMembership: true,
    membershipBadge: 'FREE',
    expireText: '',
    redeemCode: '',
    redeemExpanded: false,
    redeemInputFocused: false,
    redeeming: false,
    redeemResult: null,
    membershipPurchaseGuide: DEFAULT_MEMBERSHIP_PURCHASE_GUIDE,
  },

  onLoad(options) {
    this.shouldFocusRedeem = options.focus === 'redeem'
    this.restoreCachedMembershipGuide()
    this.hydrateCachedMembership()
  },

  hydrateCachedMembership() {
    if (typeof api.getCachedHome !== 'function') {
      return
    }
    const home = api.getCachedHome()
    const entitlement = home && home.entitlement
    if (!entitlement) {
      return
    }
    this.setData({
      family: home.family || this.data.family,
      entitlement,
      benefitRows: buildBenefitRows(entitlement.limits || {}, this.data.usage, this.data.familyPolicy),
      isFreeMembership: isFreePlan(entitlement),
      membershipBadge: getMembershipBadge(entitlement),
      expireText: formatExpireAt(entitlement.proExpireAt || entitlement.expireAt),
    })
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
    const guideRequest = this.loadMembershipGuide()
    const loggedIn = await ensureLoginReady({ silent: true })
    if (!loggedIn) {
      this.setData({ loading: false })
      return
    }
    let membership = {
      family: {},
      entitlement: this.data.entitlement,
      usage: {},
    }
    let membershipGuide = this.data.membershipPurchaseGuide
    let familyPolicy = this.data.familyPolicy

    const [membershipResult, guideResult] = await Promise.allSettled([
      api.getMembershipStatus(),
      guideRequest,
    ])
    if (membershipResult.status === 'fulfilled') {
      membership = membershipResult.value
    }
    if (guideResult.status === 'fulfilled') {
      membershipGuide = guideResult.value
    }
    if (membershipResult.status === 'fulfilled' && membership.familyPolicy) {
      familyPolicy = membership.familyPolicy
    }

    const entitlement = membership.entitlement || this.data.entitlement
    const usage = membership.usage || {}

    this.setData({
      loading: false,
      family: membership.family || {},
      entitlement,
      usage,
      familyPolicy,
      benefitRows: buildBenefitRows(entitlement.limits || {}, usage, familyPolicy),
      isFreeMembership: isFreePlan(entitlement),
      membershipBadge: getMembershipBadge(entitlement),
      expireText: formatExpireAt(entitlement.proExpireAt || entitlement.expireAt),
      membershipPurchaseGuide: membershipGuide,
    })
    if (this.shouldFocusRedeem) {
      this.shouldFocusRedeem = false
      this.focusRedeem()
    }
  },

  async loadMembershipGuide() {
    try {
      const planData = await api.getPlans()
      const membershipPurchaseGuide = String(planData.membershipPurchaseGuide || '').trim()
        || DEFAULT_MEMBERSHIP_PURCHASE_GUIDE
      this.setData({ membershipPurchaseGuide })
      wx.setStorageSync(MEMBERSHIP_DISPLAY_CACHE_KEY, {
        membershipPurchaseGuide,
      })
      return membershipPurchaseGuide
    } catch (error) {
      console.warn('membership guide config unavailable', error.message)
      return this.data.membershipPurchaseGuide || DEFAULT_MEMBERSHIP_PURCHASE_GUIDE
    }
  },

  restoreCachedMembershipGuide() {
    try {
      const cached = wx.getStorageSync(MEMBERSHIP_DISPLAY_CACHE_KEY)
      if (!cached || typeof cached !== 'object') {
        return
      }
      const membershipPurchaseGuide = String(cached.membershipPurchaseGuide || '').trim()
      if (membershipPurchaseGuide) {
        this.setData({ membershipPurchaseGuide })
      }
    } catch (error) {
      console.warn('membership guide cache unavailable', error.message)
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
    if (!this.data.family || !this.data.family._id) {
      wx.showToast({ title: '请先创建或加入家庭', icon: 'none' })
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
      const tier = result.entitlement && result.entitlement.tier
        || result.plan && result.plan.membershipTier
        || 'unknown'
      track(EVENT_IDS.MEMBERSHIP_REDEEM_RESULT, { status: 'success', tier })
      wx.showToast({ title: '会员已激活' })
      await this.load()
    } catch (error) {
      wx.hideLoading()
      this.setData({ redeeming: false })
      track(EVENT_IDS.MEMBERSHIP_REDEEM_RESULT, { status: 'fail', tier: 'unknown' })
      trackServiceError('membership_redeem')
      wx.showToast({ title: error.message || '兑换失败', icon: 'none' })
    }
  },

  focusRedeem() {
    this.setData({ redeemExpanded: true, redeemInputFocused: false })
    wx.pageScrollTo({ selector: '#redeem-section', duration: 300 })
    setTimeout(() => {
      this.setData({ redeemInputFocused: true })
    }, 320)
  },

  toggleRedeemPanel() {
    const redeemExpanded = !this.data.redeemExpanded
    this.setData({ redeemExpanded, redeemInputFocused: false })
    if (redeemExpanded) {
      wx.pageScrollTo({ selector: '#redeem-section', duration: 300 })
    }
  },

  onPurchaseTap() {
    wx.showModal({
      title: '会员套餐',
      content: '套餐购买流程将在官方虚拟支付页面完成后开放，当前可先使用活动兑换码激活会员。',
      showCancel: false,
    })
  },

})

function buildBenefitRows(limits, usage, familyPolicy) {
  return [
    {
      label: '创建家庭',
      used: familyPolicy.ownedFamilyCount || 0,
      limit: familyPolicy.maxOwnedFamilies || limits.maxOwnedFamilies || 1,
    },
    { label: '家庭成员', used: usage.members || 0, limit: limits.maxMembers || 3 },
    { label: '附件上传', used: usage.attachments || 0, limit: limits.maxAttachments || 10 },
    {
      label: '快速记录',
      used: usage.quickRecord ? usage.quickRecord.used : 0,
      limit: limits.quickRecordLimit === undefined ? 3 : limits.quickRecordLimit,
    },
  ].map((item) => ({
    ...item,
    progress: item.limit ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0,
    limitText: item.limit === null ? '不限' : item.limit,
  }))
}

function buildComparisonRows() {
  return [
    { label: '快速记录', values: ['3 次（累计）', '30 次/月', '不限次数'] },
    { label: '可创建家庭', values: ['1 个', '3 个', '3 个'] },
    { label: '家庭成员', values: ['3 位', '10 位', '10 位'] },
    { label: '附件上传', values: ['10 个', '100 个', '100 个'] },
  ]
}

function isFreePlan(entitlement = {}) {
  return entitlement.tier === 'free'
    || entitlement.plan === 'free'
    || /免费|基础/.test(String(entitlement.planName || ''))
}

function getMembershipBadge(entitlement = {}) {
  if (entitlement.tier === 'unlimited' || /无限|畅享/.test(String(entitlement.planName || ''))) {
    return 'UNLIMITED'
  }
  return isFreePlan(entitlement) ? 'FREE' : 'MEMBER'
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
