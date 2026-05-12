import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Brain,
  HeartPulse,
  Home,
  Lock,
  Pill,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  Users,
  WalletCards,
} from 'lucide-react'
import './App.css'

type ListType =
  | 'users'
  | 'families'
  | 'orders'
  | 'subscriptions'
  | 'coupons'
  | 'aiUsage'
  | 'medicines'
  | 'illness'
  | 'medication'
  | 'attachments'

interface AdminStats {
  users: number
  families: number
  members: number
  medicines: number
  illnessRecords: number
  medicationLogs: number
  attachments: number
  reminders: number
  orders: number
  paidOrders: number
  subscriptions: number
  activeSubscriptions: number
  coupons: number
  couponRedemptions: number
  aiUsageLogs: number
}

interface AdminRevenue {
  revenueAmount: number
  discountAmount: number
  averageOrderAmount: number
  yearlyOrders: number
  monthlyOrders: number
}

interface AdminMembership {
  paidOrders: number
  pendingOrders: number
  subscriptions: number
  activeSubscriptions: number
  conversionRate: number
  memberFamilyRate: number
}

interface AdminHealth {
  averageMembersPerFamily: number
  averageMedicinesPerFamily: number
  averageIllnessPerFamily: number
  averageMedicationPerIllness: number
  attachmentCoverageRate: number
}

interface AdminRisk {
  expiringMedicines: number
  lowStockMedicines: number
  missingProfileMembers: number
  pendingOcrAttachments: number
}

interface AdminAiUsage {
  total: number
  assistantQuery: number
  imageParse: number
}

interface TrendPoint {
  date: string
  count: number
}

interface AdminDashboardData {
  stats: AdminStats
  revenue: AdminRevenue
  membership: AdminMembership
  health: AdminHealth
  risk: AdminRisk
  trend: Record<string, TrendPoint[]>
  aiUsage: AdminAiUsage
  recentUsers: Record<string, unknown>[]
  recentIllness: Record<string, unknown>[]
  recentMedication: Record<string, unknown>[]
  recentOrders: Record<string, unknown>[]
  recentSubscriptions: Record<string, unknown>[]
  recentCoupons: Record<string, unknown>[]
  recentAiUsage: Record<string, unknown>[]
  expiringMedicines: Record<string, unknown>[]
  lowStockMedicines: Record<string, unknown>[]
  generatedAt: string
}

interface AdminListItem {
  id: string
  title: string
  subtitle: string
  tag: string
}

interface AdminListResponse {
  list: Record<string, unknown>[]
  skip: number
  limit: number
}

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || ''
const API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN || ''

const listTabs: Array<{ id: ListType; label: string }> = [
  { id: 'users', label: '用户' },
  { id: 'families', label: '家庭' },
  { id: 'orders', label: '订单' },
  { id: 'subscriptions', label: '会员家庭' },
  { id: 'coupons', label: '优惠券' },
  { id: 'aiUsage', label: 'AI 用量' },
  { id: 'medicines', label: '药品' },
  { id: 'illness', label: '健康记录' },
  { id: 'medication', label: '用药' },
  { id: 'attachments', label: '附件' },
]

