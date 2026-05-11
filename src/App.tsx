import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ClipboardList,
  Home,
  PackagePlus,
  Pill,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import './App.css'
import { SAFETY_NOTICE } from './data'
import type {
  AppData,
  AssistantResult,
  FamilyMember,
  Gender,
  IllnessRecord,
  IllnessStatus,
  MedicationLog,
  Medicine,
  MedicineSource,
} from './types'
import {
  addMedicationLog,
  buildAssistantAnswer,
  createId,
  daysUntil,
  formatDate,
  formatDateTime,
  getIllnessTitle,
  getMemberName,
  inventoryRatio,
  isExpiringSoon,
  isLowStock,
  loadData,
  resetData,
  saveData,
  todayInputValue,
} from './utils'

type TabId = 'overview' | 'medicines' | 'illness' | 'medication' | 'assistant'

const tabs: Array<{ id: TabId; label: string; icon: typeof Home }> = [
  { id: 'overview', label: '首页', icon: Home },
  { id: 'medicines', label: '药箱', icon: Pill },
  { id: 'illness', label: '生病记录', icon: Stethoscope },
  { id: 'medication', label: '用药记录', icon: Syringe },
  { id: 'assistant', label: 'AI 查询', icon: Bot },
]

const initialMemberForm = {
  name: '',
  relation: '孩子',
  birthday: '',
  gender: 'female' as Gender,
  allergyHistory: '',
  medicalHistory: '',
  note: '',
}

const initialMedicineForm = {
  name: '',
  category: '退烧',
  specification: '',
  totalQuantity: '1',
  remainingQuantity: '1',
  unit: '盒',
  expireDate: '',
  location: '家庭药箱',
  source: '常备' as MedicineSource,
  indicationsText: '',
  instructionText: '',
  note: '',
}

const initialIllnessForm = {
  memberId: '',
  startedAt: '',
  endedAt: '',
  symptoms: '',
  symptomDescription: '',
  temperatureMax: '',
  hospitalName: '',
  doctorDiagnosis: '',
  doctorAdvice: '',
  examinationResult: '',
  status: '观察中' as IllnessStatus,
  summary: '',
}

