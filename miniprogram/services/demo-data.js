const SAFETY_NOTICE =
  '本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。'

const limits = {
  maxMembers: 10,
  maxSharedUsers: 6,
  maxMedicines: 300,
  maxHealthRecords: 3000,
  maxMedicationLogs: 10000,
  maxAttachments: 1000,
  aiAssistantMonthly: 300,
  aiImageParseMonthly: 100,
}

const plans = [
  {
    planId: 'yearly_pro',
    name: '年度会员',
    price: 9900,
    durationDays: 365,
    badge: '推荐',
    sort: 0,
    benefitsText: '适合全家长期记录健康、用药和药箱信息',
  },
  {
    planId: 'monthly_pro',
    name: '月度会员',
    price: 990,
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
    benefitsText: '适合先体验家庭共享、AI 整理和数据导出',
  },
]

const coupons = [
  {
    _id: 'demo-coupon-001',
    code: 'FAMILY20',
    name: '家庭体验券',
    discountType: 'percent',
    discountValue: 20,
    discountPreview: '8 折',
    description: '年度会员 8 折体验',
    validTo: '2026-06-30',
  },
  {
    _id: 'demo-coupon-002',
    code: 'HEALTH10',
    name: '健康记录券',
    discountType: 'amount',
    discountValue: 1000,
    discountPreview: '立减 10 元',
    description: '年度会员立减 10 元',
    validTo: '2026-07-31',
  },
]

let state = createDemoState()

