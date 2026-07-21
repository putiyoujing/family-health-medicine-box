const SAFETY_NOTICE =
  '本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。'

const limits = {
  maxOwnedFamilies: 1,
  maxMembers: 3,
  maxSharedUsers: 2,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 10,
  aiAssistantMonthly: 10,
  aiImageParseMonthly: 3,
}

const proLimits = {
  maxOwnedFamilies: 3,
  maxMembers: 10,
  maxSharedUsers: 6,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 100,
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
    benefitsText: '最多创建 3 个家庭，适合全家长期记录健康、用药和药箱信息',
  },
  {
    planId: 'monthly_pro',
    name: '月度会员',
    price: 990,
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
    benefitsText: '最多创建 3 个家庭，适合先体验家庭共享、AI 整理和复诊摘要',
  },
]

const coupons = []
const demoRedeemCodes = ['XXLIFELAB-TEST-2026']
// Keep seeded examples available for development troubleshooting, but start local mock sessions clean.
const SHOW_TEST_SEED_DATA = false
const ALREADY_IN_FAMILY_MESSAGE =
  '你已经在这个家庭中，无需重复加入；请让尚未加入的家人接受邀请'

let state = createDemoState()

function createDemoState() {
  const createdAt = nowText()
  const testSeed = SHOW_TEST_SEED_DATA ? createTestSeedData() : createEmptyTestSeedData()
  const user = {
    _id: 'demo-user-001',
    nickname: '守护者·TEST01',
    avatarUrl: '',
    avatarPreset: 'sprout',
    lowStockThreshold: 25,
    expiryReminderDays: 60,
    gender: '',
    birthday: '',
    phone: '',
    email: '',
    note: '',
  }
  const ownerMember = {
    _id: 'demo-member-owner',
    name: '我',
    relation: '本人',
    gender: '',
    birthday: '',
    allergyHistory: '',
    medicalHistory: '',
    note: '',
    isOwnerProfile: true,
  }
  const family = {
    _id: 'demo-family-001',
    name: '我的家庭健康记录',
    role: 'owner',
    memberCount: 1 + testSeed.members.length,
    createdAt,
    plan: 'free',
  }
  const entitlement = {
    planName: '免费版',
    expireAt: '',
    limits,
  }

  const initialState = {
    family,
    families: [family],
    familyStores: {},
    user,
    entitlement,
    members: [ownerMember, ...testSeed.members],
    medicines: testSeed.medicines,
    illnessRecords: testSeed.illnessRecords,
    courseEvents: testSeed.courseEvents,
    medicationLogs: testSeed.medicationLogs,
    attachments: [],
    reminders: testSeed.reminders,
    roles: [
      { _id: 'demo-role-owner', openid: 'demo-owner', nickname: '我', role: 'owner', memberId: ownerMember._id, joinedAt: createdAt },
    ],
    invites: [],
    orders: [],
    feedback: [],
    aiUsage: {},
  }
  initialState.familyStores[family._id] = snapshotFamilyState(initialState)
  return initialState
}

function createEmptyTestSeedData() {
  return {
    members: [],
    medicines: [],
    illnessRecords: [],
    courseEvents: [],
    medicationLogs: [],
    reminders: [],
  }
}

function fillProUsageForTesting() {
  const ownerMember = state.members.find((item) => item.isOwnerProfile) || state.members[0]
  const ownerRole = state.roles.find((item) => item.role === 'owner') || state.roles[0]
  const members = Array.from({ length: proLimits.maxMembers - 1 }, (_, index) => ({
    _id: `pro-full-member-${index + 1}`,
    name: `测试家人${index + 1}`,
    relation: index === 0 ? '配偶' : '家人',
    gender: '',
    birthday: '',
    allergyHistory: '',
    medicalHistory: '',
    note: '会员满额体验数据',
  }))

  state.members = [ownerMember, ...members]
  state.roles = [
    ownerRole,
    ...members.slice(0, proLimits.maxSharedUsers).map((member, index) => ({
      _id: `pro-full-role-${index + 1}`,
      openid: `pro-full-user-${index + 1}`,
      nickname: member.name,
      role: index === 0 ? 'admin' : 'member',
      memberId: member._id,
      joinedAt: nowText(),
    })),
  ]
  state.medicines = Array.from({ length: 1 }, (_, index) => ({
    _id: `pro-full-medicine-${index + 1}`,
    memberId: members[index % members.length]._id,
    memberNameSnapshot: members[index % members.length].name,
    name: `测试药品 ${index + 1}`,
    category: '会员测试',
    tags: ['测试数据'],
    specification: '10片/盒',
    totalQuantity: 10,
    remainingQuantity: 10,
    unit: '片',
    expireDate: '2027-12-31',
    location: '会员测试药箱',
    source: '演示数据',
    indicationsText: '仅用于会员权益满额展示',
    instructionText: '',
    note: '',
  }))
  state.illnessRecords = Array.from({ length: 1 }, (_, index) => ({
    _id: `pro-full-illness-${index + 1}`,
    memberId: members[index % members.length]._id,
    startedAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')} 09:00`,
    endedAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')} 18:00`,
    symptoms: ['测试记录'],
    symptomDescription: '仅用于会员权益满额展示',
    temperatureMax: '',
    hospitalName: '',
    doctorDiagnosis: '',
    doctorAdvice: '',
    examinationResult: '',
    status: '已关闭',
    summary: `会员测试病程 ${index + 1}`,
  }))
  state.medicationLogs = Array.from({ length: 1 }, (_, index) => ({
    _id: `pro-full-medication-${index + 1}`,
    memberId: members[index % members.length]._id,
    memberNameSnapshot: members[index % members.length].name,
    illnessRecordId: state.illnessRecords[index % state.illnessRecords.length]._id,
    medicineId: state.medicines[index % state.medicines.length]._id,
    medicineNameSnapshot: state.medicines[index % state.medicines.length].name,
    doseQuantity: 1,
    doseUnit: '片',
    takenAt: state.illnessRecords[index % state.illnessRecords.length].startedAt,
    reaction: '',
    note: '会员测试记录',
    remainingQuantityAfter: 9,
  }))
  state.attachments = Array.from({ length: proLimits.maxAttachments }, (_, index) => ({
    _id: `pro-full-attachment-${index + 1}`,
    relatedType: 'illness',
    relatedId: state.illnessRecords[index % state.illnessRecords.length]._id,
    fileType: 'image',
    fileId: `demo://pro-full-attachment-${index + 1}`,
    imageKind: 'report',
    ocrText: '',
    aiSummary: '会员测试附件',
    createdAt: state.illnessRecords[index % state.illnessRecords.length].startedAt,
  }))
  state.courseEvents = []
  state.aiUsage = {
    aiAssistantMonthly: proLimits.aiAssistantMonthly,
    aiImageParseMonthly: proLimits.aiImageParseMonthly,
  }
  state.family.plan = 'pro'
  const additionalFamilies = [2, 3].map((index) => ({
    _id: `pro-full-family-${index}`,
    name: `会员测试家庭 ${index}`,
    role: 'owner',
    memberCount: 1,
    createdAt: nowText(),
    plan: 'pro',
  }))
  state.families = [state.family, ...additionalFamilies]
  for (const family of additionalFamilies) {
    state.familyStores[family._id] = {
      family,
      entitlement: state.entitlement,
      members: [],
      medicines: [],
      illnessRecords: [],
      courseEvents: [],
      medicationLogs: [],
      attachments: [],
      reminders: [],
      roles: [],
      invites: [],
      orders: [],
      feedback: [],
      aiUsage: {},
    }
  }
  syncFamilyStats()
}