const initialMedicationForm = {
  memberId: '',
  illnessRecordId: '',
  medicineId: '',
  doseQuantity: '1',
  doseUnit: '',
  takenAt: '',
  frequencyText: '单次记录',
  wasPlanned: true,
  reaction: '',
  note: '',
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [medicineQuery, setMedicineQuery] = useState('')
  const [illnessFilter, setIllnessFilter] = useState('all')
  const [assistantQuestion, setAssistantQuestion] = useState('家里有哪些药快过期了？')
  const [assistantResult, setAssistantResult] = useState<AssistantResult>(() =>
    buildAssistantAnswer(loadData(), '家里有哪些药快过期了？'),
  )
  const [memberForm, setMemberForm] = useState(initialMemberForm)
  const [medicineForm, setMedicineForm] = useState(initialMedicineForm)
  const [illnessForm, setIllnessForm] = useState(() => ({
    ...initialIllnessForm,
    memberId: data.members[0]?.id ?? '',
    startedAt: todayInputValue(),
  }))
  const [medicationForm, setMedicationForm] = useState(() => ({
    ...initialMedicationForm,
    memberId: data.members[0]?.id ?? '',
    illnessRecordId: data.illnessRecords[0]?.id ?? '',
    medicineId: data.medicines[0]?.id ?? '',
    doseUnit: data.medicines[0]?.unit ?? '',
    takenAt: todayInputValue(),
  }))

  useEffect(() => {
    saveData(data)
  }, [data])

  const expiringMedicines = useMemo(
    () =>
      data.medicines
        .filter(isExpiringSoon)
        .sort((a, b) => daysUntil(a.expireDate) - daysUntil(b.expireDate)),
    [data.medicines],
  )

  const lowStockMedicines = useMemo(
    () => data.medicines.filter(isLowStock),
    [data.medicines],
  )

  const recentIllnessRecords = useMemo(
    () =>
      [...data.illnessRecords].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [data.illnessRecords],
  )

  const filteredMedicines = useMemo(() => {
    const query = medicineQuery.trim().toLowerCase()
    if (!query) {
      return data.medicines
    }
    return data.medicines.filter((medicine) =>
      [
        medicine.name,
        medicine.category,
        medicine.location,
        medicine.source,
        medicine.indicationsText,
        medicine.note,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [data.medicines, medicineQuery])

  const filteredIllnessRecords = useMemo(() => {
    if (illnessFilter === 'all') {
      return recentIllnessRecords
    }
    return recentIllnessRecords.filter((record) => record.memberId === illnessFilter)
  }, [illnessFilter, recentIllnessRecords])

  const todayMedicationLogs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return data.medicationLogs.filter((log) => log.takenAt.slice(0, 10) === today)
  }, [data.medicationLogs])

  const submitMember = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!memberForm.name.trim()) {
      return
    }
    const member: FamilyMember = {
      ...memberForm,
      id: createId('member'),
      name: memberForm.name.trim(),
      createdAt: new Date().toISOString(),
    }
    setData((current) => ({ ...current, members: [member, ...current.members] }))
    setMemberForm(initialMemberForm)
  }

  const submitMedicine = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!medicineForm.name.trim()) {
      return
    }
    const now = new Date().toISOString()
    const medicine: Medicine = {
      ...medicineForm,
      id: createId('medicine'),
      name: medicineForm.name.trim(),
      totalQuantity: Number(medicineForm.totalQuantity) || 0,
      remainingQuantity: Number(medicineForm.remainingQuantity) || 0,
      createdAt: now,
      updatedAt: now,
    }
    setData((current) => ({ ...current, medicines: [medicine, ...current.medicines] }))
    setMedicineForm(initialMedicineForm)
  }

  const submitIllness = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!illnessForm.memberId || !illnessForm.startedAt) {
      return
    }
    const now = new Date().toISOString()
    const record: IllnessRecord = {
      ...illnessForm,
      id: createId('illness'),
      symptoms: illnessForm.symptoms
        .split(/[、,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      temperatureMax: illnessForm.temperatureMax ? Number(illnessForm.temperatureMax) : null,
      createdAt: now,
      updatedAt: now,
    }
    setData((current) => ({ ...current, illnessRecords: [record, ...current.illnessRecords] }))
    setIllnessForm({
      ...initialIllnessForm,
      memberId: data.members[0]?.id ?? '',
      startedAt: todayInputValue(),
    })
  }

  const submitMedication = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!medicationForm.memberId || !medicationForm.medicineId || !medicationForm.takenAt) {
      return
    }
    const medicine = data.medicines.find((item) => item.id === medicationForm.medicineId)
    const log: MedicationLog = {
      ...medicationForm,
      id: createId('log'),
      medicineNameSnapshot: medicine?.name ?? '未命名药品',
      doseQuantity: Number(medicationForm.doseQuantity) || 0,
      doseUnit: medicationForm.doseUnit || medicine?.unit || '',
      createdAt: new Date().toISOString(),
    }
    setData((current) => addMedicationLog(current, log))
    setMedicationForm({
      ...initialMedicationForm,
      memberId: medicationForm.memberId,
      illnessRecordId: medicationForm.illnessRecordId,
      medicineId: medicationForm.medicineId,
      doseUnit: medicine?.unit ?? '',
      takenAt: todayInputValue(),
    })
  }

  const runAssistant = (question = assistantQuestion) => {
    setAssistantQuestion(question)
    setAssistantResult(buildAssistantAnswer(data, question))
    setActiveTab('assistant')
  }

  const restoreDemoData = () => {
    const restored = resetData()
    setData(restored)
    setIllnessForm({
      ...initialIllnessForm,
      memberId: restored.members[0]?.id ?? '',
      startedAt: todayInputValue(),
    })
    setMedicationForm({
      ...initialMedicationForm,
      memberId: restored.members[0]?.id ?? '',
      illnessRecordId: restored.illnessRecords[0]?.id ?? '',
      medicineId: restored.medicines[0]?.id ?? '',
      doseUnit: restored.medicines[0]?.unit ?? '',
      takenAt: todayInputValue(),
    })
    setAssistantResult(buildAssistantAnswer(restored, assistantQuestion))
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="eyebrow">家庭健康记忆系统</p>
            <h1>我的小药箱</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="safety-card">
          <ShieldCheck size={20} />
          <p>{SAFETY_NOTICE}</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP 工作台</p>
            <h2>{data.familyName}</h2>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={restoreDemoData} type="button">
              <RotateCcw size={16} />
              <span>恢复示例</span>
            </button>
          </div>
        </header>

        {activeTab === 'overview' && (
          <OverviewPanel
            data={data}
            expiringMedicines={expiringMedicines}
            lowStockMedicines={lowStockMedicines}
            recentIllnessRecords={recentIllnessRecords}
            todayMedicationLogs={todayMedicationLogs}
            onOpenTab={setActiveTab}
            onAsk={runAssistant}
          />
        )}

        {activeTab === 'medicines' && (
          <MedicinePanel
            form={medicineForm}
            medicines={filteredMedicines}
            query={medicineQuery}
            onFormChange={setMedicineForm}
            onQueryChange={setMedicineQuery}
            onSubmit={submitMedicine}
          />
        )}

        {activeTab === 'illness' && (
          <IllnessPanel
            filter={illnessFilter}
            form={illnessForm}
            illnessRecords={filteredIllnessRecords}
            members={data.members}
            onFilterChange={setIllnessFilter}
            onFormChange={setIllnessForm}
            onSubmit={submitIllness}
          />
        )}

        {activeTab === 'medication' && (
          <MedicationPanel
            form={medicationForm}
            illnessRecords={data.illnessRecords}
            medicationLogs={data.medicationLogs}
            medicines={data.medicines}
            members={data.members}
            onFormChange={setMedicationForm}
            onSubmit={submitMedication}
          />
        )}

        {activeTab === 'assistant' && (
          <AssistantPanel
            data={data}
            question={assistantQuestion}
            result={assistantResult}
            onQuestionChange={setAssistantQuestion}
            onRun={runAssistant}
          />
        )}

        <section className="members-band">
          <div className="section-heading">
            <div>
              <p className="eyebrow">家庭成员</p>
              <h3>记录对象</h3>
            </div>
            <UsersRound size={20} />
          </div>
          <div className="member-grid">
            {data.members.map((member) => (
              <article className="member-card" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.relation}</span>
                </div>
                <p>生日：{member.birthday ? formatDate(member.birthday) : '未记录'}</p>
                <p>过敏史：{member.allergyHistory || '未记录'}</p>
              </article>
            ))}
          </div>
          <form className="inline-form" onSubmit={submitMember}>
            <input
              aria-label="成员名称"
              onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })}
              placeholder="成员名称"
              value={memberForm.name}
            />
            <input
              aria-label="关系"
              onChange={(event) => setMemberForm({ ...memberForm, relation: event.target.value })}
              placeholder="关系"
              value={memberForm.relation}
            />
            <input
              aria-label="生日"
              onChange={(event) => setMemberForm({ ...memberForm, birthday: event.target.value })}
              type="date"
              value={memberForm.birthday}
            />
            <select
              aria-label="性别"
              onChange={(event) =>
                setMemberForm({ ...memberForm, gender: event.target.value as Gender })
              }
              value={memberForm.gender}
            >
              <option value="female">女</option>
              <option value="male">男</option>
              <option value="other">其他</option>
            </select>
            <input
              aria-label="过敏史"
              onChange={(event) =>
                setMemberForm({ ...memberForm, allergyHistory: event.target.value })
              }
              placeholder="过敏史"
              value={memberForm.allergyHistory}
            />
            <button className="primary-button" type="submit">
              <UserRoundPlus size={16} />
              <span>添加成员</span>
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}

