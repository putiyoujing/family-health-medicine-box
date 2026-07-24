import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Clipboard,
  Database,
  Download,
  HeartPulse,
  Home,
  Lock,
  MessageSquareText,
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
import {
  DEFAULT_TABLE_PAGE_SIZE,
  TABLE_PAGE_SIZE_OPTIONS,
  clampTablePage,
  formatAdminDateTime,
  getTablePageCount,
  normalizeTablePageSize,
  tablePageToSkip,
  type TablePageSize,
} from './admin-table-utils'
import { callAdminFunction, cloudbaseApp, getAdminSession, signInAdmin } from './cloudbase-auth'

type ListType =
  | 'users'
  | 'families'
  | 'orders'
  | 'subscriptions'
  | 'coupons'
  | 'couponBatches'
  | 'couponCodes'
  | 'aiUsage'
  | 'medicines'
  | 'illness'
  | 'medication'
  | 'attachments'
  | 'feedback'

type PageId = 'overview' | 'commerce' | 'risk' | 'trend' | 'dataOverview' | ListType

interface AdminStats {
  users: number
  families: number
  members: number
  medicines: number
  illnessRecords: number
  medicationLogs: number
  attachments: number
  feedback: number
  reminders: number
  orders: number
  paidOrders: number
  subscriptions: number
  activeSubscriptions: number
  coupons: number
  couponCodeBatches: number
  couponCodes: number
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
  recentCouponBatches: Record<string, unknown>[]
  recentCouponCodes: Record<string, unknown>[]
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

interface FamilyDetail {
  family: Record<string, unknown>
  members: Record<string, unknown>[]
  roles: Record<string, unknown>[]
  subscription: Record<string, unknown> | null
  stats: Record<string, number>
  recent: Record<string, Record<string, unknown>[]>
  canRevealSensitive: boolean
  sensitiveFieldsIncluded: boolean
}

interface UserDetail {
  user: Record<string, unknown>
  families: Array<Record<string, unknown> | null>
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
  render?: (row: Record<string, unknown>) => ReactNode
}

interface CouponBatchForm {
  name: string
  prefix: string
  quantity: string
  codeLength: string
  redeemPlanId: string
  redeemDurationDays: string
  channel: string
}

interface TableSearch {
  keyword: string
  status: string
}

interface FeedbackEditor {
  id: string
  status: string
  operatorNote: string
}

interface CouponCodeExport {
  batchId: string
  csv: string
  rows: Record<string, unknown>[]
}

interface MembershipSettings {
  membershipPurchaseGuide: string
}

const DEFAULT_MEMBERSHIP_PURCHASE_GUIDE = '请输入已有会员兑换码完成权益激活。'
const DEV_ADMIN_API_BASE = import.meta.env.DEV && !cloudbaseApp ? '/api/admin' : ''
const DEV_ADMIN_API_TOKEN = DEV_ADMIN_API_BASE ? 'local-dev-token' : ''
const API_BASE = DEV_ADMIN_API_BASE

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
  { id: 'couponBatches', label: '兑换码批次表', icon: TicketPercent, description: '小红书发码批次、套餐和生成数量', statKey: 'couponCodeBatches' },
  { id: 'couponCodes', label: '会员兑换码表', icon: TicketPercent, description: '单个兑换码、发放状态和兑换家庭', statKey: 'couponCodes' },
  { id: 'aiUsage', label: 'AI 用量表', icon: Brain, description: '问答、图片解析和家庭维度额度消耗', statKey: 'aiUsageLogs' },
  { id: 'medicines', label: '药箱记录表', icon: Pill, description: '家庭药箱药品、分类、位置和有效期', statKey: 'medicines' },
  { id: 'illness', label: '健康记录表', icon: HeartPulse, description: '家庭健康记录、状态和摘要', statKey: 'illnessRecords' },
  { id: 'medication', label: '用药记录表', icon: Syringe, description: '用药时间、剂量和关联药品', statKey: 'medicationLogs' },
  { id: 'attachments', label: '附件表', icon: Paperclip, description: '检查单、处方、外包装和说明书附件', statKey: 'attachments' },
  { id: 'feedback', label: '用户反馈表', icon: MessageSquareText, description: '使用问题、数据请求和可选联系方式', statKey: 'feedback' },
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
  const [tableOffsets, setTableOffsets] = useState<Record<ListType, number>>(() => createInitialTableOffsets())
  const [tablePageSizes, setTablePageSizes] = useState<Record<ListType, TablePageSize>>(() => createInitialTablePageSizes())
  const [tableSearches, setTableSearches] = useState<Record<ListType, TableSearch>>(() => createInitialTableSearches())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [couponBatchForm, setCouponBatchForm] = useState<CouponBatchForm>({
    name: '小红书年度会员兑换码',
    prefix: 'XHSVIP',
    quantity: '50',
    codeLength: '8',
    redeemPlanId: 'yearly_pro',
    redeemDurationDays: '365',
    channel: 'xiaohongshu',
  })
  const [generatingCodes, setGeneratingCodes] = useState(false)
  const [batchMessage, setBatchMessage] = useState('')
  const [latestCouponBatchId, setLatestCouponBatchId] = useState('')
  const [downloadingBatchId, setDownloadingBatchId] = useState('')
  const [authChecked, setAuthChecked] = useState(!cloudbaseApp)
  const [authError, setAuthError] = useState('')
  const [adminSession, setAdminSession] = useState<unknown>(null)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginUsername, setLoginUsername] = useState('administrator')
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null)
  const [familyDetail, setFamilyDetail] = useState<FamilyDetail | null>(null)
  const [revealingSensitive, setRevealingSensitive] = useState(false)
  const [feedbackEditor, setFeedbackEditor] = useState<FeedbackEditor | null>(null)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [disablingRecordId, setDisablingRecordId] = useState('')
  const [membershipSettings, setMembershipSettings] = useState<MembershipSettings>({
    membershipPurchaseGuide: DEFAULT_MEMBERSHIP_PURCHASE_GUIDE,
  })
  const [membershipSettingsMessage, setMembershipSettingsMessage] = useState('')
  const [savingMembershipSettings, setSavingMembershipSettings] = useState(false)
  const isConfigured = Boolean(cloudbaseApp || API_BASE)

  const trendCards = useMemo(() => buildTrendCards(dashboard.trend), [dashboard.trend])
  const activeTable = isListPage(activePage) ? activePage : null

  const loadTable = useCallback(
    async (type: ListType, skip = 0, pageSize = tablePageSizes[type]) => {
      if (!isConfigured) {
        const rows = mockList(type)
        setTableData((current) => ({
          ...current,
          [type]: rows.slice(skip, skip + pageSize),
        }))
        setTableTotals((current) => ({ ...current, [type]: rows.length }))
        setTableOffsets((current) => ({ ...current, [type]: skip }))
        return
      }
      const filters = tableSearches[type]
      const listData = await callAdminApi<AdminListResponse>(listAction(type), {
        limit: pageSize,
        skip,
        ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      })
      setTableData((current) => ({
        ...current,
        [type]: listData.list || [],
      }))
      setTableTotals((current) => ({
        ...current,
        [type]: listData.total || 0,
      }))
      setTableOffsets((current) => ({
        ...current,
        [type]: listData.skip || 0,
      }))
    },
    [isConfigured, tablePageSizes, tableSearches],
  )

  const loadDataOverview = useCallback(async () => {
    if (!isConfigured) {
      setTableTotals(createInitialTableTotals(mockDashboard()))
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
  }, [isConfigured])

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
        const demoDashboard = mockDashboard()
        setDashboard(demoDashboard)
        setTableTotals(createInitialTableTotals(demoDashboard))
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

  useEffect(() => {
    if (activePage !== 'commerce' || !isConfigured) return
    void callAdminApi<MembershipSettings>('getMembershipSettings')
      .then(setMembershipSettings)
      .catch((err: unknown) => {
        setMembershipSettingsMessage(err instanceof Error ? err.message : '会员兑换提示加载失败')
      })
  }, [activePage, isConfigured])

  useEffect(() => {
    if (!cloudbaseApp) return
    void getAdminSession()
      .then(setAdminSession)
      .catch((error: unknown) => setAuthError(error instanceof Error ? error.message : '登录状态检查失败'))
      .finally(() => setAuthChecked(true))
  }, [])

  async function login() {
    setAuthError('')
    try {
      setAdminSession(await signInAdmin(loginUsername.trim(), loginPassword))
      setLoginPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败')
    }
  }

  async function openPage(pageId: PageId) {
    setActivePage(pageId)
    setError('')
    if (pageId === 'dataOverview' || isListPage(pageId)) {
      setLoading(true)
      try {
        if (pageId === 'dataOverview') {
          await loadDataOverview()
        } else {
          await loadTable(pageId, tableOffsets[pageId] || 0)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '列表加载失败')
      } finally {
        setLoading(false)
      }
    }
  }

  async function changeTablePage(type: ListType, skip: number) {
    setLoading(true)
    setError('')
    try {
      await loadTable(type, Math.max(skip, 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : '列表翻页失败')
    } finally {
      setLoading(false)
    }
  }

  async function changeTablePageSize(type: ListType, value: unknown) {
    const pageSize = normalizeTablePageSize(value)
    setTablePageSizes((current) => ({ ...current, [type]: pageSize }))
    setLoading(true)
    setError('')
    try {
      await loadTable(type, 0, pageSize)
    } catch (err) {
      setError(err instanceof Error ? err.message : '每页行数切换失败')
    } finally {
      setLoading(false)
    }
  }

  function updateTableSearch(type: ListType, key: keyof TableSearch, value: string) {
    setTableSearches((current) => ({ ...current, [type]: { ...current[type], [key]: value } }))
  }

  async function searchTable(type: ListType) {
    setLoading(true)
    setError('')
    try {
      await loadTable(type)
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  async function disableCouponRecord(type: 'coupons' | 'couponCodes', row: Record<string, unknown>) {
    const id = String(row._id || '')
    if (!id || !window.confirm(type === 'coupons' ? '失效该优惠券规则？未使用的关联兑换码也会失效。' : '失效该兑换码？此操作不可恢复。')) return
    setDisablingRecordId(id)
    setError('')
    try {
      await callAdminApi(type === 'coupons' ? 'disableCoupon' : 'disableCouponCode', { id })
      await Promise.all([loadTable(type, tableOffsets[type] || 0), refreshDashboard()])
    } catch (err) {
      setError(err instanceof Error ? err.message : '券码失效失败')
    } finally {
      setDisablingRecordId('')
    }
  }

  function openFeedbackEditor(row: Record<string, unknown>) {
    setFeedbackEditor({ id: String(row._id || ''), operatorNote: String(row.operatorNote || ''), status: String(row.status || 'new') })
  }

  async function saveFeedback() {
    if (!feedbackEditor?.id) return
    setSavingFeedback(true)
    setError('')
    try {
      await callAdminApi('updateFeedback', { feedbackId: feedbackEditor.id, operatorNote: feedbackEditor.operatorNote, status: feedbackEditor.status })
      setFeedbackEditor(null)
      await loadTable('feedback', tableOffsets.feedback || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '反馈处理结果保存失败')
    } finally {
      setSavingFeedback(false)
    }
  }

  async function saveMembershipSettings() {
    const membershipPurchaseGuide = membershipSettings.membershipPurchaseGuide.trim()
    setMembershipSettingsMessage('')
    if (!membershipPurchaseGuide) {
      setMembershipSettingsMessage('会员兑换提示不能为空')
      return
    }
    if (membershipPurchaseGuide.length > 120) {
      setMembershipSettingsMessage('会员兑换提示不能超过 120 个字')
      return
    }
    if (!isConfigured) {
      setMembershipSettingsMessage('当前是演示数据模式，配置真实管理接口后才能保存。')
      return
    }
    setSavingMembershipSettings(true)
    try {
      const saved = await callAdminApi<MembershipSettings>('updateMembershipSettings', {
        membershipPurchaseGuide,
      })
      setMembershipSettings(saved)
      setMembershipSettingsMessage('已保存，用户重新进入会员中心后生效。')
    } catch (err) {
      setMembershipSettingsMessage(err instanceof Error ? err.message : '会员兑换提示保存失败')
    } finally {
      setSavingMembershipSettings(false)
    }
  }

  function updateCouponBatchForm(key: keyof CouponBatchForm, value: string) {
    setCouponBatchForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function generateCouponCodes() {
    setBatchMessage('')
    if (!isConfigured) {
      setBatchMessage('当前是演示数据模式，配置真实管理接口后可以批量生成兑换码。')
      return
    }
    setGeneratingCodes(true)
    setError('')
    try {
      const result = await callAdminApi<{ batchId: string; generatedCount: number }>('adminBatchGenerateCouponCodes', {
        ...couponBatchForm,
        quantity: Number(couponBatchForm.quantity || 0),
        codeLength: Number(couponBatchForm.codeLength || 8),
        redeemDurationDays: Number(couponBatchForm.redeemDurationDays || 365),
        purpose: 'membership_redeem',
      })
      setBatchMessage(`已生成 ${result.generatedCount || 0} 个会员兑换码，批次 ${result.batchId}`)
      setLatestCouponBatchId(result.batchId)
      await refreshDashboard()
      await Promise.all([loadTable('couponBatches'), loadTable('couponCodes')])
    } catch (err) {
      setError(err instanceof Error ? err.message : '兑换码生成失败')
    } finally {
      setGeneratingCodes(false)
    }
  }

  async function downloadCouponCodes(batchId: string) {
    if (!batchId || downloadingBatchId) return
    setDownloadingBatchId(batchId)
    setError('')
    try {
      const result = await callAdminApi<CouponCodeExport>('exportCouponCodes', { batchId, limit: 1000 })
      downloadCsv(result.csv, `会员兑换码-${batchId}.csv`)
      setBatchMessage(`已下载 ${result.rows.length} 个兑换码（批次 ${batchId}）`)
      await loadTable('couponBatches', tableOffsets.couponBatches || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '兑换码下载失败')
    } finally {
      setDownloadingBatchId('')
    }
  }

  async function copyCouponCode(code: string) {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setBatchMessage(`已复制兑换码：${code}`)
    } catch {
      setError('当前浏览器不允许复制，请手动复制兑换码')
    }
  }

  async function openUserDetail(row: Record<string, unknown>) {
    if (!isConfigured) return
    setLoading(true)
    try {
      setUserDetail(await callAdminApi<UserDetail>('getUserDetail', { userId: String(row._id || '') }))
      setFamilyDetail(null)
    } finally { setLoading(false) }
  }

  async function openFamilyDetail(familyId: string, includeSensitive = false) {
    if (!isConfigured) return
    setLoading(true)
    try {
      setFamilyDetail(await callAdminApi<FamilyDetail>('getFamilyDetail', { familyId, ...(includeSensitive ? { includeSensitive: true } : {}) }))
      setUserDetail(null)
    } finally { setLoading(false) }
  }

  async function revealFamilySensitive() {
    const familyId = String(familyDetail?.family._id || '')
    if (!familyId || !window.confirm('敏感健康字段包括过敏史和既往病史，仅在必要时查看。确认继续？')) return
    setRevealingSensitive(true)
    setError('')
    try {
      setFamilyDetail(await callAdminApi<FamilyDetail>('getFamilyDetail', { familyId, includeSensitive: true }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '敏感信息加载失败')
    } finally {
      setRevealingSensitive(false)
    }
  }

  if (cloudbaseApp && !authChecked) return <main className="login-shell">正在检查登录状态…</main>
  if (cloudbaseApp && !adminSession) return <LoginPage error={authError} password={loginPassword} username={loginUsername} onLogin={() => void login()} onPasswordChange={setLoginPassword} onUsernameChange={setLoginUsername} />

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
          <p>真实数据仅允许经管理员登录会话访问，浏览器不保存共享密钥。</p>
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
                生产环境需要配置 `VITE_CLOUDBASE_ENV_ID` 和 `VITE_CLOUDBASE_PUBLISHABLE_KEY`。
                管理员登录后，后台会通过 CloudBase Event Function 读取真实数据。
              </p>
            </div>
          </section>
        )}

        {error && <section className="error-box">{error}</section>}

        {activePage === 'overview' && <OverviewPage dashboard={dashboard} />}
        {activePage === 'commerce' && (
          <CommercePage
            batchForm={couponBatchForm}
            batchMessage={batchMessage}
            dashboard={dashboard}
            generatingCodes={generatingCodes}
            isConfigured={isConfigured}
            latestCouponBatchId={latestCouponBatchId}
            downloadingBatchId={downloadingBatchId}
            membershipSettings={membershipSettings}
            membershipSettingsMessage={membershipSettingsMessage}
            savingMembershipSettings={savingMembershipSettings}
            onBatchFormChange={updateCouponBatchForm}
            onGenerateCodes={() => void generateCouponCodes()}
            onDownloadBatch={(batchId) => void downloadCouponCodes(batchId)}
            onMembershipSettingsChange={(membershipPurchaseGuide) => {
              setMembershipSettings({ membershipPurchaseGuide })
              setMembershipSettingsMessage('')
            }}
            onSaveMembershipSettings={() => void saveMembershipSettings()}
          />
        )}
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
        {activeTable && (
          <DetailTablePage
            batchForm={couponBatchForm}
            batchMessage={batchMessage}
            generatingCodes={generatingCodes}
            isConfigured={isConfigured}
            offset={tableOffsets[activeTable] || 0}
            pageSize={tablePageSizes[activeTable]}
            rows={tableData[activeTable] || []}
            total={tableTotals[activeTable] || 0}
            type={activeTable}
            onBatchFormChange={updateCouponBatchForm}
            onGenerateCodes={() => void generateCouponCodes()}
            onCopyCouponCode={(code) => void copyCouponCode(code)}
            onDownloadBatch={(batchId) => void downloadCouponCodes(batchId)}
            downloadingBatchId={downloadingBatchId}
            latestCouponBatchId={latestCouponBatchId}
            disablingRecordId={disablingRecordId}
            search={tableSearches[activeTable]}
            onDisableCoupon={(row) => void disableCouponRecord('coupons', row)}
            onDisableCouponCode={(row) => void disableCouponRecord('couponCodes', row)}
            onEditFeedback={openFeedbackEditor}
            onSearchChange={(key, value) => updateTableSearch(activeTable, key, value)}
            onSearch={() => void searchTable(activeTable)}
            onPageChange={(skip) => void changeTablePage(activeTable, skip)}
            onPageSizeChange={(pageSize) => void changeTablePageSize(activeTable, pageSize)}
            onOpenFamily={(row) => void openFamilyDetail(String(row._id || ''))}
            onOpenUser={(row) => void openUserDetail(row)}
          />
        )}
        {userDetail && <UserDetailPanel detail={userDetail} onClose={() => setUserDetail(null)} onOpenFamily={(id) => void openFamilyDetail(id)} />}
        {familyDetail && (
          <FamilyDetailPanel
            detail={familyDetail}
            revealingSensitive={revealingSensitive}
            onClose={() => setFamilyDetail(null)}
            onHideSensitive={() => void openFamilyDetail(String(familyDetail.family._id || ''))}
            onRevealSensitive={() => void revealFamilySensitive()}
          />
        )}
        {feedbackEditor && (
          <FeedbackEditorPanel
            editor={feedbackEditor}
            saving={savingFeedback}
            onChange={(key, value) => setFeedbackEditor((current) => (current ? { ...current, [key]: value } : current))}
            onClose={() => setFeedbackEditor(null)}
            onSave={() => void saveFeedback()}
          />
        )}
      </section>
    </main>
  )
}

function LoginPage({ error, password, username, onLogin, onPasswordChange, onUsernameChange }: { error: string; password: string; username: string; onLogin: () => void; onPasswordChange: (value: string) => void; onUsernameChange: (value: string) => void }) {
  return <main className="login-shell"><form className="login-card" onSubmit={(event) => { event.preventDefault(); onLogin() }}><ShieldCheck size={28} /><h1>家庭健康管理后台</h1><p>使用 CloudBase 管理员账号登录</p><label>用户名<input autoComplete="username" onChange={(event) => onUsernameChange(event.target.value)} required type="text" value={username} /></label><label>密码<input autoComplete="current-password" onChange={(event) => onPasswordChange(event.target.value)} required type="password" value={password} /></label>{error && <div className="error-box">{error}</div>}<button type="submit">登录</button></form></main>
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

function CommercePage({
  batchForm,
  batchMessage,
  dashboard,
  generatingCodes,
  isConfigured,
  latestCouponBatchId,
  downloadingBatchId,
  membershipSettings,
  membershipSettingsMessage,
  savingMembershipSettings,
  onBatchFormChange,
  onGenerateCodes,
  onDownloadBatch,
  onMembershipSettingsChange,
  onSaveMembershipSettings,
}: {
  batchForm: CouponBatchForm
  batchMessage: string
  dashboard: AdminDashboardData
  generatingCodes: boolean
  isConfigured: boolean
  latestCouponBatchId: string
  downloadingBatchId: string
  membershipSettings: MembershipSettings
  membershipSettingsMessage: string
  savingMembershipSettings: boolean
  onBatchFormChange: (key: keyof CouponBatchForm, value: string) => void
  onGenerateCodes: () => void
  onDownloadBatch: (batchId: string) => void
  onMembershipSettingsChange: (value: string) => void
  onSaveMembershipSettings: () => void
}) {
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
            <TicketPercent size={22} />
            <span>会员兑换码</span>
          </div>
          <strong>{dashboard.stats.couponCodes || 0}</strong>
          <p>批次 {dashboard.stats.couponCodeBatches || 0}，用于小红书成交后发码</p>
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

      <section className="panel membership-settings-panel">
        <PanelTitle title="会员兑换提示" subtitle="显示在小程序会员中心兑换码输入框上方" />
        <label>
          <textarea
            maxLength={120}
            value={membershipSettings.membershipPurchaseGuide}
            onChange={(event) => onMembershipSettingsChange(event.target.value)}
            placeholder="填写兑换码使用说明，不填写购买或外部渠道信息"
          />
          <span>{membershipSettings.membershipPurchaseGuide.length}/120</span>
        </label>
        <div className="membership-settings-actions">
          <button
            disabled={savingMembershipSettings || !isConfigured}
            onClick={onSaveMembershipSettings}
            type="button"
          >
            {savingMembershipSettings ? '保存中…' : '保存提示文案'}
          </button>
          <p aria-live="polite">
            {membershipSettingsMessage || (!isConfigured ? '演示页面不会写入真实配置。' : '')}
          </p>
        </div>
      </section>

      <CouponBatchGenerator
        batchForm={batchForm}
        batchMessage={batchMessage}
        generatingCodes={generatingCodes}
        isConfigured={isConfigured}
        latestCouponBatchId={latestCouponBatchId}
        downloadingBatchId={downloadingBatchId}
        onBatchFormChange={onBatchFormChange}
        onGenerateCodes={onGenerateCodes}
        onDownloadBatch={onDownloadBatch}
      />
    </>
  )
}

function CouponBatchGenerator({
  batchForm,
  batchMessage,
  generatingCodes,
  isConfigured,
  latestCouponBatchId,
  downloadingBatchId,
  onBatchFormChange,
  onGenerateCodes,
  onDownloadBatch,
}: {
  batchForm: CouponBatchForm
  batchMessage: string
  generatingCodes: boolean
  isConfigured: boolean
  latestCouponBatchId: string
  downloadingBatchId: string
  onBatchFormChange: (key: keyof CouponBatchForm, value: string) => void
  onGenerateCodes: () => void
  onDownloadBatch: (batchId: string) => void
}) {
  const parsedQuantity = Number(batchForm.quantity || 0)
  const quantityValue = Number.isFinite(parsedQuantity) ? parsedQuantity : 0
  return (
    <section className="panel coupon-generator-panel">
      <PanelTitle title="人工批量生成兑换码" subtitle="后台人工生成 50 或 100 个会员兑换码，用于小红书订单逐个发码" />
      <div className="batch-toolbar">
        <div className="batch-presets">
          <span>常用数量</span>
          {[50, 100].map((quantity) => (
            <button
              aria-pressed={quantityValue === quantity}
              className={quantityValue === quantity ? 'active' : ''}
              key={quantity}
              onClick={() => onBatchFormChange('quantity', String(quantity))}
              type="button"
            >
              {quantity} 个
            </button>
          ))}
        </div>
        {!isConfigured && <span className="batch-state">演示模式不会写入真实券码</span>}
      </div>
      <div className="batch-form">
        <label>
          <span>批次名称</span>
          <input value={batchForm.name} onChange={(event) => onBatchFormChange('name', event.target.value)} />
        </label>
        <label>
          <span>券码前缀</span>
          <input value={batchForm.prefix} onChange={(event) => onBatchFormChange('prefix', event.target.value)} />
        </label>
        <label>
          <span>生成数量</span>
          <input
            max="1000"
            min="1"
            type="number"
            value={batchForm.quantity}
            onChange={(event) => onBatchFormChange('quantity', event.target.value)}
          />
        </label>
        <label>
          <span>码长</span>
          <input
            max="16"
            min="6"
            type="number"
            value={batchForm.codeLength}
            onChange={(event) => onBatchFormChange('codeLength', event.target.value)}
          />
        </label>
        <label>
          <span>兑换套餐</span>
          <select value={batchForm.redeemPlanId} onChange={(event) => onBatchFormChange('redeemPlanId', event.target.value)}>
            <option value="yearly_pro">年度会员</option>
            <option value="monthly_pro">月度会员</option>
          </select>
        </label>
        <label>
          <span>会员天数</span>
          <input
            min="1"
            type="number"
            value={batchForm.redeemDurationDays}
            onChange={(event) => onBatchFormChange('redeemDurationDays', event.target.value)}
          />
        </label>
        <label>
          <span>发放渠道</span>
          <input value={batchForm.channel} onChange={(event) => onBatchFormChange('channel', event.target.value)} />
        </label>
        <button disabled={generatingCodes || quantityValue < 1} onClick={onGenerateCodes} type="button">
          {generatingCodes ? '生成中' : `生成 ${quantityValue || ''} 个`}
        </button>
      </div>
      {!isConfigured && <p className="batch-helper">完成 CloudBase Web Auth 配置并以管理员身份登录后，才会写入优惠券规则、兑换码批次和单个兑换码。</p>}
      {batchMessage && <div className="batch-message">{batchMessage}</div>}
      {latestCouponBatchId && (
        <button className="batch-download" disabled={downloadingBatchId === latestCouponBatchId} onClick={() => onDownloadBatch(latestCouponBatchId)} type="button">
          <Download size={16} />
          {downloadingBatchId === latestCouponBatchId ? '正在准备下载…' : '下载刚生成的兑换码'}
        </button>
      )}
    </section>
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
  batchForm,
  batchMessage,
  generatingCodes,
  isConfigured,
  offset,
  pageSize,
  rows,
  total,
  type,
  onBatchFormChange,
  onGenerateCodes,
  onCopyCouponCode,
  onDownloadBatch,
  downloadingBatchId,
  latestCouponBatchId,
  disablingRecordId,
  search,
  onDisableCoupon,
  onDisableCouponCode,
  onEditFeedback,
  onSearchChange,
  onSearch,
  onPageChange,
  onPageSizeChange,
  onOpenFamily,
  onOpenUser,
}: {
  batchForm: CouponBatchForm
  batchMessage: string
  generatingCodes: boolean
  isConfigured: boolean
  offset: number
  pageSize: TablePageSize
  rows: Record<string, unknown>[]
  total: number
  type: ListType
  onBatchFormChange: (key: keyof CouponBatchForm, value: string) => void
  onGenerateCodes: () => void
  onCopyCouponCode: (code: string) => void
  onDownloadBatch: (batchId: string) => void
  downloadingBatchId: string
  latestCouponBatchId: string
  disablingRecordId: string
  search: TableSearch
  onDisableCoupon: (row: Record<string, unknown>) => void
  onDisableCouponCode: (row: Record<string, unknown>) => void
  onEditFeedback: (row: Record<string, unknown>) => void
  onSearchChange: (key: keyof TableSearch, value: string) => void
  onSearch: () => void
  onPageChange: (skip: number) => void
  onPageSizeChange: (pageSize: TablePageSize) => void
  onOpenFamily: (row: Record<string, unknown>) => void
  onOpenUser: (row: Record<string, unknown>) => void
}) {
  const meta = dataTables.find((table) => table.id === type)
  const columns = tableColumns(type, { disablingRecordId, onCopyCouponCode, onDisableCoupon, onDisableCouponCode, onDownloadBatch, onEditFeedback, downloadingBatchId })
  const showCouponGenerator = type === 'coupons' || type === 'couponBatches' || type === 'couponCodes'
  return (
    <>
      {showCouponGenerator && (
        <CouponBatchGenerator
          batchForm={batchForm}
          batchMessage={batchMessage}
          generatingCodes={generatingCodes}
          isConfigured={isConfigured}
          latestCouponBatchId={latestCouponBatchId}
          downloadingBatchId={downloadingBatchId}
          onBatchFormChange={onBatchFormChange}
          onGenerateCodes={onGenerateCodes}
          onDownloadBatch={onDownloadBatch}
        />
      )}
      <section className="panel">
        <PanelTitle
          title={meta ? meta.label : '数据分表'}
          subtitle={`${meta?.description || '详细数据列表'}，共 ${total} 条`}
        />
        {(type === 'coupons' || type === 'couponCodes' || type === 'feedback') && <ListSearchToolbar type={type} search={search} onChange={onSearchChange} onSearch={onSearch} />}
        <DataTable columns={columns} rows={rows} onRowClick={type === 'users' ? onOpenUser : type === 'families' ? onOpenFamily : undefined} />
        <TablePagination
          key={`${type}:${offset}:${pageSize}:${total}`}
          offset={offset}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </section>
    </>
  )
}

function TablePagination({
  offset,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  offset: number
  pageSize: TablePageSize
  total: number
  onPageChange: (skip: number) => void
  onPageSizeChange: (pageSize: TablePageSize) => void
}) {
  const pageCount = getTablePageCount(total, pageSize)
  const currentPage = clampTablePage(Math.floor(offset / pageSize) + 1, total, pageSize)
  const [jumpPage, setJumpPage] = useState(String(currentPage))

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetPage = clampTablePage(Number(jumpPage), total, pageSize)
    setJumpPage(String(targetPage))
    onPageChange(tablePageToSkip(targetPage, pageSize))
  }

  return (
    <div className="pagination" aria-label="列表分页">
      <span className="pagination-total">共 {total} 条</span>
      <label className="pagination-size">
        每页
        <select value={pageSize} onChange={(event) => onPageSizeChange(normalizeTablePageSize(event.target.value))}>
          {TABLE_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        条
      </label>
      <button disabled={currentPage <= 1} onClick={() => onPageChange(tablePageToSkip(currentPage - 1, pageSize))} type="button">
        上一页
      </button>
      <span>第 {currentPage} / {pageCount} 页</span>
      <button disabled={currentPage >= pageCount} onClick={() => onPageChange(tablePageToSkip(currentPage + 1, pageSize))} type="button">
        下一页
      </button>
      <form className="pagination-jump" onSubmit={submitJump}>
        <label>
          跳至
          <input
            aria-label="跳转页码"
            aria-valuemax={pageCount}
            aria-valuemin={1}
            type="number"
            value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value)}
          />
          页
        </label>
        <button type="submit">跳转</button>
      </form>
    </div>
  )
}