function createDemoState() {
  const family = {
    _id: 'demo-family-001',
    name: 'Oscar 的家庭健康记录',
    role: 'owner',
    memberCount: 3,
    createdAt: '2026-05-01 09:00',
  }
  const entitlement = {
    planName: '家庭专业版',
    expireAt: '2027-05-12',
    limits,
  }
  const members = [
    {
      _id: 'demo-member-001',
      name: 'Oscar',
      relation: '本人',
      gender: 'male',
      birthday: '1988-06-12',
      allergyHistory: '青霉素过敏',
      medicalHistory: '鼻炎，需关注血压',
      note: '主要管理家庭记录',
    },
    {
      _id: 'demo-member-002',
      name: '安安',
      relation: '孩子',
      gender: 'female',
      birthday: '2018-09-15',
      allergyHistory: '暂未发现',
      medicalHistory: '换季容易鼻塞咳嗽',
      note: '儿童用药需单独核对剂量',
    },
    {
      _id: 'demo-member-003',
      name: '妈妈',
      relation: '配偶',
      gender: 'female',
      birthday: '1990-03-08',
      allergyHistory: '无',
      medicalHistory: '偶发偏头痛',
      note: '关注睡眠和复诊提醒',
    },
  ]
  const medicines = [
    {
      _id: 'demo-medicine-001',
      name: '对乙酰氨基酚混悬液',
      category: '退烧',
      specification: '100ml/瓶',
      totalQuantity: 100,
      remainingQuantity: 34,
      unit: 'ml',
      expireDate: '2026-06-18',
      location: '客厅药箱上层',
      source: '药箱',
      indicationsText: '按说明书和医生建议记录，仅用于历史信息查询。',
      instructionText: '儿童用量需按体重和医生建议确认。',
      note: '临近有效期，优先检查。',
    },
    {
      _id: 'demo-medicine-002',
      name: '生理盐水鼻喷',
      category: '鼻腔护理',
      specification: '60ml/瓶',
      totalQuantity: 60,
      remainingQuantity: 12,
      unit: 'ml',
      expireDate: '2026-07-02',
      location: '儿童护理抽屉',
      source: '自购',
      indicationsText: '鼻塞时用于鼻腔清洁。',
      instructionText: '按说明书使用。',
      note: '剩余较少。',
    },
    {
      _id: 'demo-medicine-003',
      name: '蒙脱石散',
      category: '肠胃',
      specification: '3g*10袋',
      totalQuantity: 10,
      remainingQuantity: 8,
      unit: '袋',
      expireDate: '2027-03-20',
      location: '客厅药箱下层',
      source: '药箱',
      indicationsText: '按医生建议或说明书记录。',
      instructionText: '与其他药品间隔使用需遵医嘱。',
      note: '',
    },
    {
      _id: 'demo-medicine-004',
      name: '氯雷他定片',
      category: '过敏',
      specification: '10mg*6片',
      totalQuantity: 6,
      remainingQuantity: 1,
      unit: '片',
      expireDate: '2026-11-30',
      location: '卧室床头柜',
      source: '医生开具',
      indicationsText: '过敏相关历史记录。',
      instructionText: '按医嘱记录。',
      note: '低库存。',
    },
  ]
  const illnessRecords = [
    {
      _id: 'demo-health-001',
      memberId: 'demo-member-002',
      startedAt: '2026-05-12 20:30',
      endedAt: '',
      symptoms: ['咳嗽', '鼻塞'],
      symptomDescription: '夜间轻微咳嗽，鼻塞明显，精神状态正常。',
      temperatureMax: 37.6,
      hospitalName: '',
      doctorDiagnosis: '',
      doctorAdvice: '继续观察，多喝水，若高热或加重及时就医。',
      examinationResult: '',
      status: '观察中',
      summary: '安安夜间轻微咳嗽鼻塞，暂时观察。',
    },
    {
      _id: 'demo-health-002',
      memberId: 'demo-member-003',
      startedAt: '2026-05-10 09:10',
      endedAt: '2026-05-10 18:00',
      symptoms: ['头痛', '乏力'],
      symptomDescription: '上午偏头痛，休息后缓解。',
      temperatureMax: '',
      hospitalName: '',
      doctorDiagnosis: '',
      doctorAdvice: '记录诱因，保证睡眠。',
      examinationResult: '',
      status: '已恢复',
      summary: '偏头痛半天后缓解。',
    },
    {
      _id: 'demo-health-003',
      memberId: 'demo-member-001',
      startedAt: '2026-05-08 07:40',
      endedAt: '',
      symptoms: ['鼻炎', '打喷嚏'],
      symptomDescription: '早晨连续打喷嚏，疑似换季鼻炎。',
      temperatureMax: '',
      hospitalName: '',
      doctorDiagnosis: '过敏性鼻炎史',
      doctorAdvice: '减少过敏原暴露，必要时按既往医嘱处理。',
      examinationResult: '',
      status: '观察中',
      summary: '换季鼻炎反复，需记录触发环境。',
    },
  ]
  const medicationLogs = [
    {
      _id: 'demo-medication-001',
      memberId: 'demo-member-002',
      illnessRecordId: 'demo-health-001',
      medicineId: 'demo-medicine-002',
      medicineNameSnapshot: '生理盐水鼻喷',
      doseQuantity: 2,
      doseUnit: '次',
      takenAt: '2026-05-12 21:00',
      frequencyText: '睡前清洁鼻腔',
      wasPlanned: true,
      reaction: '鼻塞有所缓解。',
      note: '仅记录护理操作。',
    },
    {
      _id: 'demo-medication-002',
      memberId: 'demo-member-001',
      illnessRecordId: 'demo-health-003',
      medicineId: 'demo-medicine-004',
      medicineNameSnapshot: '氯雷他定片',
      doseQuantity: 1,
      doseUnit: '片',
      takenAt: '2026-05-08 08:20',
      frequencyText: '按既往医嘱记录',
      wasPlanned: true,
      reaction: '打喷嚏减少。',
      note: '',
    },
    {
      _id: 'demo-medication-003',
      memberId: 'demo-member-002',
      illnessRecordId: 'demo-health-001',
      medicineId: 'demo-medicine-001',
      medicineNameSnapshot: '对乙酰氨基酚混悬液',
      doseQuantity: 5,
      doseUnit: 'ml',
      takenAt: '2026-05-11 22:10',
      frequencyText: '历史记录，仅用于回看',
      wasPlanned: false,
      reaction: '体温回落后未继续使用。',
      note: '再次使用前需核对说明书和医嘱。',
    },
  ]
  const attachments = [
    {
      _id: 'demo-attachment-001',
      relatedType: 'medicine',
      relatedId: 'demo-medicine-001',
      fileType: 'image',
      fileId: 'demo://medicine-package-001',
      imageKind: 'medicine_box',
      aiSummary: '示例：外包装识别出药名、规格和有效期。',
      createdAt: '2026-05-12 21:05',
    },
    {
      _id: 'demo-attachment-002',
      relatedType: 'illness',
      relatedId: 'demo-health-001',
      fileType: 'image',
      fileId: 'demo://record-001',
      imageKind: 'prescription',
      aiSummary: '示例：处方和医嘱照片已归档。',
      createdAt: '2026-05-12 21:08',
    },
  ]
  const reminders = [
    {
      _id: 'demo-reminder-001',
      type: 'medication',
      title: '晚饭后记录安安鼻腔护理',
      remindAt: '2026-05-13 20:30',
      note: '提醒后只记录实际情况，不自动给用药建议。',
      status: 'active',
    },
    {
      _id: 'demo-reminder-002',
      type: 'stock_check',
      title: '周末检查家庭药箱有效期',
      remindAt: '2026-05-16 10:00',
      note: '重点看临期和低库存。',
      status: 'active',
    },
    {
      _id: 'demo-reminder-003',
      type: 'follow_up',
      title: '妈妈偏头痛复盘记录',
      remindAt: '2026-05-18 09:00',
      note: '记录睡眠、诱因和是否复发。',
      status: 'active',
    },
  ]

  return {
    family,
    entitlement,
    members,
    medicines,
    illnessRecords,
    medicationLogs,
    attachments,
    reminders,
    roles: [
      { openid: 'demo-owner', nickname: 'Oscar', role: 'owner', joinedAt: '2026-05-01 09:00' },
      { openid: 'demo-admin', nickname: '妈妈', role: 'admin', joinedAt: '2026-05-02 10:20' },
      { openid: 'demo-viewer', nickname: '外婆', role: 'viewer', joinedAt: '2026-05-05 18:30' },
    ],
    orders: [],
  }
}