function createTestSeedData() {
  const childId = 'test-seed-member-child'
  const elderId = 'test-seed-member-elder'
  const activeIllnessId = 'test-seed-illness-active'
  const closedIllnessId = 'test-seed-illness-closed'
  const childMedicineId = 'test-seed-medicine-child-fever'
  const elderMedicineId = 'test-seed-medicine-elder-cold'

  const members = [
    {
      _id: childId,
      name: '小满',
      relation: '孩子',
      gender: '男',
      birthday: '2019-05-12',
      allergyHistory: '青霉素过敏史待确认',
      medicalHistory: '',
      note: '',
    },
    {
      _id: elderId,
      name: '陈阿姨',
      relation: '母亲',
      gender: '女',
      birthday: '1962-11-03',
      allergyHistory: '',
      medicalHistory: '血压日常观察',
      note: '',
    },
  ]

  const medicines = [
    {
      _id: childMedicineId,
      memberId: childId,
      memberNameSnapshot: '小满',
      name: '儿童退热混悬液',
      category: '常用药',
      tags: ['儿童用药', '退热'],
      specification: '100ml/瓶',
      totalQuantity: 12,
      remainingQuantity: 8,
      unit: 'ml',
      expireDate: '2026-08-05',
      location: '儿童药箱',
      source: '手动录入',
      indicationsText: '用于儿童发热时按医嘱使用',
      instructionText: '一次 4ml，一日 3 次',
      note: '',
    },
    {
      _id: elderMedicineId,
      memberId: elderId,
      memberNameSnapshot: '陈阿姨',
      name: '感冒片',
      category: '常用药',
      tags: ['感冒咳嗽', '低库存关注'],
      specification: '12片/板',
      totalQuantity: 24,
      remainingQuantity: 22,
      unit: '片',
      expireDate: '2027-03-18',
      location: '卧室抽屉',
      source: '手动录入',
      indicationsText: '用于缓解感冒相关症状',
      instructionText: '一次 2 片，一日 3 次',
      note: '',
    },
    {
      _id: 'test-seed-medicine-shared-saline',
      memberId: '',
      memberNameSnapshot: '全家通用',
      name: '生理盐水喷雾',
      category: '鼻腔护理',
      tags: ['全家通用', '鼻腔护理'],
      specification: '50ml/瓶',
      totalQuantity: 2,
      remainingQuantity: 1,
      unit: '瓶',
      expireDate: '2026-12-31',
      location: '客厅药箱',
      source: '手动录入',
      indicationsText: '用于鼻腔清洁护理',
      instructionText: '按需喷鼻，每日 2 至 3 次',
      note: '',
    },
    {
      _id: 'test-seed-medicine-shared-bandage',
      memberId: '',
      memberNameSnapshot: '全家通用',
      name: '创可贴',
      category: '外用',
      tags: ['外用', '常备'],
      specification: '20片/盒',
      totalQuantity: 20,
      remainingQuantity: 18,
      unit: '片',
      expireDate: '2028-01-01',
      location: '客厅药箱',
      source: '手动录入',
      indicationsText: '用于小伤口的临时防护',
      instructionText: '清洁伤口后贴敷，按需更换',
      note: '',
    },
  ]

  const illnessRecords = [
    {
      _id: activeIllnessId,
      memberId: childId,
      startedAt: '2026-07-20 08:10',
      endedAt: '',
      symptoms: ['发热', '咳嗽', '乏力'],
      symptomDescription: '昨晚开始低热，今天上午咳嗽增多。',
      temperatureMax: '38.6',
      hospitalName: '儿童医院',
      doctorDiagnosis: '上呼吸道感染',
      doctorAdvice: '补液、观察体温变化，如症状加重及时复诊。',
      examinationResult: '血常规结果待补充',
      status: '已就医',
      summary: '小满发热就医病程',
    },
    {
      _id: closedIllnessId,
      memberId: elderId,
      startedAt: '2026-06-16 09:00',
      endedAt: '2026-06-20 18:00',
      symptoms: ['鼻塞', '咳嗽'],
      symptomDescription: '季节性受凉后的轻微不适。',
      temperatureMax: '37.4',
      hospitalName: '',
      doctorDiagnosis: '',
      doctorAdvice: '',
      examinationResult: '',
      status: '已关闭',
      summary: '陈阿姨感冒恢复病程',
    },
  ]

  const medicationLogs = [
    {
      _id: 'test-seed-medication-child',
      memberId: childId,
      memberNameSnapshot: '小满',
      illnessRecordId: activeIllnessId,
      medicineId: childMedicineId,
      medicineNameSnapshot: '儿童退热混悬液',
      doseQuantity: 4,
      doseUnit: 'ml',
      takenAt: '2026-07-20 10:30',
      reaction: '服用后精神状态平稳',
      note: '饭后服用',
      remainingQuantityAfter: 8,
    },
    {
      _id: 'test-seed-medication-elder',
      memberId: elderId,
      memberNameSnapshot: '陈阿姨',
      illnessRecordId: closedIllnessId,
      medicineId: elderMedicineId,
      medicineNameSnapshot: '感冒片',
      doseQuantity: 2,
      doseUnit: '片',
      takenAt: '2026-06-16 20:00',
      reaction: '',
      note: '按说明书服用',
      remainingQuantityAfter: 22,
    },
  ]

  const courseEvents = [
    {
      _id: 'test-seed-event-child-symptom',
      illnessRecordId: activeIllnessId,
      memberId: childId,
      eventType: 'symptom',
      recordedAt: '2026-07-20 08:10',
      temperature: '38.2',
      symptoms: ['发热', '咳嗽'],
      note: '首次记录症状。',
      source: 'illness_created',
    },
    {
      _id: 'test-seed-event-child-temperature',
      illnessRecordId: activeIllnessId,
      memberId: childId,
      eventType: 'temperature',
      recordedAt: '2026-07-20 09:30',
      temperature: '38.6',
      symptoms: [],
      note: '体温复测。',
      source: 'manual',
    },
    {
      _id: 'test-seed-event-child-visit',
      illnessRecordId: activeIllnessId,
      memberId: childId,
      eventType: 'visit',
      recordedAt: '2026-07-20 10:00',
      temperature: '',
      symptoms: [],
      prescribedMedicineIds: [childMedicineId],
      prescribedMedicines: [
        { medicineId: childMedicineId, medicineNameSnapshot: '儿童退热混悬液', unitSnapshot: 'ml' },
      ],
      hospitalName: '儿童医院',
      doctorDiagnosis: '上呼吸道感染',
      examinationResult: '血常规结果待补充',
      doctorAdvice: '补液、观察体温变化，如症状加重及时复诊。',
      note: '就诊记录。',
      source: 'manual',
    },
    {
      _id: 'test-seed-event-child-medication',
      illnessRecordId: activeIllnessId,
      memberId: childId,
      medicationLogId: 'test-seed-medication-child',
      eventType: 'medication',
      recordedAt: '2026-07-20 10:30',
      medicineId: childMedicineId,
      medicineNameSnapshot: '儿童退热混悬液',
      doseQuantity: 4,
      doseUnit: 'ml',
      note: '服用后精神状态平稳',
      source: 'medication_log',
    },
    {
      _id: 'test-seed-event-elder-symptom',
      illnessRecordId: closedIllnessId,
      memberId: elderId,
      eventType: 'symptom',
      recordedAt: '2026-06-16 09:00',
      temperature: '37.4',
      symptoms: ['鼻塞', '咳嗽'],
      note: '首次记录症状。',
      source: 'illness_created',
    },
    {
      _id: 'test-seed-event-elder-medication',
      illnessRecordId: closedIllnessId,
      memberId: elderId,
      medicationLogId: 'test-seed-medication-elder',
      eventType: 'medication',
      recordedAt: '2026-06-16 20:00',
      medicineId: elderMedicineId,
      medicineNameSnapshot: '感冒片',
      doseQuantity: 2,
      doseUnit: '片',
      note: '按说明书服用',
      source: 'medication_log',
    },
    {
      _id: 'test-seed-event-elder-completion',
      illnessRecordId: closedIllnessId,
      memberId: elderId,
      eventType: 'note',
      recordedAt: '2026-06-20 18:00',
      temperature: '',
      symptoms: [],
      note: '症状已消退，关闭病程。',
      source: 'illness_completed',
    },
  ]

  const reminders = [
    {
      _id: 'test-seed-reminder-medication',
      memberId: childId,
      memberNameSnapshot: '小满',
      illnessRecordId: activeIllnessId,
      illnessSummarySnapshot: '小满发热就医病程',
      type: 'medication',
      title: '今晚复测体温',
      remindAt: '2026-07-21 20:00',
      remindAtMs: new Date('2026-07-21T20:00:00').getTime(),
      note: '关联进行中病程。',
      status: 'active',
      subscriptionStatus: 'not_requested',
      notificationOpenid: '',
      deliveryStatus: 'not_scheduled',
    },
    {
      _id: 'test-seed-reminder-followup',
      memberId: childId,
      memberNameSnapshot: '小满',
      illnessRecordId: activeIllnessId,
      illnessSummarySnapshot: '小满发热就医病程',
      type: 'follow_up',
      title: '三天后复诊评估',
      remindAt: '2026-07-23 09:30',
      remindAtMs: new Date('2026-07-23T09:30:00').getTime(),
      note: '复诊前评估症状变化。',
      status: 'active',
      subscriptionStatus: 'not_requested',
      notificationOpenid: '',
      deliveryStatus: 'not_scheduled',
    },
    {
      _id: 'test-seed-reminder-completed',
      memberId: elderId,
      memberNameSnapshot: '陈阿姨',
      illnessRecordId: closedIllnessId,
      illnessSummarySnapshot: '陈阿姨感冒恢复病程',
      type: 'stock_check',
      title: '补充常备药',
      remindAt: '2026-06-21 10:00',
      remindAtMs: new Date('2026-06-21T10:00:00').getTime(),
      note: '补充常备药。',
      status: 'completed',
      completedAt: '2026-06-21 10:15',
      subscriptionStatus: 'not_requested',
      notificationOpenid: '',
      deliveryStatus: 'not_scheduled',
    },
  ]

  return { members, medicines, illnessRecords, courseEvents, medicationLogs, reminders }
}