function App() {
  const [dashboard, setDashboard] = useState<AdminDashboardData>(() => mockDashboard())
  const [activeList, setActiveList] = useState<ListType>('orders')
  const [list, setList] = useState<AdminListItem[]>(() => normalizeList('orders', mockDashboard().recentOrders))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isConfigured = Boolean(API_BASE && API_TOKEN)

  const trendCards = useMemo(() => buildTrendCards(dashboard.trend), [dashboard.trend])

  const refreshDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await callAdminApi<AdminDashboardData>('getDashboard')
      setDashboard(data)
      const listData = await callAdminApi<AdminListResponse>(listAction(activeList), { limit: 30 })
      setList(normalizeList(activeList, listData.list || []))
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理后台接口请求失败')
    } finally {
      setLoading(false)
    }
  }, [activeList])

  useEffect(() => {
    if (isConfigured) {
      const timer = window.setTimeout(() => {
        void refreshDashboard()
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [isConfigured, refreshDashboard])

  async function switchList(type: ListType) {
    setActiveList(type)
    if (!isConfigured) {
      setList(normalizeList(type, mockList(type)))
      return
    }
    setLoading(true)
    setError('')
    try {
      const listData = await callAdminApi<AdminListResponse>(listAction(type), { limit: 30 })
      setList(normalizeList(type, listData.list || []))
    } catch (err) {
      setError(err instanceof Error ? err.message : '列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          <div className="brand-icon">
            <HeartPulse size={26} />
          </div>
          <div>
            <p>产品管理后台</p>
            <h1>我的小药箱</h1>
          </div>
        </div>

        <nav>
          <a href="#overview">
            <Home size={18} />
            概览
          </a>
          <a href="#commerce">
            <WalletCards size={18} />
            运营中心
          </a>
          <a href="#risk">
            <AlertTriangle size={18} />
            风险
          </a>
          <a href="#trend">
            <BarChart3 size={18} />
            趋势
          </a>
          <a href="#data">
            <Boxes size={18} />
            数据
          </a>
        </nav>

        <div className="security-box">
          <ShieldCheck size={18} />
          <p>后台接口必须配置管理 token，不建议直接暴露云数据库权限。</p>
        </div>
      </aside>

      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">运营数据</p>
            <h2>用户增长、会员收入与家庭健康数据</h2>
          </div>
          <button className="refresh-btn" onClick={refreshDashboard} type="button">
            <RefreshCw size={16} />
            {loading ? '刷新中' : '刷新'}
          </button>
        </header>

        {!isConfigured && (
          <section className="config-warning">
            <Lock size={20} />
            <div>
              <strong>当前显示演示数据</strong>
              <p>
                配置 `VITE_ADMIN_API_BASE` 和 `VITE_ADMIN_API_TOKEN` 后，后台会读取真实
                `adminApi` 数据。
              </p>
            </div>
          </section>
        )}

        {error && <section className="error-box">{error}</section>}

        <section className="stat-grid" id="overview">
          <StatCard icon={Users} label="用户" value={dashboard.stats.users} />
          <StatCard icon={Home} label="家庭" value={dashboard.stats.families} />
          <StatCard icon={WalletCards} label="会员家庭" value={dashboard.stats.activeSubscriptions} />
          <StatCard icon={ReceiptText} label="付费订单" value={dashboard.stats.paidOrders} />
          <StatCard icon={Pill} label="药品" value={dashboard.stats.medicines} />
          <StatCard icon={HeartPulse} label="健康记录" value={dashboard.stats.illnessRecords} />
        </section>

        <section className="commerce-grid" id="commerce">
          <article className="commerce-card revenue-card">
            <div className="commerce-head">
              <WalletCards size={22} />
              <span>收入概览</span>
            </div>
            <strong>{formatMoney(dashboard.revenue.revenueAmount)}</strong>
            <p>
              已优惠 {formatMoney(dashboard.revenue.discountAmount)}，客单价{' '}
              {formatMoney(dashboard.revenue.averageOrderAmount)}
            </p>
          </article>
          <article className="commerce-card">
            <div className="commerce-head">
              <TicketPercent size={22} />
              <span>优惠券</span>
            </div>
            <strong>{dashboard.stats.couponRedemptions || 0}</strong>
            <p>已核销，当前券池 {dashboard.stats.coupons || 0} 张</p>
          </article>
          <article className="commerce-card">
            <div className="commerce-head">
              <Sparkles size={22} />
              <span>会员结构</span>
            </div>
            <strong>{dashboard.membership.memberFamilyRate || 0}</strong>
            <p>会员家庭率，待支付订单 {dashboard.membership.pendingOrders || 0}</p>
          </article>
          <article className="commerce-card">
            <div className="commerce-head">
              <Brain size={22} />
              <span>AI 用量</span>
            </div>
            <strong>{dashboard.aiUsage.total || 0}</strong>
            <p>问答 {dashboard.aiUsage.assistantQuery || 0}，图片解析 {dashboard.aiUsage.imageParse || 0}</p>
          </article>
        </section>

        <section className="panel-grid">
          <article className="panel" id="risk">
            <PanelTitle title="风险关注" subtitle="需要运营或产品跟进的数据" />
            <RiskRow label="快过期药品" value={dashboard.risk.expiringMedicines} tone="warn" />
            <RiskRow label="低库存药品" value={dashboard.risk.lowStockMedicines} tone="danger" />
            <RiskRow label="成员档案缺口" value={dashboard.risk.missingProfileMembers} tone="warn" />
            <RiskRow label="待 OCR 附件" value={dashboard.risk.pendingOcrAttachments} tone="warn" />
          </article>

          <article className="panel">
            <PanelTitle title="运营健康度" subtitle="判断产品是否被持续使用" />
            <HealthGrid health={dashboard.health} />
          </article>
        </section>

        <section className="panel" id="trend">
          <PanelTitle title="7 天趋势" subtitle="新增用户、订单、AI 用量和核心记录" />
          <div className="trend-grid">
            {trendCards.map((card) => (
              <article className="trend-card" key={card.label}>
                <div className="trend-head">
                  <strong>{card.label}</strong>
                  <span>{card.total}</span>
                </div>
                <div className="bars">
                  {card.points.map((point) => (
                    <div className="bar-item" key={`${card.label}-${point.date}`}>
                      <span style={{ height: `${Math.max(8, Math.min(96, point.count * 18))}px` }} />
                      <small>{point.date}</small>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" id="data">
          <PanelTitle title="数据列表" subtitle="查看订单、会员家庭、优惠券、用户和核心健康数据" />
          <div className="tabs">
            {listTabs.map((tab) => (
              <button
                className={activeList === tab.id ? 'active' : ''}
                key={tab.id}
                onClick={() => void switchList(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="table-list">
            {list.map((item) => (
              <article className="table-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.subtitle}</p>
                </div>
                <span>{item.tag}</span>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home
  label: string
  value: number
}) {
  return (
    <article className="stat-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value || 0}</strong>
    </article>
  )
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function RiskRow({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'warn' | 'danger'
  value: number
}) {
  return (
    <div className="risk-row">
      <span>{label}</span>
      <strong className={tone}>{value || 0}</strong>
    </div>
  )
}

function HealthGrid({ health }: { health: AdminHealth }) {
  const items = [
    ['户均成员', health.averageMembersPerFamily],
    ['户均药品', health.averageMedicinesPerFamily],
    ['户均健康记录', health.averageIllnessPerFamily],
    ['用药/健康记录', health.averageMedicationPerIllness],
    ['附件覆盖率', health.attachmentCoverageRate],
  ]
  return (
    <div className="health-grid">
      {items.map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value || 0}</strong>
        </article>
      ))}
    </div>
  )
}

async function callAdminApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_BASE, {
    body: JSON.stringify({
      action,
      adminToken: API_TOKEN,
      payload,
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': API_TOKEN,
    },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const json = await response.json()
  const result = json.result || json
  if (!result.ok) {
    throw new Error(result.message || '管理接口返回失败')
  }
  return result.data as T
}

function listAction(type: ListType) {
  return {
    aiUsage: 'listAiUsage',
    attachments: 'listAttachments',
    coupons: 'listCoupons',
    families: 'listFamilies',
    illness: 'listIllness',
    medication: 'listMedication',
    medicines: 'listMedicines',
    orders: 'listOrders',
    subscriptions: 'listSubscriptions',
    users: 'listUsers',
  }[type]
}

function normalizeList(type: ListType, list: Record<string, unknown>[]): AdminListItem[] {
  return list.map((item, index) => {
    const id = String(item._id || item.id || index)
    if (type === 'orders') {
      return {
        id,
        title: String(item.orderNo || '未命名订单'),
        subtitle: `${item.planName || item.planId || '套餐'} · 应付 ${formatMoney(item.payableAmount)} · ${formatValue(item.createdAt)}`,
        tag: String(item.status || 'pending'),
      }
    }
    if (type === 'subscriptions') {
      return {
        id,
        title: String(item.planName || item.planId || '会员订阅'),
        subtitle: `家庭 ${item.familyId || '-'} · 到期 ${formatValue(item.expireAt)}`,
        tag: String(item.status || 'active'),
      }
    }
    if (type === 'coupons') {
      return {
        id,
        title: String(item.name || item.code || '优惠券'),
        subtitle: `${item.code || '-'} · 已用 ${item.usedQuantity || 0}/${item.totalQuantity || '不限'}`,
        tag: String(item.status || 'active'),
      }
    }
    if (type === 'aiUsage') {
      return {
        id,
        title: String(item.usageType || 'AI 用量'),
        subtitle: `家庭 ${item.familyId || '-'} · ${formatValue(item.createdAt)}`,
        tag: String(item.count || 1),
      }
    }
    if (type === 'users') {
      return {
        id,
        title: String(item.nickname || item.openid || '未命名用户'),
        subtitle: `创建：${formatValue(item.createdAt)}`,
        tag: '用户',
      }
    }
    if (type === 'families') {
      return {
        id,
        title: String(item.name || '未命名家庭'),
        subtitle: `创建：${formatValue(item.createdAt)}`,
        tag: String(item.plan || 'free'),
      }
    }
    if (type === 'medicines') {
      return {
        id,
        title: String(item.name || '未命名药品'),
        subtitle: `${item.category || '未分类'} · 剩余 ${item.remainingQuantity || 0}${item.unit || ''}`,
        tag: String(item.expireDate || '有效期未填'),
      }
    }
    if (type === 'illness') {
      const symptoms = Array.isArray(item.symptoms) ? item.symptoms.join('、') : ''
      return {
        id,
        title: String(symptoms || item.summary || '健康记录'),
        subtitle: `${item.status || '未填状态'} · ${formatValue(item.startedAt)}`,
        tag: item.temperatureMax ? `${item.temperatureMax}℃` : '健康',
      }
    }
    if (type === 'medication') {
      return {
        id,
        title: String(item.medicineNameSnapshot || '用药记录'),
        subtitle: `${formatValue(item.takenAt)} · ${item.doseQuantity || 0}${item.doseUnit || ''}`,
        tag: '用药',
      }
    }
    return {
      id,
      title: String(item.fileType || item.relatedType || '附件'),
      subtitle: String(item.aiSummary || item.ocrText || '暂无 OCR'),
      tag: String(item.relatedType || 'file'),
    }
  })
}

function buildTrendCards(trend: Record<string, TrendPoint[]>) {
  const config = [
    ['新增用户', 'users'],
    ['新增订单', 'orders'],
    ['付费订单', 'paidOrders'],
    ['AI 用量', 'aiUsage'],
    ['新增健康记录', 'illnessRecords'],
    ['新增用药记录', 'medicationLogs'],
  ] as const
  return config.map(([label, key]) => {
    const points = trend[key] || []
    return {
      label,
      points,
      total: points.reduce((sum, point) => sum + Number(point.count || 0), 0),
    }
  })
}

function formatValue(value: unknown) {
  if (!value) return '未记录'
  if (typeof value === 'string') return value.slice(0, 16).replace('T', ' ')
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace('T', ' ')
  return '已记录'
}

function formatMoney(value: unknown) {
  return `¥${(Number(value || 0) / 100).toFixed(2).replace(/\.00$/, '')}`
}

function mockDashboard(): AdminDashboardData {
  return {
    aiUsage: {
      assistantQuery: 42,
      imageParse: 9,
      total: 51,
    },
    expiringMedicines: [],
    generatedAt: new Date().toISOString(),
    health: {
      attachmentCoverageRate: 0.42,
      averageIllnessPerFamily: 2.8,
      averageMedicationPerIllness: 1.6,
      averageMedicinesPerFamily: 8.3,
      averageMembersPerFamily: 3.1,
    },
    lowStockMedicines: [],
    membership: {
      activeSubscriptions: 11,
      conversionRate: 0.18,
      memberFamilyRate: 0.35,
      paidOrders: 15,
      pendingOrders: 4,
      subscriptions: 16,
    },
    recentAiUsage: [
      { _id: 'ai1', count: 1, createdAt: '2026-05-12T09:18:00.000Z', familyId: 'f1', usageType: 'assistant_query' },
    ],
    recentCoupons: [
      { _id: 'c1', code: 'NEWUSER20', name: '新用户年费立减', status: 'active', totalQuantity: 500, usedQuantity: 21 },
    ],
    recentIllness: [
      { _id: 'h1', status: '观察中', summary: '儿童发热观察记录', temperatureMax: 38.5 },
      { _id: 'h2', status: '已恢复', summary: '鼻塞咳嗽恢复记录' },
    ],
    recentMedication: [
      { _id: 'm1', medicineNameSnapshot: '对乙酰氨基酚混悬液', doseQuantity: 5, doseUnit: 'ml' },
    ],
    recentOrders: [
      { _id: 'o1', createdAt: '2026-05-12T08:30:00.000Z', orderNo: 'FH20260512A1', payableAmount: 7900, planName: '年度会员', status: 'paid' },
      { _id: 'o2', createdAt: '2026-05-12T10:10:00.000Z', orderNo: 'FH20260512B2', payableAmount: 990, planName: '月度会员', status: 'pending' },
    ],
    recentSubscriptions: [
      { _id: 's1', expireAt: '2027-05-12T08:30:00.000Z', familyId: 'f1', planName: '年度会员', status: 'active' },
    ],
    recentUsers: [
      { _id: 'u1', nickname: '测试用户 A', createdAt: '2026-05-12T08:00:00.000Z' },
      { _id: 'u2', nickname: '测试用户 B', createdAt: '2026-05-11T21:00:00.000Z' },
    ],
    revenue: {
      averageOrderAmount: 5280,
      discountAmount: 2000,
      monthlyOrders: 5,
      revenueAmount: 79200,
      yearlyOrders: 10,
    },
    risk: {
      expiringMedicines: 4,
      lowStockMedicines: 2,
      missingProfileMembers: 3,
      pendingOcrAttachments: 5,
    },
    stats: {
      activeSubscriptions: 11,
      aiUsageLogs: 51,
      attachments: 18,
      couponRedemptions: 21,
      coupons: 3,
      families: 31,
      illnessRecords: 86,
      medicationLogs: 132,
      medicines: 257,
      members: 96,
      orders: 19,
      paidOrders: 15,
      reminders: 12,
      subscriptions: 16,
      users: 48,
    },
    trend: {
      aiUsage: mockTrend([4, 8, 6, 7, 12, 9, 11]),
      illnessRecords: mockTrend([2, 5, 4, 7, 8, 6, 9]),
      medicationLogs: mockTrend([3, 8, 6, 9, 11, 10, 14]),
      medicines: mockTrend([5, 2, 6, 8, 4, 7, 9]),
      orders: mockTrend([0, 1, 2, 1, 4, 3, 5]),
      paidOrders: mockTrend([0, 1, 1, 1, 3, 2, 4]),
      users: mockTrend([1, 3, 2, 5, 6, 4, 7]),
    },
  }
}

function mockList(type: ListType) {
  const data = mockDashboard()
  if (type === 'users') return data.recentUsers
  if (type === 'orders') return data.recentOrders
  if (type === 'subscriptions') return data.recentSubscriptions
  if (type === 'coupons') return data.recentCoupons
  if (type === 'aiUsage') return data.recentAiUsage
  if (type === 'illness') return data.recentIllness
  if (type === 'medication') return data.recentMedication
  if (type === 'medicines') {
    return [
      { _id: 'med1', category: '退烧', expireDate: '2026-08-20', name: '对乙酰氨基酚混悬液', remainingQuantity: 62, unit: 'ml' },
      { _id: 'med2', category: '鼻炎', expireDate: '2026-06-18', name: '生理盐水鼻喷', remainingQuantity: 18, unit: 'ml' },
    ]
  }
  if (type === 'families') return [{ _id: 'f1', createdAt: '2026-05-12', name: '测试家庭', plan: 'pro' }]
  return [{ _id: 'a1', aiSummary: 'OCR 待处理', fileType: 'image', relatedType: 'health' }]
}

function mockTrend(values: number[]): TrendPoint[] {
  return values.map((count, index) => ({
    count,
    date: `05-${String(6 + index).padStart(2, '0')}`,
  }))
}

export default App
