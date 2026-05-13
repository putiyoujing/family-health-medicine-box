import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Database,
  HeartPulse,
  Home,
  Lock,
  Paperclip,
  Pill,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Syringe,
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

type PageId = 'overview' | 'commerce' | 'risk' | 'trend' | 'dataOverview' | ListType

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

interface AdminListResponse {
  list: Record<string, unknown>[]
  skip: number
  limit: number
  total: number
  hasMore: boolean
}

interface DataOverviewRow {
  id: ListType
  name: string
  collection: string
  statKey: keyof AdminStats
  total: number
}

interface DataOverviewResponse {
  tables: DataOverviewRow[]
  generatedAt: string
}

interface TableColumn {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => string
}

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || ''
const API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN || ''

const dataTables: Array<{
  id: ListType
  label: string
  icon: typeof Home
  description: string
  statKey: keyof AdminStats
}> = [
  { id: 'users', label: '用户表', icon: Users, description: '注册用户、最近登录和当前家庭', statKey: 'users' },
  { id: 'families', label: '家庭表', icon: Home, description: '家庭空间、会员状态和创建者', statKey: 'families' },
  { id: 'orders', label: '订单表', icon: ReceiptText, description: '订单金额、套餐、优惠和支付状态', statKey: 'orders' },
  { id: 'subscriptions', label: '会员家庭表', icon: WalletCards, description: '订阅状态、到期时间和所属家庭', statKey: 'subscriptions' },
  { id: 'coupons', label: '优惠券表', icon: TicketPercent, description: '券码、使用量、有效期和状态', statKey: 'coupons' },
  { id: 'aiUsage', label: 'AI 用量表', icon: Brain, description: '问答、图片解析和家庭维度额度消耗', statKey: 'aiUsageLogs' },
  { id: 'medicines', label: '药箱记录表', icon: Pill, description: '家庭药箱药品、分类、位置和有效期', statKey: 'medicines' },
  { id: 'illness', label: '健康记录表', icon: HeartPulse, description: '家庭健康记录、状态和摘要', statKey: 'illnessRecords' },
  { id: 'medication', label: '用药记录表', icon: Syringe, description: '用药时间、剂量和关联药品', statKey: 'medicationLogs' },
  { id: 'attachments', label: '附件表', icon: Paperclip, description: '检查单、处方、外包装和说明书附件', statKey: 'attachments' },
]

const pageMenu: Array<{ id: PageId; label: string; icon: typeof Home; group: 'dashboard' | 'data' }> = [
  { id: 'overview', label: '总览', icon: Home, group: 'dashboard' },
  { id: 'commerce', label: '运营中心', icon: WalletCards, group: 'dashboard' },
  { id: 'risk', label: '风险关注', icon: AlertTriangle, group: 'dashboard' },
  { id: 'trend', label: '趋势分析', icon: BarChart3, group: 'dashboard' },
  { id: 'dataOverview', label: '数据总表', icon: Database, group: 'data' },
  ...dataTables.map((table) => ({
    id: table.id,
    label: table.label,
    icon: table.icon,
    group: 'data' as const,
  })),
]