function getHome() {
  return clone({
    safetyNotice: SAFETY_NOTICE,
    family: {
      ...state.family,
      entitlement: state.entitlement,
    },
    families: [
      state.family,
      {
        _id: 'demo-family-002',
        name: '父母健康记录',
        role: 'admin',
        memberCount: 2,
      },
    ],
    currentFamilyId: state.family._id,
    members: state.members,
    medicines: state.medicines,
    illnessRecords: state.illnessRecords,
    medicationLogs: state.medicationLogs,
    attachments: state.attachments,
    reminders: state.reminders,
    entitlement: state.entitlement,
    stats: buildStats(),
  })
}

function getMembershipStatus() {
  const usage = buildUsage()
  return clone({
    family: state.family,
    entitlement: state.entitlement,
    usage,
    plans,
  })
}

function listMyFamilies() {
  return clone({
    currentFamilyId: state.family._id,
    families: getHome().families,
  })
}

function listFamilyRoles() {
  return clone({ roles: state.roles })
}

function saveMember(payload) {
  const record = {
    _id: newId('member'),
    name: payload.name || '新成员',
    relation: payload.relation || '家人',
    gender: payload.gender || '',
    birthday: payload.birthday || '',
    allergyHistory: payload.allergyHistory || '',
    medicalHistory: payload.medicalHistory || '',
    note: payload.note || '',
  }
  state.members.unshift(record)
  return clone({ id: record._id, ...record })
}

function deleteMember(id) {
  state.members = state.members.filter((item) => item._id !== id)
  return clone({ id })
}

function saveMedicine(payload) {
  const record = {
    _id: newId('medicine'),
    name: payload.name || '未命名药品',
    category: payload.category || '未分类',
    specification: payload.specification || '',
    totalQuantity: Number(payload.totalQuantity || 0),
    remainingQuantity: Number(payload.remainingQuantity || 0),
    unit: payload.unit || '',
    expireDate: payload.expireDate || '',
    location: payload.location || '家庭药箱',
    source: payload.source || '药箱',
    indicationsText: payload.indicationsText || '',
    instructionText: payload.instructionText || '',
    note: payload.note || '',
  }
  state.medicines.unshift(record)
  return clone({ id: record._id, ...record })
}

function deleteMedicine(id) {
  state.medicines = state.medicines.filter((item) => item._id !== id)
  return clone({ id })
}

function saveIllness(payload) {
  const record = {
    _id: newId('health'),
    memberId: payload.memberId || '',
    startedAt: payload.startedAt || '',
    endedAt: payload.endedAt || '',
    symptoms: payload.symptoms || [],
    symptomDescription: payload.symptomDescription || '',
    temperatureMax: payload.temperatureMax || '',
    hospitalName: payload.hospitalName || '',
    doctorDiagnosis: payload.doctorDiagnosis || '',
    doctorAdvice: payload.doctorAdvice || '',
    examinationResult: payload.examinationResult || '',
    status: payload.status || '观察中',
    summary: payload.summary || payload.symptomDescription || '新健康记录',
  }
  state.illnessRecords.unshift(record)
  return clone({ id: record._id, ...record })
}

function deleteIllness(id) {
  state.illnessRecords = state.illnessRecords.filter((item) => item._id !== id)
  return clone({ id })
}