function ListSearchToolbar({ type, search, onChange, onSearch }: { type: 'coupons' | 'couponCodes' | 'feedback'; search: TableSearch; onChange: (key: keyof TableSearch, value: string) => void; onSearch: () => void }) {
  const placeholder = type === 'feedback' ? '搜索用户ID、反馈内容、联系方式' : type === 'coupons' ? '搜索券码、名称、渠道、用户ID' : '搜索兑换码、用户ID、渠道、订单号'
  const statuses = type === 'feedback'
    ? [['', '全部状态'], ['new', '待处理'], ['in_progress', '处理中'], ['resolved', '已解决'], ['closed', '已关闭']]
    : type === 'coupons'
      ? [['', '全部状态'], ['active', '可用'], ['disabled', '已失效']]
      : [['', '全部状态'], ['active', '未使用'], ['used', '已使用'], ['disabled', '已失效']]
  return <form className="list-search" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
    <input value={search.keyword} onChange={(event) => onChange('keyword', event.target.value)} placeholder={placeholder} />
    <select value={search.status} onChange={(event) => onChange('status', event.target.value)}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <button type="submit">搜索</button>
  </form>
}

function DataTable({ columns, rows, onRowClick }: { columns: TableColumn[]; rows: Record<string, unknown>[]; onRowClick?: (row: Record<string, unknown>) => void }) {
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
              <tr className={onRowClick ? 'clickable-row' : ''} key={String(row._id || row.id || index)} onClick={() => onRowClick?.(row)}>
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

function UserDetailPanel({ detail, onClose, onOpenFamily }: { detail: UserDetail; onClose: () => void; onOpenFamily: (id: string) => void }) {
  return <section className="panel detail-panel"><button className="refresh-btn" onClick={onClose} type="button">关闭</button><PanelTitle title="用户详情" subtitle={String(detail.user.nickname || detail.user.publicUserId || '用户')} />
    <MetricRows rows={Object.entries(detail.user).map(([key, value]) => [key, formatCell(value)])} />
    <h4>关联家庭</h4>{detail.families.filter(Boolean).map((family) => <button className="detail-link" key={String(family?._id)} onClick={() => onOpenFamily(String(family?._id || ''))} type="button">{String(family?.name || family?._id)} · {String(family?.role || '')}</button>)}</section>
}

function FamilyDetailPanel({
  detail,
  revealingSensitive,
  onClose,
  onHideSensitive,
  onRevealSensitive,
}: {
  detail: FamilyDetail
  revealingSensitive: boolean
  onClose: () => void
  onHideSensitive: () => void
  onRevealSensitive: () => void
}) {
  const memberColumns = [
    { key: 'name', label: '姓名' },
    { key: 'relation', label: '关系' },
    { key: 'publicUserId', label: '用户ID' },
    { key: 'accountRole', label: '账号角色' },
    ...(detail.sensitiveFieldsIncluded
      ? [{ key: 'allergyHistory', label: '过敏史' }, { key: 'medicalHistory', label: '既往病史' }]
      : []),
  ]
  return <section className="panel detail-panel"><button className="refresh-btn" onClick={onClose} type="button">关闭</button><PanelTitle title="家庭详情" subtitle={String(detail.family.name || detail.family._id || '')} />
    <MetricRows rows={Object.entries(detail.stats).map(([key, value]) => [key, value])} />
    <div className="sensitive-detail-actions">
      <h4>成员（默认脱敏）</h4>
      {detail.canRevealSensitive && !detail.sensitiveFieldsIncluded && <button className="table-action-button" disabled={revealingSensitive} type="button" onClick={onRevealSensitive}>{revealingSensitive ? '加载中…' : '查看敏感健康字段'}</button>}
      {detail.sensitiveFieldsIncluded && <button className="table-action-button" type="button" onClick={onHideSensitive}>收起敏感信息</button>}
    </div>
    {detail.sensitiveFieldsIncluded && <p className="sensitive-detail-note">已临时显示过敏史和既往病史，关闭或收起后恢复默认脱敏。</p>}
    <DataTable columns={memberColumns} rows={detail.members} />
    <h4>最近记录</h4><CompactList rows={[...(detail.recent.medicines || []), ...(detail.recent.illnessRecords || []), ...(detail.recent.medicationLogs || []), ...(detail.recent.feedback || [])]} />
  </section>
}

function FeedbackEditorPanel({ editor, saving, onChange, onClose, onSave }: { editor: FeedbackEditor; saving: boolean; onChange: (key: keyof Omit<FeedbackEditor, 'id'>, value: string) => void; onClose: () => void; onSave: () => void }) {
  return <section className="panel feedback-editor"><div className="feedback-editor-head"><PanelTitle title="处理用户反馈" subtitle={`反馈 ID：${shortId(editor.id)}`} /><button className="refresh-btn" type="button" onClick={onClose}>关闭</button></div>
    <label>处理状态<select value={editor.status} onChange={(event) => onChange('status', event.target.value)}><option value="new">待处理</option><option value="in_progress">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></label>
    <label>处理备注<textarea value={editor.operatorNote} maxLength={500} onChange={(event) => onChange('operatorNote', event.target.value)} placeholder="记录客服跟进结果，用户不可见" /></label>
    <div><button className="table-action-button" disabled={saving} type="button" onClick={onSave}>{saving ? '保存中…' : '保存处理结果'}</button></div>
  </section>
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
  if (cloudbaseApp) {
    return callAdminFunction<T>(action, payload)
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (DEV_ADMIN_API_TOKEN) {
    headers['X-Admin-Token'] = DEV_ADMIN_API_TOKEN
  }
  const response = await fetch(API_BASE, {
    body: JSON.stringify({
      action,
      ...(DEV_ADMIN_API_TOKEN ? { adminToken: DEV_ADMIN_API_TOKEN } : {}),
      payload,
    }),
    credentials: 'include',
    headers,
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
    couponBatches: 'listCouponCodeBatches',
    couponCodes: 'listCouponCodes',
    coupons: 'listCoupons',
    families: 'listFamilies',
    feedback: 'listFeedback',
    illness: 'listIllness',
    medication: 'listMedication',
    medicines: 'listMedicines',
    orders: 'listOrders',
    subscriptions: 'listSubscriptions',
    users: 'listUsers',
  }[type]
}

function tableColumns(
  type: ListType,
  actions: {
    disablingRecordId?: string
    downloadingBatchId?: string
    onCopyCouponCode?: (code: string) => void
    onDisableCoupon?: (row: Record<string, unknown>) => void
    onDisableCouponCode?: (row: Record<string, unknown>) => void
    onDownloadBatch?: (batchId: string) => void
    onEditFeedback?: (row: Record<string, unknown>) => void
  } = {},
): TableColumn[] {
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
      { key: 'codePurpose', label: '用途' },
      { key: 'type', label: '类型' },
      { key: 'value', label: '面值', render: (row) => formatCouponValue(row) },
      { key: 'usedQuantity', label: '已用' },
      { key: 'totalQuantity', label: '总量' },
      { key: 'channel', label: '渠道' },
      { key: 'status', label: '状态', render: (row) => formatCouponRuleStatus(row.status) },
      {
        key: 'action',
        label: '操作',
        render: (row) => {
          const id = String(row._id || '')
          return <button className="table-action-button danger-action" disabled={!id || row.status === 'disabled' || actions.disablingRecordId === id} type="button" onClick={() => actions.onDisableCoupon?.(row)}>{row.status === 'disabled' ? '已失效' : actions.disablingRecordId === id ? '处理中…' : '设为失效'}</button>
        },
      },
    ],
    couponBatches: [
      ...common,
      { key: 'name', label: '批次名称' },
      { key: 'prefix', label: '前缀' },
      { key: 'channel', label: '渠道' },
      { key: 'redeemPlanId', label: '套餐' },
      { key: 'generatedCount', label: '生成' },
      { key: 'usedQuantity', label: '已兑换' },
      { key: 'status', label: '状态' },
      { key: 'createdAt', label: '生成时间', render: (row) => formatValue(row.createdAt) },
      {
        key: 'download',
        label: '下载',
        render: (row) => {
          const batchId = String(row._id || '')
          return (
            <button className="table-action-button" disabled={!batchId || actions.downloadingBatchId === batchId} onClick={() => actions.onDownloadBatch?.(batchId)} type="button">
              <Download size={15} />
              {actions.downloadingBatchId === batchId ? '准备中' : '下载 CSV'}
            </button>
          )
        },
      },
    ],
    couponCodes: [
      ...common,
      {
        key: 'code',
        label: '兑换码',
        render: (row) => {
          const code = String(row.code || '')
          return (
            <span className="coupon-code-cell">
              <span>{code || '-'}</span>
              <button aria-label={`复制兑换码 ${code}`} className="copy-code-button" disabled={!code} onClick={() => actions.onCopyCouponCode?.(code)} type="button">
                <Clipboard size={15} />
              </button>
            </span>
          )
        },
      },
      { key: 'issueStatus', label: '发放', render: (row) => formatIssueStatus(row.issueStatus) },
      { key: 'status', label: '状态', render: (row) => formatCouponCodeStatus(row.status) },
      { key: 'issuedChannel', label: '渠道' },
      { key: 'externalOrderId', label: '外部订单' },
      { key: 'createdAt', label: '生成时间', render: (row) => formatValue(row.createdAt) },
      { key: 'redeemedUser', label: '兑换用户', render: (row) => formatRedeemedUser(row) },
      { key: 'redeemedFamilyId', label: '兑换家庭', render: (row) => shortId(row.redeemedFamilyId) },
      { key: 'redeemedAt', label: '兑换时间', render: (row) => formatValue(row.redeemedAt) },
      {
        key: 'action',
        label: '操作',
        render: (row) => {
          const id = String(row._id || '')
          return <button className="table-action-button danger-action" disabled={!id || row.status === 'used' || row.status === 'disabled' || actions.disablingRecordId === id} type="button" onClick={() => actions.onDisableCouponCode?.(row)}>{row.status === 'used' ? '已使用' : row.status === 'disabled' ? '已失效' : actions.disablingRecordId === id ? '处理中…' : '设为失效'}</button>
        },
      },
    ],
    families: [
      ...common,
      { key: 'name', label: '家庭名称' },
      { key: 'plan', label: '版本' },
      { key: 'ownerOpenid', label: '创建者' },
      { key: 'proExpireAt', label: '会员到期', render: (row) => formatValue(row.proExpireAt) },
      { key: 'createdAt', label: '创建时间', render: (row) => formatValue(row.createdAt) },
    ],
    feedback: [
      ...common,
      { key: 'userId', label: '用户ID' },
      { key: 'userNickname', label: '用户昵称' },
      { key: 'type', label: '类型' },
      { key: 'content', label: '内容' },
      { key: 'contact', label: '联系方式' },
      { key: 'status', label: '状态', render: (row) => formatFeedbackStatus(row.status) },
      { key: 'operatorNote', label: '处理备注' },
      { key: 'createdAt', label: '提交时间', render: (row) => formatValue(row.createdAt) },
      { key: 'action', label: '操作', render: (row) => <button className="table-action-button" type="button" onClick={() => actions.onEditFeedback?.(row)}>处理</button> },
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
      { key: 'changeType', label: '变更', render: (row) => formatMembershipChange(row) },
      { key: 'planName', label: '套餐' },
      { key: 'source', label: '来源', render: (row) => formatMembershipSource(row.source) },
      { key: 'status', label: '状态', render: (row) => formatMembershipStatus(row.status) },
      { key: 'startedAt', label: '开始时间', render: (row) => formatValue(row.startedAt) },
      { key: 'expireAt', label: '到期时间', render: (row) => formatValue(row.expireAt) },
    ],
    users: [
      { key: 'publicUserId', label: '用户ID' },
      { key: 'nickname', label: '昵称', render: (row) => String(row.nickname || '未命名用户') },
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

function createInitialTableOffsets(): Record<ListType, number> {
  return dataTables.reduce(
    (acc, table) => ({
      ...acc,
      [table.id]: 0,
    }),
    {} as Record<ListType, number>,
  )
}

function createInitialTablePageSizes(): Record<ListType, TablePageSize> {
  return dataTables.reduce(
    (acc, table) => ({
      ...acc,
      [table.id]: DEFAULT_TABLE_PAGE_SIZE,
    }),
    {} as Record<ListType, TablePageSize>,
  )
}

function createInitialTableSearches(): Record<ListType, TableSearch> {
  return dataTables.reduce(
    (acc, table) => ({
      ...acc,
      [table.id]: { keyword: '', status: '' },
    }),
    {} as Record<ListType, TableSearch>,
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

const formatValue = formatAdminDateTime

function formatCouponRuleStatus(value: unknown) {
  return String(value) === 'disabled' ? '已失效' : '可用'
}

function formatCouponCodeStatus(value: unknown) {
  if (value === 'used') return '已使用'
  if (value === 'disabled' || value === 'expired') return '已失效'
  return '未使用'
}

function formatIssueStatus(value: unknown) {
  if (value === 'issued') return '已发放'
  if (value === 'failed') return '发放失败'
  return '未发放'
}

function formatFeedbackStatus(value: unknown) {
  return ({ new: '待处理', in_progress: '处理中', resolved: '已解决', closed: '已关闭' } as Record<string, string>)[String(value)] || '待处理'
}

function formatMembershipStatus(value: unknown) {
  return ({ active: '生效中', expired: '已到期', cancelled: '已取消' } as Record<string, string>)[String(value)] || String(value || '-')
}

function formatMembershipSource(value: unknown) {
  return ({ membership_code: '兑换码', mock_payment: '订单支付' } as Record<string, string>)[String(value)] || String(value || '-')
}

function formatMembershipChange(row: Record<string, unknown>) {
  if (row.changeType === 'renewal') return '会员续期'
  if (row.changeType === 'upgrade') return '免费升级会员'
  return '历史开通记录'
}

function formatRedeemedUser(row: Record<string, unknown>) {
  if (!row.redeemedAt && !row.redeemedByOpenid) return '未兑换'
  const nickname = String(row.redeemedUserNickname || '')
  const publicUserId = String(row.redeemedUserId || '')
  if (nickname && publicUserId) return `${nickname}（${publicUserId}）`
  return nickname || publicUserId || '已兑换（用户信息不可用）'
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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
  const zeroStats: AdminStats = {
    activeSubscriptions: 0,
    aiUsageLogs: 0,
    attachments: 0,
    feedback: 0,
    couponCodeBatches: 0,
    couponCodes: 0,
    couponRedemptions: 0,
    coupons: 0,
    families: 0,
    illnessRecords: 0,
    medicationLogs: 0,
    medicines: 0,
    members: 0,
    orders: 0,
    paidOrders: 0,
    reminders: 0,
    subscriptions: 0,
    users: 0,
  }

  return {
    aiUsage: {
      assistantQuery: 0,
      imageParse: 0,
      total: 0,
    },
    expiringMedicines: [],
    generatedAt: new Date().toISOString(),
    health: {
      attachmentCoverageRate: 0,
      averageIllnessPerFamily: 0,
      averageMedicationPerIllness: 0,
      averageMedicinesPerFamily: 0,
      averageMembersPerFamily: 0,
    },
    lowStockMedicines: [],
    membership: {
      activeSubscriptions: 0,
      conversionRate: 0,
      memberFamilyRate: 0,
      paidOrders: 0,
      pendingOrders: 0,
      subscriptions: 0,
    },
    recentAiUsage: [],
    recentCoupons: [],
    recentCouponBatches: [],
    recentCouponCodes: [],
    recentIllness: [],
    recentMedication: [],
    recentOrders: [],
    recentSubscriptions: [],
    recentUsers: [],
    revenue: {
      averageOrderAmount: 0,
      discountAmount: 0,
      monthlyOrders: 0,
      revenueAmount: 0,
      yearlyOrders: 0,
    },
    risk: {
      expiringMedicines: 0,
      lowStockMedicines: 0,
      missingProfileMembers: 0,
      pendingOcrAttachments: 0,
    },
    stats: zeroStats,
    trend: {
      aiUsage: [],
      illnessRecords: [],
      medicationLogs: [],
      medicines: [],
      orders: [],
      paidOrders: [],
      users: [],
    },
  }
}

function mockList(type: ListType) {
  void type
  return []
}

export default App