function App() {
  const [dashboard, setDashboard] = useState<AdminDashboardData>(() => mockDashboard())
  const [activePage, setActivePage] = useState<PageId>('overview')
  const [tableData, setTableData] = useState<Record<ListType, Record<string, unknown>[]>>(() => createInitialTableData())
  const [tableTotals, setTableTotals] = useState<Record<ListType, number>>(() => createInitialTableTotals(mockDashboard()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isConfigured = Boolean(API_BASE && API_TOKEN)

  const trendCards = useMemo(() => buildTrendCards(dashboard.trend), [dashboard.trend])
  const activeTable = isListPage(activePage) ? activePage : null

  const loadTable = useCallback(
    async (type: ListType) => {
      if (!isConfigured) {
        setTableData((current) => ({
          ...current,
          [type]: mockList(type),
        }))
        return
      }
      const listData = await callAdminApi<AdminListResponse>(listAction(type), { limit: 100 })
      setTableData((current) => ({
        ...current,
        [type]: listData.list || [],
      }))
      setTableTotals((current) => ({
        ...current,
        [type]: listData.total || 0,
      }))
    },
    [isConfigured],
  )

  const loadDataOverview = useCallback(async () => {
    if (!isConfigured) {
      setTableTotals(createInitialTableTotals(dashboard))
      return
    }
    const data = await callAdminApi<DataOverviewResponse>('getDataOverview')
    const totals = data.tables.reduce(
      (acc, table) => ({
        ...acc,
        [table.id]: table.total || 0,
      }),
      {} as Record<ListType, number>,
    )
    setTableTotals((current) => ({
      ...current,
      ...totals,
    }))
  }, [dashboard, isConfigured])

  const refreshDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (isConfigured) {
        const data = await callAdminApi<AdminDashboardData>('getDashboard')
        setDashboard(data)
        setTableTotals(createInitialTableTotals(data))
        if (activePage === 'dataOverview') {
          await loadDataOverview()
        }
        await loadTable(activeTable || 'orders')
      } else {
        setDashboard(mockDashboard())
        if (activeTable) {
          await loadTable(activeTable)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理后台接口请求失败')
    } finally {
      setLoading(false)
    }
  }, [activePage, activeTable, isConfigured, loadDataOverview, loadTable])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDashboard()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshDashboard])

  async function openPage(pageId: PageId) {
    setActivePage(pageId)
    setError('')
    if (pageId === 'dataOverview' || isListPage(pageId)) {
      setLoading(true)
      try {
        if (pageId === 'dataOverview') {
          await loadDataOverview()
        } else {
          await loadTable(pageId)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '列表加载失败')
      } finally {
        setLoading(false)
      }
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
            <h1>家人健康记</h1>
          </div>
        </div>

        <SidebarMenu activePage={activePage} onOpenPage={(pageId) => void openPage(pageId)} />

        <div className="security-box">
          <ShieldCheck size={18} />
          <p>后台接口必须配置管理 token，不建议直接暴露云数据库权限。</p>
        </div>
      </aside>

      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">运营数据</p>
            <h2>{pageTitle(activePage)}</h2>
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

        {activePage === 'overview' && <OverviewPage dashboard={dashboard} />}
        {activePage === 'commerce' && <CommercePage dashboard={dashboard} />}
        {activePage === 'risk' && <RiskPage dashboard={dashboard} />}
        {activePage === 'trend' && <TrendPage trendCards={trendCards} />}
        {activePage === 'dataOverview' && (
          <DataOverviewPage
            dashboard={dashboard}
            tableData={tableData}
            tableTotals={tableTotals}
            onOpenPage={(pageId) => void openPage(pageId)}
          />
        )}
        {activeTable && <DetailTablePage dashboard={dashboard} rows={tableData[activeTable] || []} type={activeTable} />}
      </section>
    </main>
  )
}

function SidebarMenu({
  activePage,
  onOpenPage,
}: {
  activePage: PageId
  onOpenPage: (pageId: PageId) => void
}) {
  return (
    <nav className="side-nav">
      <div className="nav-group-label">看板</div>
      {pageMenu
        .filter((item) => item.group === 'dashboard')
        .map((item) => (
          <SidebarButton active={activePage === item.id} item={item} key={item.id} onOpenPage={onOpenPage} />
        ))}
      <div className="nav-group-label">数据表</div>
      {pageMenu
        .filter((item) => item.group === 'data')
        .map((item) => (
          <SidebarButton active={activePage === item.id} item={item} key={item.id} onOpenPage={onOpenPage} />
        ))}
    </nav>
  )
}

function SidebarButton({
  active,
  item,
  onOpenPage,
}: {
  active: boolean
  item: (typeof pageMenu)[number]
  onOpenPage: (pageId: PageId) => void
}) {
  const Icon = item.icon
  return (
    <button className={active ? 'active' : ''} onClick={() => onOpenPage(item.id)} type="button">
      <Icon size={18} />
      {item.label}
    </button>
  )
}