function saveMedication(payload) {
  const medicine = state.medicines.find((item) => item._id === payload.medicineId)
  if (medicine) {
    medicine.remainingQuantity = Math.max(0, Number(medicine.remainingQuantity || 0) - Number(payload.doseQuantity || 0))
  }
  const record = {
    _id: newId('medication'),
    memberId: payload.memberId || '',
    illnessRecordId: payload.illnessRecordId || '',
    medicineId: payload.medicineId || '',
    medicineNameSnapshot: medicine ? medicine.name : payload.medicineNameSnapshot || '未选择药品',
    doseQuantity: Number(payload.doseQuantity || 0),
    doseUnit: payload.doseUnit || (medicine && medicine.unit) || '',
    takenAt: payload.takenAt || '',
    frequencyText: payload.frequencyText || '',
    wasPlanned: payload.wasPlanned !== false,
    reaction: payload.reaction || '',
    note: payload.note || '',
  }
  state.medicationLogs.unshift(record)
  return clone({ id: record._id, ...record })
}

function deleteMedication(id) {
  state.medicationLogs = state.medicationLogs.filter((item) => item._id !== id)
  return clone({ id })
}

function saveAttachment(payload) {
  const record = {
    _id: payload.id || newId('attachment'),
    relatedType: payload.relatedType || '',
    relatedId: payload.relatedId || '',
    fileType: payload.fileType || 'image',
    fileId: payload.fileId || 'demo://local-image',
    imageKind: payload.imageKind || '',
    ocrText: payload.ocrText || '',
    aiSummary: payload.aiSummary || '示例附件已保存。',
    createdAt: nowText(),
  }
  state.attachments.unshift(record)
  return clone({ id: record._id, ...record })
}

function saveReminder(payload) {
  const record = {
    _id: newId('reminder'),
    type: payload.type || 'medication',
    title: payload.title || '新提醒',
    remindAt: payload.remindAt || '',
    note: payload.note || '',
    status: payload.status || 'active',
  }
  state.reminders.unshift(record)
  return clone({ id: record._id, ...record })
}

function parseAttachment(payload) {
  const taskId = newId('ai-task')
  return clone({
    task: {
      _id: taskId,
      status: 'success',
      imageKind: payload.imageKind || 'medicine_box',
      relatedType: payload.relatedType || '',
    },
    output: buildParseOutput(payload.imageKind),
  })
}

function confirmAiParseResult(payload) {
  return clone({
    taskId: payload.taskId,
    saved: true,
    output: payload.output || {},
  })
}

function assistantQuery(question) {
  const normalized = String(question || '')
  if (normalized.includes('过期') || normalized.includes('有效期')) {
    const expiring = state.medicines.filter((item) => item.expireDate && item.expireDate <= '2026-07-12')
    return clone({
      intent: '药箱有效期查询',
      answer: `示例数据里有 ${expiring.length} 个药品需要关注有效期。`,
      facts: expiring,
    })
  }
  return clone({
    intent: '家庭健康记录检索',
    answer: `已根据示例数据检索：家庭成员 ${state.members.length} 位，药箱药品 ${state.medicines.length} 个，健康记录 ${state.illnessRecords.length} 条，用药记录 ${state.medicationLogs.length} 条。`,
    facts: [],
  })
}

function exportData() {
  return getHome()
}

function exportReport(payload = {}) {
  const days = Number(payload.days || 30)
  const lines = [
    `# 家人健康记家庭健康报告（最近 ${days} 天）`,
    '',
    `- 家庭成员：${state.members.length} 位`,
    `- 药箱药品：${state.medicines.length} 个`,
    `- 健康记录：${state.illnessRecords.length} 条`,
    `- 用药记录：${state.medicationLogs.length} 条`,
    '',
    '## 近期关注',
    '- 对乙酰氨基酚混悬液临近有效期。',
    '- 氯雷他定片库存偏低。',
    '- 安安最近有咳嗽鼻塞记录，建议继续观察并按医嘱处理。',
  ]
  return clone({ reportText: lines.join('\n') })
}

function getPlans() {
  return clone({ plans })
}

function listCouponsForUser() {
  return clone({ coupons })
}

function previewOrder(payload = {}) {
  const plan = plans.find((item) => item.planId === payload.planId) || plans[0]
  const discountAmount = calculateDiscount(plan.price, payload.couponCode)
  return clone({
    planId: plan.planId,
    originalAmount: plan.price,
    discountAmount,
    payableAmount: Math.max(0, plan.price - discountAmount),
    couponCode: payload.couponCode || '',
  })
}