function getHome() {
  syncFamilyStats()
  return clone({
    safetyNotice: SAFETY_NOTICE,
    user: state.user,
    family: {
      ...state.family,
      entitlement: state.entitlement,
    },
    families: buildFamilyList(),
    currentFamilyId: state.family._id,
    members: state.members,
    medicines: state.medicines,
    illnessRecords: state.illnessRecords,
    courseEvents: state.courseEvents,
    medicationLogs: state.medicationLogs.filter((item) => !item.deletedAt),
    attachments: state.attachments,
    reminders: state.reminders,
    entitlement: state.entitlement,
    stats: buildStats(),
  })
}

function listMedicationHistory() {
  return clone({ logs: state.medicationLogs })
}

function updateUserProfile(payload = {}) {
  const user = { ...state.user }
  ;['nickname', 'avatarUrl', 'gender', 'birthday', 'phone', 'email', 'note'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      user[field] = payload[field] || ''
    }
  })
  if (Object.prototype.hasOwnProperty.call(payload, 'lowStockThreshold')) {
    user.lowStockThreshold = normalizeLowStockThreshold(payload.lowStockThreshold)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'expiryReminderDays')) {
    user.expiryReminderDays = normalizeExpiryReminderDays(payload.expiryReminderDays)
  }
  state.user = user
  return clone({ user: state.user })
}

function getMembershipStatus() {
  return clone({
    family: state.family,
    entitlement: state.entitlement,
    usage: buildUsage(),
    plans,
    coupons,
  })
}

function listMyFamilies() {
  persistCurrentFamilyState()
  const families = buildFamilyList()
  const ownedFamilyCount = families.filter((family) => family.role === 'owner').length
  const policy = getOwnedFamilyCreationPolicy(families)
  return clone({
    currentFamilyId: state.family._id,
    families,
    ownedFamilyCount,
    maxOwnedFamilies: policy.maxOwnedFamilies,
    canCreateFamily: ownedFamilyCount < policy.maxOwnedFamilies,
    multiFamilyPlan: policy.plan,
  })
}

function createFamily(payload = {}) {
  const name = String(payload.name || '').trim()
  if (!name) {
    throw new Error('请填写家庭名称')
  }
  if (name.length > 30) {
    throw new Error('家庭名称不能超过 30 个字')
  }
  persistCurrentFamilyState()
  const families = buildFamilyList()
  const ownedFamilyCount = families.filter((family) => family.role === 'owner').length
  const policy = getOwnedFamilyCreationPolicy(families)
  if (ownedFamilyCount >= policy.maxOwnedFamilies) {
    throw new Error(
      policy.plan === 'pro'
        ? '会员最多创建 3 个家庭'
        : '免费版最多创建 1 个家庭，开通会员后可创建多个家庭',
    )
  }

  const createdAt = nowText()
  const family = {
    _id: newId('family'),
    name,
    role: 'owner',
    memberCount: 1,
    createdAt,
    plan: 'free',
  }
  const ownerMember = {
    _id: newId('owner-member'),
    name: state.user.nickname || '我',
    relation: '本人',
    gender: state.user.gender || '',
    birthday: state.user.birthday || '',
    allergyHistory: '',
    medicalHistory: '',
    note: '',
    isOwnerProfile: true,
  }
  const space = {
    family,
    entitlement: {
      planName: '免费版',
      expireAt: '',
      limits,
    },
    members: [ownerMember],
    medicines: [],
    illnessRecords: [],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
    reminders: [],
    roles: [
      {
        _id: newId('owner-role'),
        openid: 'demo-owner',
        nickname: '我',
        role: 'owner',
        memberId: ownerMember._id,
        joinedAt: createdAt,
      },
    ],
    invites: [],
    orders: [],
    feedback: [],
  }
  state.families.push(family)
  state.familyStores[family._id] = space
  loadFamilyState(family._id)
  return clone({
    currentFamilyId: family._id,
    family: {
      ...family,
      entitlement: state.entitlement,
    },
    ownerMemberId: ownerMember._id,
    maxOwnedFamilies: policy.maxOwnedFamilies,
  })
}

