const api = require('../../services/api')

Page({
  data: {
    loading: true,
    family: {},
    entitlement: {
      planName: '免费版',
      limits: {},
    },
    usage: {},
    plans: [],
    benefitRows: [],
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.getMembershipStatus()
      this.setData({
        loading: false,
        family: data.family,
        entitlement: data.entitlement,
        usage: data.usage,
        plans: data.plans,
        benefitRows: buildBenefitRows(data.entitlement.limits, data.usage),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  choosePlan(event) {
    const planId = event.currentTarget.dataset.id
    wx.showModal({
      title: '支付能力待接入',
      content: `已选择 ${planId}。当前版本先完成会员权益和订单设计，真实支付后续接入微信官方虚拟支付。`,
      showCancel: false,
    })
  },
})

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