interface OverviewPanelProps {
  data: AppData
  expiringMedicines: Medicine[]
  lowStockMedicines: Medicine[]
  recentIllnessRecords: IllnessRecord[]
  todayMedicationLogs: MedicationLog[]
  onAsk: (question: string) => void
  onOpenTab: (tab: TabId) => void
}

function OverviewPanel({
  data,
  expiringMedicines,
  lowStockMedicines,
  recentIllnessRecords,
  todayMedicationLogs,
  onAsk,
  onOpenTab,
}: OverviewPanelProps) {
  return (
    <section className="panel-stack">
      <div className="metric-grid">
        <MetricCard icon={UsersRound} label="家庭成员" value={data.members.length} />
        <MetricCard icon={Pill} label="药品库存" value={data.medicines.length} />
        <MetricCard icon={Stethoscope} label="生病记录" value={data.illnessRecords.length} />
        <MetricCard icon={Syringe} label="用药记录" value={data.medicationLogs.length} />
      </div>

      <div className="action-strip">
        <button onClick={() => onOpenTab('illness')} type="button">
          <Plus size={18} />
          <span>新增生病记录</span>
        </button>
        <button onClick={() => onOpenTab('medication')} type="button">
          <Syringe size={18} />
          <span>记录一次用药</span>
        </button>
        <button onClick={() => onOpenTab('medicines')} type="button">
          <PackagePlus size={18} />
          <span>添加药品</span>
        </button>
        <button onClick={() => onAsk('上次孩子咳嗽吃了什么？')} type="button">
          <Bot size={18} />
          <span>问 AI</span>
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">今日</p>
              <h3>用药提醒</h3>
            </div>
            <CalendarClock size={20} />
          </div>
          <ListEmptyGuard empty={!todayMedicationLogs.length} message="今天还没有用药记录。">
            {todayMedicationLogs.map((log) => (
              <TimelineItem
                key={log.id}
                title={log.medicineNameSnapshot}
                meta={`${formatDateTime(log.takenAt)} · ${log.doseQuantity}${log.doseUnit}`}
                body={log.reaction || log.note || '暂无反应记录'}
              />
            ))}
          </ListEmptyGuard>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">库存</p>
              <h3>快过期药品</h3>
            </div>
            <AlertTriangle size={20} />
          </div>
          <ListEmptyGuard empty={!expiringMedicines.length} message="暂无 60 天内到期药品。">
            {expiringMedicines.map((medicine) => (
              <MedicineRow key={medicine.id} medicine={medicine} compact />
            ))}
          </ListEmptyGuard>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">库存</p>
              <h3>低库存</h3>
            </div>
            <ClipboardList size={20} />
          </div>
          <ListEmptyGuard empty={!lowStockMedicines.length} message="暂无明显低库存药品。">
            {lowStockMedicines.map((medicine) => (
              <MedicineRow key={medicine.id} medicine={medicine} compact />
            ))}
          </ListEmptyGuard>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">最近</p>
              <h3>生病时间线</h3>
            </div>
            <Stethoscope size={20} />
          </div>
          <ListEmptyGuard empty={!recentIllnessRecords.length} message="还没有生病记录。">
            {recentIllnessRecords.slice(0, 4).map((record) => (
              <TimelineItem
                key={record.id}
                title={`${getMemberName(data.members, record.memberId)} · ${record.symptoms.join('、') || '未填症状'}`}
                meta={`${formatDateTime(record.startedAt)} · ${record.status}`}
                body={record.summary || record.symptomDescription}
              />
            ))}
          </ListEmptyGuard>
        </section>
      </div>
    </section>
  )
}