function switchFamily(payload = {}) {
  const familyId = String(payload.familyId || payload || '')
  if (!state.familyStores[familyId]) {
    throw new Error('家庭不存在或无权访问')
  }
  persistCurrentFamilyState()
  loadFamilyState(familyId)
  return clone({
    currentFamilyId: familyId,
    family: {
      ...state.family,
      entitlement: state.entitlement,
    },
  })
}

function listFamilyRoles() {
  return clone({
    roles: state.roles,
    pendingInvites: state.invites.filter((invite) => invite.status === 'active' && invite.targetMemberId),
  })
}

function saveMember(payload = {}) {
  const id = payload._id || payload.id
  const existing = id ? state.members.find((item) => item._id === id) : null
  const record = {
    _id: id || newId('member'),
    name: payload.name || '新成员',
    relation: payload.relation || '家人',
    gender: payload.gender || '',
    birthday: payload.birthday || '',
    allergyHistory: payload.allergyHistory || '',
    medicalHistory: payload.medicalHistory || '',
    note: payload.note || '',
  }
  if (existing) {
    Object.assign(existing, record)
    syncFamilyStats()
    return clone({ id: record._id, mode: 'updated', ...existing })
  }
  state.members.unshift(record)
  syncFamilyStats()
  return clone({ id: record._id, ...record })
}

function deleteMember(id) {
  if (state.roles.some((role) => role.role === 'owner' && role.memberId === id)) {
    throw new Error('家庭创建者本人档案不能归档')
  }
  state.members = state.members.filter((item) => item._id !== id)
  state.roles = state.roles.map((role) => (role.memberId === id ? { ...role, memberId: '' } : role))
  state.medicines = state.medicines.map((item) =>
    item.memberId === id ? { ...item, memberId: '', memberNameSnapshot: '全家通用' } : item,
  )
  syncFamilyStats()
  return clone({ id })
}

