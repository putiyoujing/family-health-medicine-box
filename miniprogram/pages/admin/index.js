const adminApi = require('../../services/admin')
const { formatDateTime } = require('../../utils/format')

Page({
  data: {
    loading: true,
    hasPermission: true,
    stats: {},
    health: {},
    risk: {},
    revenue: {},
    membership: {},
    aiUsage: {},
    trend: {},
    trendCards: [],
    generatedAt: '',
    recentUsers: [],
    recentIllness: [],
    recentMedication: [],
    expiringMedicines: [],
    lowStockMedicines: [],
    activeList: 'users',
    listTitle: '用户列表',
    list: [],
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true, hasPermission: true })
    try {
      const data = await adminApi.getDashboard()
      this.setData({
        loading: false,
        stats: data.stats,
        health: data.health,
        risk: data.risk,
        revenue: {
          ...data.revenue,
          revenueText: formatMoney(data.revenue && data.revenue.revenueAmount),
          discountText: formatMoney(data.revenue && data.revenue.discountAmount),
          averageOrderText: formatMoney(data.revenue && data.revenue.averageOrderAmount),
        },
        membership: data.membership || {},
        aiUsage: data.aiUsage || {},
        trend: data.trend,
        trendCards: this.buildTrendCards(data.trend),
        generatedAt: formatDateTime(data.generatedAt),
        recentUsers: this.decorateUsers(data.recentUsers),
        recentIllness: this.decorateRecords(data.recentIllness),
        recentMedication: this.decorateRecords(data.recentMedication),
        expiringMedicines: data.expiringMedicines || [],
        lowStockMedicines: data.lowStockMedicines || [],
        missingProfileMembers: data.missingProfileMembers || [],
        pendingOcrAttachments: data.pendingOcrAttachments || [],
      })
      this.loadList('users')
    } catch (error) {
      this.setData({
        loading: false,
        hasPermission: false,
      })
      wx.showToast({
        title: error.message || '无管理权限',
        icon: 'none',
      })
    }
  },

  buildTrendCards(trend) {
    const config = [
      ['新增用户', 'users'],
      ['新增订单', 'orders'],
      ['付费订单', 'paidOrders'],
      ['AI 用量', 'aiUsage'],
      ['新增药品', 'medicines'],
      ['新增健康记录', 'illnessRecords'],
      ['新增用药记录', 'medicationLogs'],
    ]
    return config.map(([label, key]) => {
      const list = (trend && trend[key]) || []
      const total = list.reduce((sum, item) => sum + Number(item.count || 0), 0)
      const bars = list.map((item) => ({
        ...item,
        height: Math.max(8, Math.min(72, Number(item.count || 0) * 16)),
      }))
      return {
        label,
        total,
        bars,
      }
    })
  },

  decorateUsers(list) {
    return (list || []).map((item) => ({
      ...item,
      timeText: formatDateTime(item.createdAt),
      title: item.nickname || item.openid || '未命名用户',
      subtitle: `最近登录：${formatDateTime(item.lastLoginAt)}`,
    }))
  },

  decorateRecords(list) {
    return (list || []).map((item) => ({
      ...item,
      timeText: formatDateTime(item.createdAt || item.startedAt || item.takenAt),
    }))
  },

  async switchList(event) {
    const type = event.currentTarget.dataset.type
    await this.loadList(type)
  },

  async loadList(type) {
    const config = {
      users: ['用户列表', adminApi.listUsers],
      families: ['家庭列表', adminApi.listFamilies],
      orders: ['订单列表', adminApi.listOrders],
      subscriptions: ['会员家庭', adminApi.listSubscriptions],
      coupons: ['优惠券列表', adminApi.listCoupons],
      aiUsage: ['AI 用量', adminApi.listAiUsage],
      medicines: ['药品列表', adminApi.listMedicines],
      illness: ['健康记录', adminApi.listIllness],
      medication: ['用药记录', adminApi.listMedication],
      attachments: ['附件列表', adminApi.listAttachments],
    }[type]

    if (!config) {
      return
    }

    try {
      const result = await config[1]({ limit: 30 })
      this.setData({
        activeList: type,
        listTitle: config[0],
        list: this.normalizeList(type, result.list || []),
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载列表失败', icon: 'none' })
    }
  },

  normalizeList(type, list) {
    return list.map((item) => {
      if (type === 'users') {
        return {
          id: item._id,
          title: item.nickname || item.openid || '未命名用户',
          subtitle: `创建：${formatDateTime(item.createdAt)}`,
          tag: item.openid ? 'openid' : 'user',
        }
      }
      if (type === 'families') {
        return {
          id: item._id,
          title: item.name || '未命名家庭',
          subtitle: `创建：${formatDateTime(item.createdAt)}`,
          tag: item.plan || (item.ownerOpenid ? 'owner' : 'family'),
        }
      }
      if (type === 'orders') {
        return {
          id: item._id,
          title: item.orderNo || '未命名订单',
          subtitle: `${item.planName || item.planId || '套餐'} · 应付 ${formatMoney(item.payableAmount)} · ${formatDateTime(item.createdAt)}`,
          tag: item.status || 'pending',
        }
      }
      if (type === 'subscriptions') {
        return {
          id: item._id,
          title: item.planName || item.planId || '会员订阅',
          subtitle: `家庭：${item.familyId || '-'} · 到期：${formatDateTime(item.expireAt)}`,
          tag: item.status || 'active',
        }
      }
      if (type === 'coupons') {
        return {
          id: item._id,
          title: item.name || item.code || '优惠券',
          subtitle: `${item.code || '-'} · 已用 ${item.usedQuantity || 0}/${item.totalQuantity || '不限'}`,
          tag: item.status || 'active',
        }
      }
      if (type === 'aiUsage') {
        return {
          id: item._id,
          title: item.usageType || 'AI 用量',
          subtitle: `家庭：${item.familyId || '-'} · ${formatDateTime(item.createdAt)}`,
          tag: item.count || 1,
        }
      }
      if (type === 'medicines') {
        return {
          id: item._id,
          title: item.name || '未命名药品',
          subtitle: `${item.category || '未分类'} · 剩余 ${item.remainingQuantity || 0}${item.unit || ''}`,
          tag: item.expireDate || '未填有效期',
        }
      }
      if (type === 'illness') {
        return {
          id: item._id,
          title: (item.symptoms || []).join('、') || item.summary || '健康记录',
          subtitle: `${item.status || '未填状态'} · ${formatDateTime(item.startedAt)}`,
          tag: item.temperatureMax ? `${item.temperatureMax}℃` : '体温未填',
        }
      }
      if (type === 'medication') {
        return {
          id: item._id,
          title: item.medicineNameSnapshot || '用药记录',
          subtitle: `${formatDateTime(item.takenAt)} · ${item.doseQuantity || 0}${item.doseUnit || ''}`,
          tag: '用药',
        }
      }
      return {
        id: item._id,
        title: item.fileType || item.relatedType || '附件',
        subtitle: item.aiSummary || item.ocrText || '暂无 OCR',
        tag: item.relatedType || 'file',
      }
    })
  },
})

function formatMoney(amount) {
  return `¥${(Number(amount || 0) / 100).toFixed(2).replace(/\.00$/, '')}`
}