interface MedicinePanelProps {
  form: typeof initialMedicineForm
  medicines: Medicine[]
  query: string
  onFormChange: (form: typeof initialMedicineForm) => void
  onQueryChange: (query: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function MedicinePanel({
  form,
  medicines,
  query,
  onFormChange,
  onQueryChange,
  onSubmit,
}: MedicinePanelProps) {
  return (
    <section className="panel-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">药箱库存管理</p>
          <h3>药品录入、搜索、有效期和库存提醒</h3>
        </div>
        <Pill size={22} />
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <Field label="药品名称">
          <input
            onChange={(event) => onFormChange({ ...form, name: event.target.value })}
            placeholder="例如：对乙酰氨基酚混悬液"
            required
            value={form.name}
          />
        </Field>
        <Field label="分类">
          <input
            onChange={(event) => onFormChange({ ...form, category: event.target.value })}
            placeholder="退烧 / 咳嗽 / 鼻炎"
            value={form.category}
          />
        </Field>
        <Field label="规格">
          <input
            onChange={(event) => onFormChange({ ...form, specification: event.target.value })}
            placeholder="100ml/瓶"
            value={form.specification}
          />
        </Field>
        <Field label="总量">
          <input
            min="0"
            onChange={(event) => onFormChange({ ...form, totalQuantity: event.target.value })}
            step="0.1"
            type="number"
            value={form.totalQuantity}
          />
        </Field>
        <Field label="剩余量">
          <input
            min="0"
            onChange={(event) => onFormChange({ ...form, remainingQuantity: event.target.value })}
            step="0.1"
            type="number"
            value={form.remainingQuantity}
          />
        </Field>
        <Field label="单位">
          <input
            onChange={(event) => onFormChange({ ...form, unit: event.target.value })}
            placeholder="ml / 片 / 袋"
            value={form.unit}
          />
        </Field>
        <Field label="有效期">
          <input
            onChange={(event) => onFormChange({ ...form, expireDate: event.target.value })}
            type="date"
            value={form.expireDate}
          />
        </Field>
        <Field label="存放位置">
          <input
            onChange={(event) => onFormChange({ ...form, location: event.target.value })}
            placeholder="客厅药箱上层"
            value={form.location}
          />
        </Field>
        <Field label="来源">
          <select
            onChange={(event) =>
              onFormChange({ ...form, source: event.target.value as MedicineSource })
            }
            value={form.source}
          >
            <option value="医生开具">医生开具</option>
            <option value="自购">自购</option>
            <option value="常备">常备</option>
          </select>
        </Field>
        <Field label="主治 / 适用说明" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, indicationsText: event.target.value })}
            placeholder="只记录说明书、医嘱或家庭历史，不写系统推荐"
            value={form.indicationsText}
          />
        </Field>
        <Field label="用法说明" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, instructionText: event.target.value })}
            placeholder="基于说明书或医生医嘱记录"
            value={form.instructionText}
          />
        </Field>
        <Field label="备注" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, note: event.target.value })}
            placeholder="开封日期、购买渠道、注意事项"
            value={form.note}
          />
        </Field>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            <PackagePlus size={16} />
            <span>添加药品</span>
          </button>
        </div>
      </form>

      <div className="search-row">
        <Search size={18} />
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索药品名、分类、位置、说明"
          value={query}
        />
      </div>

      <div className="medicine-list">
        {medicines.map((medicine) => (
          <MedicineRow key={medicine.id} medicine={medicine} />
        ))}
      </div>
    </section>
  )
}