function createOrder(payload = {}) {
  const preview = previewOrder(payload)
  const order = {
    ...preview,
    orderId: newId('order'),
    orderNo: `DEMO${Date.now()}`,
    status: 'pending',
    createdAt: nowText(),
  }
  state.orders.unshift(order)
  return clone(order)
}

function mockPaymentSuccess(payload = {}) {
  const order = state.orders.find((item) => item.orderId === payload.orderId)
  if (order) {
    order.status = 'paid'
  }
  state.entitlement = {
    ...state.entitlement,
    planName: '家庭专业版',
    expireAt: '2027-05-12',
  }
  return clone({
    success: true,
    orderId: payload.orderId,
    entitlement: state.entitlement,
  })
}

function applyCoupon(payload = {}) {
  return previewOrder(payload)
}

function getFamilyInvite() {
  return clone({
    invite: {
      code: 'DEMO88',
      familyName: state.family.name,
      role: 'viewer',
      expiredAt: '2026-05-20 23:59',
    },
  })
}

function createFamilyInvite(payload = {}) {
  return clone({
    inviteCode: 'DEMO88',
    role: payload.role || 'viewer',
    expiredAt: '2026-05-20 23:59',
  })
}

function acceptFamilyInvite() {
  return clone({ accepted: true, familyId: state.family._id })
}

function updateFamilyRole(payload = {}) {
  state.roles = state.roles.map((role) => (role.openid === payload.openid ? { ...role, role: payload.role } : role))
  return clone({ updated: true })
}

function removeFamilyUser(openid) {
  state.roles = state.roles.filter((role) => role.openid !== openid)
  return clone({ removed: true })
}

function buildStats() {
  return {
    members: state.members.length,
    medicines: state.medicines.length,
    illnessRecords: state.illnessRecords.length,
    medicationLogs: state.medicationLogs.length,
    attachments: state.attachments.length,
    reminders: state.reminders.length,
  }
}

function buildUsage() {
  return {
    members: state.members.length,
    sharedUsers: Math.max(0, state.roles.length - 1),
    medicines: state.medicines.length,
    healthRecords: state.illnessRecords.length,
    medicationLogs: state.medicationLogs.length,
    attachments: state.attachments.length,
    aiAssistantMonthly: 8,
    aiImageParseMonthly: 3,
  }
}

function buildParseOutput(imageKind) {
  if (imageKind === 'instruction') {
    return {
      name: '对乙酰氨基酚混悬液',
      instructionText: '示例：请按说明书或医生医嘱确认用法。',
      contraindications: '示例：过敏者禁用，具体以说明书为准。',
    }
  }
  if (imageKind === 'prescription') {
    return {
      doctorDiagnosis: '示例：上呼吸道感染相关记录',
      doctorAdvice: '示例：遵医嘱观察，症状加重及时复诊。',
      summary: '示例处方摘要，需人工确认。',
    }
  }
  if (imageKind === 'examination') {
    return {
      examinationResult: '示例：血常规主要指标待人工确认。',
      summary: '示例检查摘要。',
    }
  }
  return {
    name: '对乙酰氨基酚混悬液',
    specification: '100ml/瓶',
    expireDate: '2026-06-18',
    manufacturer: '示例药业',
    approvalNo: '国药准字示例',
  }
}

function calculateDiscount(price, code) {
  if (!code) {
    return 0
  }
  if (String(code).toUpperCase() === 'FAMILY20') {
    return Math.round(Number(price || 0) * 0.2)
  }
  if (String(code).toUpperCase() === 'HEALTH10') {
    return Math.min(1000, Number(price || 0))
  }
  return 0
}

function newId(type) {
  return `demo-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nowText() {
  const date = new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

module.exports = {
  acceptFamilyInvite,
  applyCoupon,
  assistantQuery,
  confirmAiParseResult,
  createFamilyInvite,
  createOrder,
  deleteIllness,
  deleteMedication,
  deleteMedicine,
  deleteMember,
  exportData,
  exportReport,
  getFamilyInvite,
  getHome,
  getMembershipStatus,
  getPlans,
  listCouponsForUser,
  listFamilyRoles,
  listMyFamilies,
  mockPaymentSuccess,
  parseAttachment,
  previewOrder,
  removeFamilyUser,
  saveAttachment,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
  updateFamilyRole,
}