function saveMedicine(payload = {}) {
  const id = payload._id || payload.id
  const existing = id ? state.medicines.find((item) => item._id === id) : null
  const record = {
    _id: id || newId('medicine'),
    memberId: payload.memberId || '',
    memberNameSnapshot: payload.memberNameSnapshot || getMemberName(payload.memberId) || '全家通用',
    name: payload.name || '未命名药品',
    category: payload.category || '未分类',
    tags: normalizeTags(payload.tags || payload.tagsText),
    specification: payload.specification || '',
    packageSize: Number(payload.packageSize || 0),
    packageUnit: payload.packageUnit || '',
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
  if (existing) {
    Object.assign(existing, record)
    return clone({ id: record._id, mode: 'updated', ...existing })
  }
  state.medicines.unshift(record)
  return clone({ id: record._id, ...record })
}

function deleteMedicine(id) {
  state.medicines = state.medicines.filter((item) => item._id !== id)
  return clone({ id })
}

function saveIllness(payload = {}) {
  const id = payload._id || payload.id
  const existing = id ? state.illnessRecords.find((item) => item._id === id) : null
  const record = {
    _id: id || newId('health'),
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
  if (existing) {
    Object.assign(existing, record)
    syncDemoInitialCourseEvent(record, payload)
    return clone({ id: record._id, mode: 'updated', ...existing })
  }
  state.illnessRecords.unshift(record)
  saveCourseEvent({
    illnessRecordId: record._id,
    memberId: record.memberId,
    eventType: payload.initialEventType || 'symptom',
    recordedAt: record.startedAt,
    temperature: record.temperatureMax || '',
    symptoms: record.symptoms,
    hospitalName: payload.hospitalName || '',
    doctorDiagnosis: payload.doctorDiagnosis || '',
    examinationResult: payload.examinationResult || '',
    doctorAdvice: payload.doctorAdvice || '',
    prescribedMedicineIds: payload.prescribedMedicineIds || [],
    note: payload.initialEventNote || record.symptomDescription || record.summary,
    source: 'illness_created',
  })
  return clone({ id: record._id, ...record })
}

function syncDemoInitialCourseEvent(record, payload = {}) {
  const event = state.courseEvents.find((item) => item.illnessRecordId === record._id && item.source === 'illness_created')
  if (!event) {
    return
  }
  Object.assign(event, {
    memberId: record.memberId,
    eventType: payload.initialEventType || 'symptom',
    recordedAt: record.startedAt,
    temperature: record.temperatureMax || '',
    symptoms: record.symptoms,
    note: payload.initialEventNote || record.symptomDescription || record.summary,
  })
}

function deleteIllness(id) {
  state.illnessRecords = state.illnessRecords.filter((item) => item._id !== id)
  state.courseEvents = state.courseEvents.filter((item) => item.illnessRecordId !== id)
  return clone({ id })
}

function completeIllness(payload = {}) {
  const id = payload.id || payload._id
  const record = state.illnessRecords.find((item) => item._id === id)
  if (!record) {
    throw new Error('未找到这次病程')
  }
  if (record.status === '已恢复' || record.status === '已关闭' || record.endedAt) {
    return clone({ id: record._id, status: '已关闭', endedAt: record.endedAt || '' })
  }
  const endedAt = String(payload.endedAt || nowText()).trim()
  const reviewNote = String(payload.reviewNote || '').trim()
  if (reviewNote.length > 1000) {
    throw new Error('复盘记录不能超过 1000 字')
  }
  record.status = '已关闭'
  record.endedAt = endedAt
  if (reviewNote) {
    state.courseEvents.unshift({
      _id: `completion-${record._id}`,
      illnessRecordId: record._id,
      memberId: record.memberId,
      eventType: 'note',
      recordedAt: endedAt,
      temperature: '',
      symptoms: [],
      note: reviewNote,
      source: 'illness_completed',
    })
  }
  return clone({ id: record._id, status: record.status, endedAt, reviewSaved: !!reviewNote })
}

function saveCourseEvent(payload = {}) {
  const prescribedMedicineIds = Array.from(new Set(
    (Array.isArray(payload.prescribedMedicineIds) ? payload.prescribedMedicineIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ))
  if (prescribedMedicineIds.length > 20) {
    throw new Error('一次就诊最多关联 20 种药品')
  }
  const prescribedMedicineRecords = prescribedMedicineIds.map((id) => {
    const medicine = state.medicines.find((item) => item._id === id)
    if (!medicine) {
      throw new Error('所选处方药品不存在')
    }
    if (medicine.memberId && medicine.memberId !== payload.memberId) {
      throw new Error('所选处方药品不属于当前成员')
    }
    return medicine
  })
  const record = {
    _id: newId('event'),
    illnessRecordId: payload.illnessRecordId || '',
    memberId: payload.memberId || '',
    eventType: payload.eventType || 'note',
    recordedAt: payload.recordedAt || nowText(),
    temperature: payload.temperature || '',
    symptoms: payload.symptoms || [],
    medicineId: payload.medicineId || '',
    medicineNameSnapshot: payload.medicineNameSnapshot || '',
    doseQuantity: payload.doseQuantity || '',
    doseUnit: payload.doseUnit || '',
    prescribedMedicineIds,
    prescribedMedicines: prescribedMedicineRecords.map((item) => ({
      medicineId: item._id,
      medicineNameSnapshot: item.name || '',
      unitSnapshot: item.unit || '',
    })),
    hospitalName: payload.hospitalName || '',
    doctorDiagnosis: payload.doctorDiagnosis || '',
    examinationResult: payload.examinationResult || '',
    doctorAdvice: payload.doctorAdvice || '',
    note: payload.note || '',
    source: payload.source || 'manual',
  }
  state.courseEvents.unshift(record)
  const illness = state.illnessRecords.find((item) => item._id === record.illnessRecordId)
  if (record.eventType === 'visit' && illness) {
    const visitFields = ['hospitalName', 'doctorDiagnosis', 'examinationResult', 'doctorAdvice']
    visitFields.forEach((field) => {
      if (record[field]) {
        illness[field] = record[field]
      }
    })
    if (illness.status !== '已恢复' && illness.status !== '已关闭' && !illness.endedAt) {
      illness.status = '已就医'
    }
  }
  return clone({ id: record._id, illnessStatus: illness ? illness.status : '', ...record })
}

function saveMedication(payload = {}) {
  const id = payload._id || payload.id
  const existing = id ? state.medicationLogs.find((item) => item._id === id) : null
  const medicine = state.medicines.find((item) => item._id === payload.medicineId)
  const member = state.members.find((item) => item._id === payload.memberId)
  const doseQuantity = Number(payload.doseQuantity || 0)
  if (!member || !medicine || !Number.isFinite(doseQuantity) || doseQuantity <= 0) {
    throw new Error('请选择成员、药品并填写大于 0 的剂量')
  }
  if (medicine.memberId && medicine.memberId !== member._id) {
    throw new Error('所选药品不属于当前成员')
  }
  const doseUnit = medicine.unit || ''
  if (payload.doseUnit && payload.doseUnit !== doseUnit) {
    throw new Error('用药单位必须与库存单位一致')
  }

  const previousMedicine = existing
    ? state.medicines.find((item) => item._id === existing.medicineId)
    : null
  if (previousMedicine) {
    previousMedicine.remainingQuantity = Number(previousMedicine.remainingQuantity || 0) + Number(existing.doseQuantity || 0)
  }
  if (doseQuantity > Number(medicine.remainingQuantity || 0)) {
    if (previousMedicine) {
      previousMedicine.remainingQuantity -= Number(existing.doseQuantity || 0)
    }
    throw new Error(`库存不足，当前剩余 ${medicine.remainingQuantity || 0}${doseUnit}`)
  }
  medicine.remainingQuantity = Number(medicine.remainingQuantity || 0) - doseQuantity
  const record = {
    _id: id || newId('medication'),
    memberId: member._id,
    memberNameSnapshot: member.name || '',
    illnessRecordId: payload.illnessRecordId || '',
    medicineId: medicine._id,
    medicineNameSnapshot: medicine.name || '',
    doseQuantity,
    doseUnit,
    takenAt: payload.takenAt || '',
    reaction: payload.reaction || '',
    note: payload.note || '',
    remainingQuantityAfter: medicine.remainingQuantity,
  }
  if (existing) {
    Object.assign(existing, record)
  } else {
    state.medicationLogs.unshift(record)
  }
  state.courseEvents = state.courseEvents.filter((item) => item.medicationLogId !== record._id)
  if (record.illnessRecordId) {
    state.courseEvents.unshift({
      _id: newId('event'),
      illnessRecordId: record.illnessRecordId,
      memberId: record.memberId,
      medicationLogId: record._id,
      eventType: 'medication',
      recordedAt: record.takenAt,
      medicineId: record.medicineId,
      medicineNameSnapshot: record.medicineNameSnapshot,
      doseQuantity: record.doseQuantity,
      doseUnit: record.doseUnit,
      note: record.reaction || record.note,
      source: 'medication_log',
    })
  }
  return clone({ id: record._id, mode: existing ? 'updated' : 'created', ...record })
}

function deleteMedication(id) {
  const record = state.medicationLogs.find((item) => item._id === id)
  if (!record || record.deletedAt) {
    throw new Error('未找到这条用药记录')
  }
  const medicine = state.medicines.find((item) => item._id === record.medicineId)
  if (medicine) {
    medicine.remainingQuantity = Number(medicine.remainingQuantity || 0) + Number(record.doseQuantity || 0)
  }
  record.deletedAt = nowText()
  record.inventoryRestored = !!medicine
  record.inventoryRestoredAt = record.inventoryRestored ? record.deletedAt : ''
  state.courseEvents = state.courseEvents.filter((item) => item.medicationLogId !== id)
  return clone({ id, mode: 'voided', inventoryRestored: record.inventoryRestored })
}

function saveAttachment(payload = {}) {
  const existing = payload.id ? state.attachments.find((item) => item._id === payload.id) : null
  const record = {
    ...(existing || {}),
    _id: payload.id || newId('attachment'),
    relatedType: payload.relatedType || '',
    relatedId: payload.relatedId || '',
    fileType: payload.fileType || 'image',
    fileId: payload.fileId || '',
    imageKind: payload.imageKind || '',
    ocrText: payload.ocrText || '',
    aiSummary: payload.aiSummary || '',
    createdAt: nowText(),
  }
  if (existing) {
    Object.assign(existing, record)
  } else {
    state.attachments.unshift(record)
  }
  return clone({ id: record._id, ...record })
}

function deleteAttachment(id) {
  const exists = state.attachments.some((item) => item._id === id)
  if (!exists) {
    throw new Error('未找到这张图片')
  }
  state.attachments = state.attachments.filter((item) => item._id !== id)
  return clone({ id })
}

function saveReminder(payload = {}) {
  const existing = payload._id
    ? state.reminders.find((item) => item._id === payload._id)
    : null
  if (payload._id && !existing) {
    throw new Error('健康待办不存在')
  }
  if (existing && existing.status === 'completed') {
    throw new Error('已完成的健康待办不能编辑')
  }
  const member = state.members.find((item) => item._id === payload.memberId)
  if (!member) {
    throw new Error('请选择有效的家庭成员')
  }
  const illness = payload.illnessRecordId
    ? state.illnessRecords.find((item) => item._id === payload.illnessRecordId)
    : null
  if (payload.illnessRecordId && !illness) {
    throw new Error('关联病程不存在')
  }
  if (illness && illness.memberId !== member._id) {
    throw new Error('关联病程不属于所选成员')
  }
  const preserveSubscription = Boolean(
    existing &&
      payload.preserveSubscription === true &&
      existing.subscriptionStatus === 'accepted' &&
      ['scheduled', 'sending'].includes(existing.deliveryStatus),
  )
  const notificationAccepted = payload.subscriptionStatus === 'accepted'
  const record = {
    ...(existing || {}),
    _id: existing ? existing._id : newId('reminder'),
    memberId: member._id,
    memberNameSnapshot: member.name || '',
    illnessRecordId: payload.illnessRecordId || '',
    illnessSummarySnapshot: illness ? illness.summary || (illness.symptoms || []).join('、') : '',
    type: payload.type || 'medication',
    title: payload.title || '新待办',
    remindAt: payload.remindAt || '',
    remindAtMs: payload.remindAt ? new Date(String(payload.remindAt).replace(' ', 'T')).getTime() : 0,
    note: payload.note || '',
    status: payload.status || 'active',
    subscriptionStatus: preserveSubscription
      ? existing.subscriptionStatus
      : payload.subscriptionStatus || 'not_requested',
    notificationOpenid: preserveSubscription
      ? existing.notificationOpenid
      : notificationAccepted
        ? 'demo-owner'
        : '',
    deliveryStatus: preserveSubscription
      ? existing.deliveryStatus
      : notificationAccepted
        ? 'scheduled'
        : 'not_scheduled',
  }
  if (existing) {
    Object.assign(existing, record)
  } else {
    state.reminders.unshift(record)
  }
  return clone({ id: record._id, ...record })
}

function completeReminder(id) {
  const reminder = state.reminders.find((item) => item._id === id)
  if (!reminder) {
    throw new Error('健康待办不存在')
  }
  reminder.status = 'completed'
  if (['scheduled', 'sending'].includes(reminder.deliveryStatus)) {
    reminder.deliveryStatus = 'cancelled'
  }
  reminder.completedAt = nowText()
  return clone({ id, mode: 'completed' })
}

function deleteReminder(id) {
  const exists = state.reminders.some((item) => item._id === id)
  if (!exists) {
    throw new Error('健康待办不存在')
  }
  state.reminders = state.reminders.filter((item) => item._id !== id)
  return clone({ id, mode: 'deleted' })
}

function saveFeedback(payload = {}) {
  const record = {
    _id: newId('feedback'),
    type: payload.type || '建议',
    content: payload.content || '',
    contact: payload.contact || '',
    status: 'new',
    createdAt: nowText(),
  }
  state.feedback.unshift(record)
  return clone({ id: record._id, ...record })
}

function parseAttachment(payload = {}) {
  const taskId = newId('ai-task')
  return clone({
    task: {
      _id: taskId,
      status: 'success',
      imageKind: payload.imageKind || '',
      relatedType: payload.relatedType || '',
    },
    output: buildParseOutput(payload.imageKind),
  })
}

function confirmAiParseResult(payload = {}) {
  return clone({
    taskId: payload.taskId,
    saved: true,
    output: payload.output || {},
  })
}

function assistantQuery(question) {
  const normalized = String(question || '').trim().toLowerCase()
  if (hasAny(normalized, ['肺炎', '诊断', '是不是', '该吃', '剂量', '换药', '停药'])) {
    return clone({
      intent: '医疗诊断或处方风险',
      answer: '这个问题涉及诊断、处方或剂量判断，系统不能替代医生回答。你可以补充医生医嘱、检查单或历史记录，我可以帮你整理成复诊沟通摘要。',
      facts: ['已触发医疗安全边界，未给出诊断或用药建议。'],
      safetyNotice: SAFETY_NOTICE,
    })
  }

  if (hasAny(normalized, ['过期', '到期', '有效期'])) {
    const medicines = state.medicines.filter((medicine) => daysUntil(medicine.expireDate) <= 60)
    return clone({
      intent: '药品有效期查询',
      answer: medicines.length ? `当前有 ${medicines.length} 个药品在 60 天内到期或已过期。` : '当前没有 60 天内到期的药品记录。',
      facts: medicines.map(formatMedicineFact),
      safetyNotice: SAFETY_NOTICE,
    })
  }

  if (hasAny(normalized, ['药箱', '退烧', '退热', '有没有药', '还剩什么药'])) {
    const medicines = findMentionedMedicines(normalized)
    return clone({
      intent: '药箱记录查询',
      answer: medicines.length ? `根据家庭药箱记录，找到 ${medicines.length} 个相关药品。` : '没有找到相关药品记录，请检查药品名称或分类。',
      facts: medicines.map(formatMedicineFact),
      safetyNotice: SAFETY_NOTICE,
    })
  }

  const member = findMentionedMember(normalized)
  const illnessRecords = state.illnessRecords
    .filter((record) => !member || record.memberId === member._id)
    .sort((left, right) => String(right.startedAt || '').localeCompare(String(left.startedAt || '')))
  const latest = illnessRecords[0]

  if (member) {
    if (!latest) {
      return clone({
        intent: '成员病程查询',
        answer: `没有找到${member.name}的健康记录。`,
        facts: [],
        safetyNotice: SAFETY_NOTICE,
      })
    }
    const facts = [
      `记录时间：${latest.startedAt || '未记录时间'}`,
      `主要症状：${(latest.symptoms || []).join('、') || '未填写'}`,
      `当前状态：${latest.status || '未填写'}${latest.temperatureMax ? `，最高体温 ${latest.temperatureMax}℃` : ''}`,
    ]
    if (latest.doctorDiagnosis) {
      facts.push(`就诊记录：${latest.hospitalName || '未记录医院'}，医生诊断 ${latest.doctorDiagnosis}`)
    }
    state.medicationLogs
      .filter((log) => log.illnessRecordId === latest._id && !log.deletedAt)
      .forEach((log) => facts.push(`关联用药：${log.takenAt || '未记录时间'} 使用 ${log.medicineNameSnapshot || '未命名药品'} ${log.doseQuantity || 0}${log.doseUnit || ''}`))

    return clone({
      intent: `${member.name}的病程记录`,
      answer: `${member.name}上次记录是 ${latest.startedAt || '未记录时间'}：${(latest.symptoms || []).join('、') || '症状未填写'}。${latest.symptomDescription || ''}`,
      facts,
      safetyNotice: SAFETY_NOTICE,
    })
  }

  return clone({
    intent: '家庭健康记录检索',
    answer: latest
      ? `最近一条健康记录是 ${latest.startedAt || '未记录时间'}：${(latest.symptoms || []).join('、') || '症状未填写'}。`
      : '当前还没有健康记录。',
    facts: latest ? [`状态：${latest.status || '未填写'}，最高体温：${latest.temperatureMax || '未记录'}`] : [],
    safetyNotice: SAFETY_NOTICE,
  })
}

function exportReport(payload = {}) {
  if (!payload.illnessRecordId) {
    throw new Error('请从病程详情中生成复诊摘要')
  }
  return exportIllnessReport(payload)
}

function exportIllnessReport(payload = {}) {
  const illness = state.illnessRecords.find((item) => item._id === payload.illnessRecordId)
  if (!illness) {
    return clone({ reportText: '未找到这次病程。' })
  }
  const member = state.members.find((item) => item._id === illness.memberId) || {}
  const events = state.courseEvents
    .filter((item) => item.illnessRecordId === illness._id)
    .sort((a, b) => String(a.recordedAt || '').localeCompare(String(b.recordedAt || '')))
  const logs = state.medicationLogs
    .filter((item) => item.illnessRecordId === illness._id)
    .sort((a, b) => String(a.takenAt || '').localeCompare(String(b.takenAt || '')))
  const attachments = state.attachments.filter((item) => item.relatedType === 'illness' && item.relatedId === illness._id)
  const questions = String(payload.doctorQuestions || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const illnessLines = [
    reportField('开始时间', illness.startedAt),
    reportField('当前状态', illness.status),
    reportField('主要症状', (illness.symptoms || []).join('、')),
    reportField('最高体温', illness.temperatureMax),
    reportField('症状描述', illness.symptomDescription),
  ].filter(Boolean)
  const memberLines = [
    reportField('成员', member.name),
    reportField('关系', member.relation),
    reportField('出生日期', member.birthday),
    reportField('过敏史', member.allergyHistory),
    reportField('既往史', member.medicalHistory),
  ].filter(Boolean)
  const visitLines = [
    reportField('医院/机构', illness.hospitalName),
    reportField('医生诊断', illness.doctorDiagnosis),
    reportField('检查结果', illness.examinationResult),
    reportField('医嘱', illness.doctorAdvice),
    attachments.length ? reportField('附件数量', attachments.length) : '',
  ].filter(Boolean)
  const lines = [
    `# ${member.name || '家人'}本次病程复诊摘要`,
    '',
    '## 本次病程',
    ...(illnessLines.length ? illnessLines : ['暂无病程详情']),
    '',
    '## 想问医生的问题',
    ...(questions.length ? questions.map((item, index) => `${index + 1}. ${item}`) : ['暂无补充问题']),
    '',
    '## 时间线',
    ...(events.length ? events.map((item, index) => `${index + 1}. ${formatDemoEvent(item)}`) : ['暂无追加事件']),
    '',
    '## 用药记录',
    ...(logs.length
      ? logs.map(
          (item, index) =>
            `${index + 1}. ${item.takenAt || '未记录时间'} - ${item.medicineNameSnapshot || '未命名药品'} - ${item.doseQuantity || 0}${item.doseUnit || ''} - ${item.reaction || '暂无反应记录'}`,
        )
      : ['暂无用药记录']),
    '',
    '## 检查/诊断/医嘱',
    ...(visitLines.length ? visitLines : ['暂无相关记录']),
    '',
    '## 基础信息',
    ...(memberLines.length ? memberLines : ['暂无成员资料']),
    '',
    '## 安全提示',
    SAFETY_NOTICE,
  ]
  return clone({ reportText: lines.join('\n') })
}

function reportField(label, value) {
  return value === undefined || value === null || value === '' ? '' : `- ${label}：${value}`
}

function formatDemoEvent(item) {
  const labels = {
    symptom: '症状变化',
    temperature: '体温记录',
    medication: '用药记录',
    visit: '就诊',
    exam: '检查',
    note: '备注',
  }
  return [
    item.recordedAt || '未记录时间',
    item.source === 'illness_completed' ? '恢复复盘' : labels[item.eventType] || '记录',
    item.temperature ? `${item.temperature}℃` : '',
    item.symptoms && item.symptoms.length ? item.symptoms.join('、') : '',
    item.medicineNameSnapshot ? `${item.medicineNameSnapshot} ${item.doseQuantity || 0}${item.doseUnit || ''}` : '',
    item.note || '',
  ]
    .filter(Boolean)
    .join(' - ')
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
    orderNo: `TEST${Date.now()}`,
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
    limits: proLimits,
    expireAt: nextYearText(),
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

function redeemMembershipCode(payload = {}) {
  const code = String(payload.code || payload.couponCode || payload.redeemCode || '').trim().toUpperCase()
  if (!code) {
    throw new Error('请输入会员兑换码')
  }
  if (!demoRedeemCodes.includes(code)) {
    throw new Error('当前没有可用的演示兑换码')
  }
  state.entitlement = {
    ...state.entitlement,
    planName: '家庭专业版',
    limits: proLimits,
    expireAt: nextYearText(),
  }
  fillProUsageForTesting()
  return clone({
    subscriptionId: newId('subscription'),
    familyId: state.family._id,
    status: 'active',
    code,
    expireAt: state.entitlement.expireAt,
    plan: plans[0],
  })
}

function getFamilyInvite(payload = {}) {
  const inviteCode = String(payload.inviteCode || payload.code || '').trim().toUpperCase()
  const invite = state.invites.find((item) => item.inviteCode === inviteCode && item.status === 'active')
  if (!invite) {
    throw new Error('邀请不存在或已失效')
  }
  if (!invite.targetMemberId) {
    throw new Error('邀请未关联家庭成员，请联系创建者重新邀请')
  }
  const openid = String(payload.openid || 'demo-owner')
  const canAccept = invite.inviterOpenid !== openid && !state.roles.some((role) => role.openid === openid)
  return clone({
    ...invite,
    canAccept,
    acceptBlockedReason: canAccept ? '' : ALREADY_IN_FAMILY_MESSAGE,
  })
}

function createFamilyInvite(payload = {}) {
  const targetMemberId = String(payload.targetMemberId || '')
  const role = payload.role || 'viewer'
  if (!targetMemberId) {
    throw new Error('请先选择要关联的家庭成员')
  }
  if (!state.entitlement.limits.sharedRoles.includes(role)) {
    throw new Error('当前版本不支持邀请该角色，请开通会员后再试')
  }
  const targetMember = targetMemberId
    ? state.members.find((member) => member._id === targetMemberId)
    : null
  if (targetMemberId && !targetMember) {
    throw new Error('家庭成员不存在')
  }
  if (targetMemberId && state.roles.some((role) => role.memberId === targetMemberId)) {
    throw new Error('该成员已经关联微信账号')
  }
  if (targetMemberId && state.invites.some(
    (invite) => invite.status === 'active' && invite.targetMemberId === targetMemberId,
  )) {
    throw new Error('该成员已有待接受邀请')
  }
  const sharedUsers = state.roles.filter((item) => item.role !== 'owner').length
  const activeInvites = state.invites.filter((invite) => invite.status === 'active').length
  if (sharedUsers + activeInvites >= state.entitlement.limits.maxSharedUsers) {
    throw new Error(`共享成员已达到 ${state.entitlement.limits.maxSharedUsers} 人上限`)
  }
  const invite = {
    _id: newId('invite'),
    inviteCode: `TEST${String(state.invites.length + 1).padStart(2, '0')}`,
    familyId: state.family._id,
    familyNameSnapshot: state.family.name,
    inviterOpenid: String(payload.inviterOpenid || 'demo-owner'),
    inviterNameSnapshot: state.user.nickname || '家人',
    targetMemberId,
    targetMemberNameSnapshot: targetMember ? targetMember.name : '',
    role,
    status: 'active',
    expiresAt: '',
    privacyNotice: '加入后，对方将能够根据角色权限查看或编辑该家庭空间内的家庭健康记录。',
  }
  state.invites.push(invite)
  return clone({
    ...invite,
    path: `/pages/family/accept?code=${invite.inviteCode}`,
  })
}

function acceptFamilyInvite(payload = {}) {
  const inviteCode = String(payload.inviteCode || payload.code || '').trim().toUpperCase()
  const invite = state.invites.find((item) => item.inviteCode === inviteCode && item.status === 'active')
  if (!invite) {
    throw new Error('邀请不存在或已失效')
  }
  const openid = String(payload.openid || 'demo-owner')
  const existingRole = state.roles.find((role) => role.openid === openid)
  if (invite.inviterOpenid === openid || existingRole) {
    throw new Error(ALREADY_IN_FAMILY_MESSAGE)
  }
  if (invite.targetMemberId && state.roles.some(
    (role) => role.openid !== openid && role.memberId === invite.targetMemberId,
  )) {
    throw new Error('该成员已经关联其他微信账号')
  }
  state.roles.push({
    _id: newId('role'),
    openid,
    nickname: invite.targetMemberNameSnapshot || '受邀家人',
    role: invite.role,
    memberId: invite.targetMemberId || '',
    joinedAt: nowText(),
  })
  invite.status = 'accepted'
  return clone({
    accepted: true,
    familyId: state.family._id,
    memberId: invite.targetMemberId || '',
  })
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
    medicationLogs: state.medicationLogs.filter((item) => !item.deletedAt).length,
    attachments: state.attachments.length,
    reminders: state.reminders.length,
  }
}

function buildUsage() {
  return {
    members: state.members.length,
    sharedUsers: Math.max(0, state.roles.length - 1),
    attachments: state.attachments.length,
    aiAssistantMonthly: Number((state.aiUsage || {}).aiAssistantMonthly || 0),
    aiImageParseMonthly: Number((state.aiUsage || {}).aiImageParseMonthly || 0),
  }
}

function buildParseOutput(imageKind) {
  if (imageKind === 'instruction') {
    return {
      name: '',
      instructionText: '',
      contraindications: '',
    }
  }
  if (imageKind === 'prescription') {
    return {
      doctorDiagnosis: '',
      doctorAdvice: '',
      summary: '',
    }
  }
  if (imageKind === 'examination') {
    return {
      examinationResult: '',
      summary: '',
    }
  }
  return {
    name: '',
    specification: '',
    expireDate: '',
    manufacturer: '',
    approvalNo: '',
  }
}

function calculateDiscount(price, code) {
  if (!code) {
    return 0
  }
  const coupon = coupons.find((item) => item.code === String(code).toUpperCase())
  if (!coupon) {
    return 0
  }
  if (coupon.discountType === 'percent') {
    return Math.round(Number(price || 0) * (Number(coupon.discountValue || 0) / 100))
  }
  if (coupon.discountType === 'amount') {
    return Math.min(Number(coupon.discountValue || 0), Number(price || 0))
  }
  return 0
}

function findMentionedMember(question) {
  return (
    state.members.find((member) => member.name && question.includes(member.name.toLowerCase())) ||
    state.members.find((member) => member.relation && question.includes(member.relation.toLowerCase())) ||
    null
  )
}

function findMentionedMedicines(question) {
  const terms = hasAny(question, ['退烧', '退热', '发热']) ? ['退烧', '退热', '发热'] : []
  if (!terms.length) {
    return state.medicines
  }
  return state.medicines.filter((medicine) => {
    const text = [medicine.name, medicine.category, medicine.location, medicine.indicationsText, ...(medicine.tags || [])]
      .join(' ')
      .toLowerCase()
    return terms.some((term) => text.includes(term))
  })
}

function formatMedicineFact(medicine) {
  return `${medicine.name}：剩余 ${medicine.remainingQuantity || 0}${medicine.unit || ''}，有效期 ${medicine.expireDate || '未记录'}，位置 ${medicine.location || '未记录'}`
}

function daysUntil(dateValue) {
  if (!dateValue) {
    return Number.POSITIVE_INFINITY
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateValue)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function normalizeTags(value) {
  const tags = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  return Array.from(new Set(tags))
}

function normalizeLowStockThreshold(value) {
  const threshold = Number(value)
  return [10, 20, 25, 30, 50].includes(threshold) ? threshold : 25
}

function normalizeExpiryReminderDays(value) {
  const days = Number(value)
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 60
}

function getMemberName(memberId) {
  const member = state.members.find((item) => item._id === memberId)
  return member ? member.name : ''
}

function syncFamilyStats() {
  state.family.memberCount = state.members.length
  state.families = state.families.map((family) =>
    family._id === state.family._id ? { ...family, ...state.family } : family,
  )
}

function snapshotFamilyState(source) {
  return {
    family: source.family,
    entitlement: source.entitlement,
    members: source.members,
    medicines: source.medicines,
    illnessRecords: source.illnessRecords,
    courseEvents: source.courseEvents,
    medicationLogs: source.medicationLogs,
    attachments: source.attachments,
    reminders: source.reminders,
    roles: source.roles,
    invites: source.invites,
    orders: source.orders,
    feedback: source.feedback,
    aiUsage: source.aiUsage,
  }
}

function persistCurrentFamilyState() {
  syncFamilyStats()
  state.familyStores[state.family._id] = snapshotFamilyState(state)
}

function loadFamilyState(familyId) {
  const space = state.familyStores[familyId]
  if (!space) {
    throw new Error('家庭不存在或无权访问')
  }
  for (const [key, value] of Object.entries(space)) {
    state[key] = value
  }
  state.user.currentFamilyId = familyId
  syncFamilyStats()
}

function buildFamilyList() {
  return state.families.map((family) => {
    const space = family._id === state.family._id
      ? state
      : state.familyStores[family._id]
    return {
      ...family,
      entitlement: space ? space.entitlement : { planName: '免费版', limits },
    }
  })
}

function getOwnedFamilyCreationPolicy(families) {
  const hasProOwnedFamily = families.some(
    (family) =>
      family.role === 'owner' &&
      family.entitlement &&
      family.entitlement.planName !== '免费版',
  )
  return {
    plan: hasProOwnedFamily ? 'pro' : 'free',
    maxOwnedFamilies: hasProOwnedFamily ? 3 : 1,
  }
}

function newId(type) {
  return `test-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function nextYearText() {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

module.exports = {
  acceptFamilyInvite,
  applyCoupon,
  assistantQuery,
  completeIllness,
  completeReminder,
  confirmAiParseResult,
  createFamily,
  createFamilyInvite,
  createOrder,
  deleteIllness,
  deleteMedication,
  deleteMedicine,
  deleteMember,
  deleteReminder,
  deleteAttachment,
  exportReport,
  getFamilyInvite,
  getHome,
  getMembershipStatus,
  getPlans,
  listCouponsForUser,
  listFamilyRoles,
  listMedicationHistory,
  listMyFamilies,
  mockPaymentSuccess,
  parseAttachment,
  previewOrder,
  redeemMembershipCode,
  removeFamilyUser,
  saveAttachment,
  saveCourseEvent,
  saveFeedback,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
  switchFamily,
  updateFamilyRole,
  updateUserProfile,
}