interface IllnessPanelProps {
  filter: string
  form: typeof initialIllnessForm
  illnessRecords: IllnessRecord[]
  members: FamilyMember[]
  onFilterChange: (filter: string) => void
  onFormChange: (form: typeof initialIllnessForm) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function IllnessPanel({
  filter,
  form,
  illnessRecords,
  members,
  onFilterChange,
  onFormChange,
  onSubmit,
}: IllnessPanelProps) {
  return (
    <section className="panel-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">生病记录</p>
          <h3>症状、体温、就医、医嘱和本次总结</h3>
        </div>
        <Stethoscope size={22} />
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <Field label="家庭成员">
          <select
            onChange={(event) => onFormChange({ ...form, memberId: event.target.value })}
            required
            value={form.memberId}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="发病时间">
          <input
            onChange={(event) => onFormChange({ ...form, startedAt: event.target.value })}
            required
            type="datetime-local"
            value={form.startedAt}
          />
        </Field>
        <Field label="恢复时间">
          <input
            onChange={(event) => onFormChange({ ...form, endedAt: event.target.value })}
            type="datetime-local"
            value={form.endedAt}
          />
        </Field>
        <Field label="状态">
          <select
            onChange={(event) =>
              onFormChange({ ...form, status: event.target.value as IllnessStatus })
            }
            value={form.status}
          >
            <option value="观察中">观察中</option>
            <option value="已就医">已就医</option>
            <option value="已恢复">已恢复</option>
          </select>
        </Field>
        <Field label="症状标签">
          <input
            onChange={(event) => onFormChange({ ...form, symptoms: event.target.value })}
            placeholder="发热、咳嗽、鼻塞"
            value={form.symptoms}
          />
        </Field>
        <Field label="最高体温">
          <input
            max="45"
            min="30"
            onChange={(event) => onFormChange({ ...form, temperatureMax: event.target.value })}
            step="0.1"
            type="number"
            value={form.temperatureMax}
          />
        </Field>
        <Field label="医院 / 诊所">
          <input
            onChange={(event) => onFormChange({ ...form, hospitalName: event.target.value })}
            placeholder="可空"
            value={form.hospitalName}
          />
        </Field>
        <Field label="医生诊断">
          <input
            onChange={(event) => onFormChange({ ...form, doctorDiagnosis: event.target.value })}
            placeholder="按病历或医生原话记录"
            value={form.doctorDiagnosis}
          />
        </Field>
        <Field label="症状描述" wide>
          <textarea
            onChange={(event) =>
              onFormChange({ ...form, symptomDescription: event.target.value })
            }
            placeholder="什么时候开始、精神状态、体温变化、咳嗽/腹泻/皮疹等细节"
            value={form.symptomDescription}
          />
        </Field>
        <Field label="医嘱" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, doctorAdvice: event.target.value })}
            placeholder="只记录医生已给出的医嘱"
            value={form.doctorAdvice}
          />
        </Field>
        <Field label="检查结果" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, examinationResult: event.target.value })}
            placeholder="检查单摘要或关键指标"
            value={form.examinationResult}
          />
        </Field>
        <Field label="本次总结" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, summary: event.target.value })}
            placeholder="本次过程、恢复情况、下次复诊要点"
            value={form.summary}
          />
        </Field>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            <Plus size={16} />
            <span>保存生病记录</span>
          </button>
        </div>
      </form>

      <div className="filter-row">
        <span>按成员筛选</span>
        <select onChange={(event) => onFilterChange(event.target.value)} value={filter}>
          <option value="all">全部成员</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <div className="timeline-list">
        {illnessRecords.map((record) => (
          <article className="record-card" key={record.id}>
            <div className="record-header">
              <div>
                <h4>{record.symptoms.join('、') || '未填写症状'}</h4>
                <p>
                  {getMemberName(members, record.memberId)} · {formatDateTime(record.startedAt)}
                </p>
              </div>
              <span className={`status-pill status-${record.status}`}>{record.status}</span>
            </div>
            <p>{record.symptomDescription || '暂无症状描述'}</p>
            <div className="record-meta">
              <span>最高体温：{record.temperatureMax ?? '未记录'}</span>
              <span>医院：{record.hospitalName || '未记录'}</span>
              <span>医嘱：{record.doctorAdvice || '未记录'}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

interface MedicationPanelProps {
  form: typeof initialMedicationForm
  illnessRecords: IllnessRecord[]
  medicationLogs: MedicationLog[]
  medicines: Medicine[]
  members: FamilyMember[]
  onFormChange: (form: typeof initialMedicationForm) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function MedicationPanel({
  form,
  illnessRecords,
  medicationLogs,
  medicines,
  members,
  onFormChange,
  onSubmit,
}: MedicationPanelProps) {
  const selectedMedicine = medicines.find((medicine) => medicine.id === form.medicineId)

  return (
    <section className="panel-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">用药记录</p>
          <h3>记录时间、剂量、反应，并自动扣减库存</h3>
        </div>
        <Syringe size={22} />
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <Field label="家庭成员">
          <select
            onChange={(event) => onFormChange({ ...form, memberId: event.target.value })}
            required
            value={form.memberId}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="关联生病记录">
          <select
            onChange={(event) => onFormChange({ ...form, illnessRecordId: event.target.value })}
            value={form.illnessRecordId}
          >
            <option value="">不关联</option>
            {illnessRecords.map((record) => (
              <option key={record.id} value={record.id}>
                {getIllnessTitle(illnessRecords, record.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="关联药品">
          <select
            onChange={(event) => {
              const medicine = medicines.find((item) => item.id === event.target.value)
              onFormChange({
                ...form,
                medicineId: event.target.value,
                doseUnit: medicine?.unit ?? form.doseUnit,
              })
            }}
            required
            value={form.medicineId}
          >
            {medicines.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.name}，剩余 {medicine.remainingQuantity}
                {medicine.unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label="本次剂量">
          <input
            min="0"
            onChange={(event) => onFormChange({ ...form, doseQuantity: event.target.value })}
            required
            step="0.1"
            type="number"
            value={form.doseQuantity}
          />
        </Field>
        <Field label="单位">
          <input
            onChange={(event) => onFormChange({ ...form, doseUnit: event.target.value })}
            placeholder={selectedMedicine?.unit ?? 'ml / 片 / 袋'}
            value={form.doseUnit}
          />
        </Field>
        <Field label="服用时间">
          <input
            onChange={(event) => onFormChange({ ...form, takenAt: event.target.value })}
            required
            type="datetime-local"
            value={form.takenAt}
          />
        </Field>
        <Field label="频率说明">
          <input
            onChange={(event) => onFormChange({ ...form, frequencyText: event.target.value })}
            placeholder="单次记录 / 每日 2 次"
            value={form.frequencyText}
          />
        </Field>
        <Field label="是否按计划">
          <select
            onChange={(event) =>
              onFormChange({ ...form, wasPlanned: event.target.value === 'true' })
            }
            value={String(form.wasPlanned)}
          >
            <option value="true">按计划</option>
            <option value="false">临时记录</option>
          </select>
        </Field>
        <Field label="用药后反应" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, reaction: event.target.value })}
            placeholder="例如：一小时后体温下降、皮疹无变化、胃部不适"
            value={form.reaction}
          />
        </Field>
        <Field label="备注" wide>
          <textarea
            onChange={(event) => onFormChange({ ...form, note: event.target.value })}
            placeholder="记录医嘱来源、漏服、补服、复诊提醒等"
            value={form.note}
          />
        </Field>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            <Syringe size={16} />
            <span>保存并扣减库存</span>
          </button>
        </div>
      </form>

      <div className="timeline-list">
        {medicationLogs.map((log) => (
          <article className="record-card" key={log.id}>
            <div className="record-header">
              <div>
                <h4>{log.medicineNameSnapshot}</h4>
                <p>
                  {getMemberName(members, log.memberId)} · {formatDateTime(log.takenAt)} ·{' '}
                  {log.doseQuantity}
                  {log.doseUnit}
                </p>
              </div>
              <span className="status-pill status-stock">已扣库存</span>
            </div>
            <p>{log.reaction || '暂无用药后反应记录'}</p>
            <div className="record-meta">
              <span>{log.frequencyText || '未填频率'}</span>
              <span>{log.wasPlanned ? '按计划服用' : '临时记录'}</span>
              <span>{getIllnessTitle(illnessRecords, log.illnessRecordId)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

interface AssistantPanelProps {
  data: AppData
  question: string
  result: AssistantResult
  onQuestionChange: (question: string) => void
  onRun: (question?: string) => void
}

function AssistantPanel({
  data,
  question,
  result,
  onQuestionChange,
  onRun,
}: AssistantPanelProps) {
  const quickQuestions = [
    '家里有哪些药快过期了？',
    '上次孩子咳嗽吃了什么？',
    '家里有没有退烧药？',
    '这个症状是不是肺炎？',
  ]

  return (
    <section className="panel-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI 查询助手</p>
          <h3>只基于已记录信息做检索和整理</h3>
        </div>
        <Bot size={22} />
      </div>

      <div className="assistant-layout">
        <div className="assistant-input">
          <textarea
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="例如：上次孩子咳嗽吃了什么？"
            value={question}
          />
          <button className="primary-button" onClick={() => onRun()} type="button">
            <Search size={16} />
            <span>查询记录</span>
          </button>
          <div className="quick-question-grid">
            {quickQuestions.map((item) => (
              <button key={item} onClick={() => onRun(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>

        <article className="assistant-result">
          <span className="intent-chip">{result.intent}</span>
          <h4>{result.answer}</h4>
          <div className="facts-list">
            {result.facts.map((fact) => (
              <p key={fact}>{fact}</p>
            ))}
          </div>
          <div className="safety-note">
            <ShieldCheck size={18} />
            <p>{result.reminders[0]}</p>
          </div>
        </article>
      </div>

      <div className="data-scope">
        <span>当前检索范围</span>
        <strong>{data.members.length}</strong> 位成员
        <strong>{data.medicines.length}</strong> 个药品
        <strong>{data.illnessRecords.length}</strong> 条生病记录
        <strong>{data.medicationLogs.length}</strong> 条用药记录
      </div>
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home
  label: string
  value: number
}) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function MedicineRow({ medicine, compact = false }: { medicine: Medicine; compact?: boolean }) {
  const ratio = inventoryRatio(medicine)
  const expireDays = daysUntil(medicine.expireDate)
  const expireLabel =
    expireDays < 0 ? `已过期 ${Math.abs(expireDays)} 天` : `${expireDays} 天后到期`

  return (
    <article className={compact ? 'medicine-row compact' : 'medicine-row'}>
      <div className="medicine-row-main">
        <div>
          <h4>{medicine.name}</h4>
          <p>
            {medicine.category} · {medicine.specification || '未填规格'} · {medicine.location}
          </p>
        </div>
        <span className={isExpiringSoon(medicine) ? 'warn-pill' : 'ok-pill'}>
          {medicine.expireDate ? expireLabel : '未填有效期'}
        </span>
      </div>
      <div className="stock-line">
        <div className="stock-track">
          <span style={{ width: `${ratio}%` }} />
        </div>
        <strong>
          {medicine.remainingQuantity}/{medicine.totalQuantity}
          {medicine.unit}
        </strong>
      </div>
      {!compact && (
        <p className="medicine-note">
          {medicine.indicationsText || medicine.instructionText || medicine.note || '暂无说明记录'}
        </p>
      )}
    </article>
  )
}

function TimelineItem({
  title,
  meta,
  body,
}: {
  title: string
  meta: string
  body: string
}) {
  return (
    <article className="timeline-item">
      <div>
        <h4>{title}</h4>
        <span>{meta}</span>
      </div>
      <p>{body}</p>
    </article>
  )
}

function ListEmptyGuard({
  children,
  empty,
  message,
}: {
  children: React.ReactNode
  empty: boolean
  message: string
}) {
  if (empty) {
    return <p className="empty-state">{message}</p>
  }
  return <div className="list-stack">{children}</div>
}

function Field({
  children,
  label,
  wide = false,
}: {
  children: React.ReactNode
  label: string
  wide?: boolean
}) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export default App