function OverviewPage({ dashboard }: { dashboard: AdminDashboardData }) {
  return (
    <>
      <section className="stat-grid">
        <StatCard icon={Users} label="用户" value={dashboard.stats.users} />
        <StatCard icon={Home} label="家庭" value={dashboard.stats.families} />
        <StatCard icon={WalletCards} label="会员家庭" value={dashboard.stats.activeSubscriptions} />
        <StatCard icon={ReceiptText} label="付费订单" value={dashboard.stats.paidOrders} />
        <StatCard icon={Pill} label="药品" value={dashboard.stats.medicines} />
        <StatCard icon={HeartPulse} label="健康记录" value={dashboard.stats.illnessRecords} />
      </section>

      <section className="panel-grid">
        <article className="panel">
          <PanelTitle title="运营健康度" subtitle="判断产品是否被持续使用" />
          <HealthGrid health={dashboard.health} />
        </article>
        <article className="panel">
          <PanelTitle title="核心数据" subtitle="家庭、记录、附件和提醒" />
          <MetricRows
            rows={[
              ['家庭成员', dashboard.stats.members],
              ['用药记录', dashboard.stats.medicationLogs],
              ['附件', dashboard.stats.attachments],
              ['提醒', dashboard.stats.reminders],
            ]}
          />
        </article>
      </section>
    </>
  )
}

function CommercePage({ dashboard }: { dashboard: AdminDashboardData }) {
  return (
    <>
      <section className="commerce-grid">
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
            <ReceiptText size={22} />
            <span>订单</span>
          </div>
          <strong>{dashboard.stats.paidOrders || 0}</strong>
          <p>待支付 {dashboard.membership.pendingOrders || 0}，总订单 {dashboard.stats.orders || 0}</p>
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
            <Brain size={22} />
            <span>AI 用量</span>
          </div>
          <strong>{dashboard.aiUsage.total || 0}</strong>
          <p>问答 {dashboard.aiUsage.assistantQuery || 0}，图片解析 {dashboard.aiUsage.imageParse || 0}</p>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <PanelTitle title="会员结构" subtitle="付费转化和会员家庭占比" />
          <MetricRows
            rows={[
              ['会员家庭率', dashboard.membership.memberFamilyRate],
              ['付费转化率', dashboard.membership.conversionRate],
              ['订阅记录', dashboard.membership.subscriptions],
              ['活跃会员家庭', dashboard.membership.activeSubscriptions],
            ]}
          />
        </article>
        <article className="panel">
          <PanelTitle title="套餐结构" subtitle="月度与年度订单分布" />
          <MetricRows
            rows={[
              ['年度订单', dashboard.revenue.yearlyOrders],
              ['月度订单', dashboard.revenue.monthlyOrders],
              ['累计收入', formatMoney(dashboard.revenue.revenueAmount)],
              ['优惠金额', formatMoney(dashboard.revenue.discountAmount)],
            ]}
          />
        </article>
      </section>
    </>
  )
}

function RiskPage({ dashboard }: { dashboard: AdminDashboardData }) {
  return (
    <section className="panel-grid">
      <article className="panel">
        <PanelTitle title="风险关注" subtitle="需要运营或产品跟进的数据" />
        <RiskRow label="快过期药品" value={dashboard.risk.expiringMedicines} tone="warn" />
        <RiskRow label="低库存药品" value={dashboard.risk.lowStockMedicines} tone="danger" />
        <RiskRow label="成员档案缺口" value={dashboard.risk.missingProfileMembers} tone="warn" />
        <RiskRow label="待 OCR 附件" value={dashboard.risk.pendingOcrAttachments} tone="warn" />
      </article>
      <article className="panel">
        <PanelTitle title="风险样本" subtitle="临期和低库存药品预览" />
        <CompactList rows={[...dashboard.expiringMedicines, ...dashboard.lowStockMedicines].slice(0, 8)} />
      </article>
    </section>
  )
}

function TrendPage({ trendCards }: { trendCards: ReturnType<typeof buildTrendCards> }) {
  return (
    <section className="panel">
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
  )
}

function DataOverviewPage({
  dashboard,
  tableData,
  tableTotals,
  onOpenPage,
}: {
  dashboard: AdminDashboardData
  tableData: Record<ListType, Record<string, unknown>[]>
  tableTotals: Record<ListType, number>
  onOpenPage: (pageId: PageId) => void
}) {
  const rows = dataTables.map((table) => ({
    ...table,
    cachedRows: tableData[table.id]?.length || 0,
    total: Number(tableTotals[table.id] ?? dashboard.stats[table.statKey] ?? 0),
  }))
  return (
    <section className="panel">
      <PanelTitle title="数据总表" subtitle="所有业务表的总量、缓存行数和详情入口" />
      <div className="summary-table">
        <div className="summary-head">
          <span>数据表</span>
          <span>说明</span>
          <span>总量</span>
          <span>已载入</span>
          <span>操作</span>
        </div>
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div className="summary-row" key={row.id}>
              <strong>
                <Icon size={16} />
                {row.label}
              </strong>
              <span>{row.description}</span>
              <span>{row.total}</span>
              <span>{row.cachedRows}</span>
              <button onClick={() => onOpenPage(row.id)} type="button">
                查看分表
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DetailTablePage({
  dashboard,
  rows,
  type,
}: {
  dashboard: AdminDashboardData
  rows: Record<string, unknown>[]
  type: ListType
}) {
  const meta = dataTables.find((table) => table.id === type)
  const columns = tableColumns(type)
  return (
    <section className="panel">
      <PanelTitle
        title={meta ? meta.label : '数据分表'}
        subtitle={`${meta?.description || '详细数据列表'}，总量 ${meta ? dashboard.stats[meta.statKey] || 0 : rows.length}`}
      />
      <DataTable columns={columns} rows={rows} />
    </section>
  )
}

function DataTable({ columns, rows }: { columns: TableColumn[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="data-table">
      <div className="data-table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row._id || row.id || index)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : formatCell(row[column.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty-table">暂无数据</div>}
    </div>
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

function MetricRows({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <div className="metric-rows">
      {rows.map(([label, value]) => (
        <div className="risk-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function CompactList({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="compact-list">
      {rows.map((row, index) => (
        <article key={String(row._id || row.id || index)}>
          <strong>{String(row.name || row.title || row.summary || '未命名记录')}</strong>
          <p>{String(row.expireDate || row.category || row.status || row.relatedType || '暂无补充信息')}</p>
        </article>
      ))}
      {!rows.length && <div className="empty-table">暂无风险样本</div>}
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

function tableColumns(type: ListType): TableColumn[] {
  const common = [{ key: '_id', label: 'ID', render: (row: Record<string, unknown>) => shortId(row._id) }]
  const columns: Record<ListType, TableColumn[]> = {
    aiUsage: [
      ...common,
      { key: 'usageType', label: '类型' },
      { key: 'familyId', label: '家庭' },
      { key: 'userOpenid', label: '用户' },
      { key: 'count', label: '次数' },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
    ],
    attachments: [
      ...common,
      { key: 'relatedType', label: '关联类型' },
      { key: 'fileType', label: '文件类型' },
      { key: 'familyId', label: '家庭' },
      { key: 'aiSummary', label: 'AI 摘要' },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
    ],
    coupons: [
      ...common,
      { key: 'code', label: '券码' },
      { key: 'name', label: '名称' },
      { key: 'type', label: '类型' },
      { key: 'value', label: '面值', render: (row) => formatCouponValue(row) },
      { key: 'usedQuantity', label: '已用' },
      { key: 'totalQuantity', label: '总量' },
      { key: 'status', label: '状态' },
    ],
    families: [
      ...common,
      { key: 'name', label: '家庭名称' },
      { key: 'plan', label: '版本' },
      { key: 'ownerOpenid', label: '创建者' },
      { key: 'proExpireAt', label: '会员到期', render: (row) => formatValue(row.proExpireAt) },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
    ],
    illness: [
      ...common,
      { key: 'summary', label: '摘要', render: (row) => String(row.summary || joinArray(row.symptoms) || '健康记录') },
      { key: 'status', label: '状态' },
      { key: 'temperatureMax', label: '最高体温' },
      { key: 'familyId', label: '家庭' },
      { key: 'startedAt', label: '开始时间', render: (row) => formatValue(row.startedAt) },
    ],
    medication: [
      ...common,
      { key: 'medicineNameSnapshot', label: '药品' },
      { key: 'doseQuantity', label: '剂量' },
      { key: 'doseUnit', label: '单位' },
      { key: 'familyId', label: '家庭' },
      { key: 'takenAt', label: '用药时间', render: (row) => formatValue(row.takenAt) },
    ],
    medicines: [
      ...common,
      { key: 'name', label: '药品' },
      { key: 'category', label: '分类' },
      { key: 'remainingQuantity', label: '剩余' },
      { key: 'unit', label: '单位' },
      { key: 'expireDate', label: '有效期' },
      { key: 'location', label: '位置' },
    ],
    orders: [
      ...common,
      { key: 'orderNo', label: '订单号' },
      { key: 'planName', label: '套餐' },
      { key: 'payableAmount', label: '应付', render: (row) => formatMoney(row.payableAmount) },
      { key: 'discountAmount', label: '优惠', render: (row) => formatMoney(row.discountAmount) },
      { key: 'status', label: '状态' },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
    ],
    subscriptions: [
      ...common,
      { key: 'familyId', label: '家庭' },
      { key: 'planName', label: '套餐' },
      { key: 'status', label: '状态' },
      { key: 'startedAt', label: '开始时间', render: (row) => formatValue(row.startedAt) },
      { key: 'expireAt', label: '到期时间', render: (row) => formatValue(row.expireAt) },
    ],
    users: [
      ...common,
      { key: 'nickname', label: '昵称', render: (row) => String(row.nickname || '未命名用户') },
      { key: 'openid', label: 'openid', render: (row) => shortId(row.openid) },
      { key: 'currentFamilyId', label: '当前家庭', render: (row) => shortId(row.currentFamilyId) },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
      { key: 'lastLoginAt', label: '最近登录', render: (row) => formatValue(row.lastLoginAt) },
    ],
  }
  return columns[type]
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

function createInitialTableData(): Record<ListType, Record<string, unknown>[]> {
  return dataTables.reduce(
    (acc, table) => ({
      ...acc,
      [table.id]: mockList(table.id),
    }),
    {} as Record<ListType, Record<string, unknown>[]>,
  )
}

function createInitialTableTotals(dashboard: AdminDashboardData): Record<ListType, number> {
  return dataTables.reduce(
    (acc, table) => ({
      ...acc,
      [table.id]: Number(dashboard.stats[table.statKey] || 0),
    }),
    {} as Record<ListType, number>,
  )
}

function isListPage(pageId: PageId): pageId is ListType {
  return dataTables.some((table) => table.id === pageId)
}

function pageTitle(pageId: PageId) {
  if (pageId === 'overview') return '产品总览'
  if (pageId === 'commerce') return '运营中心'
  if (pageId === 'risk') return '风险关注'
  if (pageId === 'trend') return '趋势分析'
  if (pageId === 'dataOverview') return '数据总表'
  return dataTables.find((table) => table.id === pageId)?.label || '数据分表'
}

function formatCell(value: unknown) {
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (!value) return '-'
  if (typeof value === 'string') return value.length > 36 ? `${value.slice(0, 36)}...` : value
  return '已记录'
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

function formatCouponValue(row: Record<string, unknown>) {
  if (row.type === 'percent_off') {
    return `${Number(row.value || 0) / 10} 折`
  }
  if (row.type === 'trial_days') {
    return `${row.value || 0} 天`
  }
  return formatMoney(row.value)
}

function shortId(value: unknown) {
  const text = String(value || '')
  if (!text) return '-'
  if (text.length <= 12) return text
  return `${text.slice(0, 6)}...${text.slice(-4)}`
}

function joinArray(value: unknown) {
  return Array.isArray(value) ? value.join('、') : ''
}

function mockDashboard(): AdminDashboardData {
  return {
    aiUsage: {
      assistantQuery: 42,
      imageParse: 9,
      total: 51,
    },
    expiringMedicines: [
      { _id: 'med2', category: '鼻炎', expireDate: '2026-06-18', name: '生理盐水鼻喷', remainingQuantity: 18, unit: 'ml' },
    ],
    generatedAt: new Date().toISOString(),
    health: {
      attachmentCoverageRate: 0.42,
      averageIllnessPerFamily: 2.8,
      averageMedicationPerIllness: 1.6,
      averageMedicinesPerFamily: 8.3,
      averageMembersPerFamily: 3.1,
    },
    lowStockMedicines: [
      { _id: 'med3', category: '补液', expireDate: '2027-01-10', name: '口服补液盐', remainingQuantity: 1, unit: '袋' },
    ],
    membership: {
      activeSubscriptions: 11,
      conversionRate: 0.18,
      memberFamilyRate: 0.35,
      paidOrders: 15,
      pendingOrders: 4,
      subscriptions: 16,
    },
    recentAiUsage: [
      { _id: 'ai1', count: 1, createdAt: '2026-05-12T09:18:00.000Z', familyId: 'f1', usageType: 'assistant_query', userOpenid: 'ouser-demo-a' },
      { _id: 'ai2', count: 1, createdAt: '2026-05-12T09:30:00.000Z', familyId: 'f1', usageType: 'image_parse', userOpenid: 'ouser-demo-b' },
    ],
    recentCoupons: [
      { _id: 'c1', code: 'NEWUSER20', name: '新用户年费立减', status: 'active', totalQuantity: 500, type: 'fixed_amount', usedQuantity: 21, value: 2000 },
      { _id: 'c2', code: 'MONTH90', name: '月度会员九折', status: 'active', totalQuantity: 300, type: 'percent_off', usedQuantity: 8, value: 90 },
    ],
    recentIllness: [
      { _id: 'h1', familyId: 'f1', startedAt: '2026-05-11T20:00:00.000Z', status: '观察中', summary: '儿童发热观察记录', symptoms: ['发热', '咽痛'], temperatureMax: 38.5 },
      { _id: 'h2', familyId: 'f2', startedAt: '2026-05-10T08:00:00.000Z', status: '已恢复', summary: '鼻塞咳嗽恢复记录', symptoms: ['鼻塞', '咳嗽'] },
    ],
    recentMedication: [
      { _id: 'm1', doseQuantity: 5, doseUnit: 'ml', familyId: 'f1', medicineNameSnapshot: '对乙酰氨基酚混悬液', takenAt: '2026-05-12T08:20:00.000Z' },
    ],
    recentOrders: [
      { _id: 'o1', createdAt: '2026-05-12T08:30:00.000Z', discountAmount: 2000, orderNo: 'FH20260512A1', payableAmount: 7900, planName: '年度会员', status: 'paid' },
      { _id: 'o2', createdAt: '2026-05-12T10:10:00.000Z', discountAmount: 0, orderNo: 'FH20260512B2', payableAmount: 990, planName: '月度会员', status: 'pending' },
    ],
    recentSubscriptions: [
      { _id: 's1', expireAt: '2027-05-12T08:30:00.000Z', familyId: 'f1', planName: '年度会员', startedAt: '2026-05-12T08:30:00.000Z', status: 'active' },
    ],
    recentUsers: [
      { _id: 'u1', createdAt: '2026-05-12T08:00:00.000Z', currentFamilyId: 'f1', lastLoginAt: '2026-05-12T10:20:00.000Z', nickname: '测试用户 A', openid: 'ouser-demo-a' },
      { _id: 'u2', createdAt: '2026-05-11T21:00:00.000Z', currentFamilyId: 'f2', lastLoginAt: '2026-05-12T08:40:00.000Z', nickname: '测试用户 B', openid: 'ouser-demo-b' },
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
      { _id: 'med1', category: '退烧', expireDate: '2026-08-20', location: '客厅药箱上层', name: '对乙酰氨基酚混悬液', remainingQuantity: 62, unit: 'ml' },
      { _id: 'med2', category: '鼻炎', expireDate: '2026-06-18', location: '儿童护理抽屉', name: '生理盐水鼻喷', remainingQuantity: 18, unit: 'ml' },
    ]
  }
  if (type === 'families') {
    return [
      { _id: 'f1', createdAt: '2026-05-12', name: '测试家庭 A', ownerOpenid: 'ouser-demo-a', plan: 'pro', proExpireAt: '2027-05-12T08:30:00.000Z' },
      { _id: 'f2', createdAt: '2026-05-11', name: '测试家庭 B', ownerOpenid: 'ouser-demo-b', plan: 'free' },
    ]
  }
  return [
    { _id: 'a1', aiSummary: 'OCR 待处理', createdAt: '2026-05-12T09:00:00.000Z', familyId: 'f1', fileType: 'image', relatedType: 'health' },
  ]
}

function mockTrend(values: number[]): TrendPoint[] {
  return values.map((count, index) => ({
    count,
    date: `05-${String(6 + index).padStart(2, '0')}`,
  }))
}

export default App
