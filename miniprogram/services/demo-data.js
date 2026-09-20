const SAFETY_NOTICE =
  '本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。'
const DEFAULT_MEMBERSHIP_PURCHASE_GUIDE = '请输入已有会员兑换码完成权益激活。'

const limits = {
  maxOwnedFamilies: 1,
  maxMembers: 3,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 10,
  aiAssistantMonthly: 10,
  aiImageParseMonthly: 3,
  quickRecordLimit: 3,
  quickRecordPeriod: 'lifetime',
}

const proLimits = {
  maxOwnedFamilies: 3,
  maxMembers: 10,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 100,
  aiAssistantMonthly: 300,
  aiImageParseMonthly: 100,
  quickRecordLimit: 30,
  quickRecordPeriod: 'monthly',
}

const unlimitedLimits = {
  ...proLimits,
  quickRecordLimit: null,
  quickRecordPeriod: 'unlimited',
}

const plans = [
  {
    planId: 'yearly_pro',
    name: '安心版（年度）',
    price: 9900,
    durationDays: 365,
    badge: '推荐',
    sort: 0,
    membershipTier: 'paid',
    benefits: proLimits,
    benefitsText: '最多创建 3 个家庭，适合全家长期记录健康、用药和药箱信息',
  },
  {
    planId: 'monthly_pro',
    name: '安心版（月度）',
    price: 990,
    durationDays: 30,
    badge: '灵活体验',
    sort: 1,
    membershipTier: 'paid',
    benefits: proLimits,
    benefitsText: '最多创建 3 个家庭，适合先体验家庭共享、AI 整理和复诊摘要',
  },
  {
    planId: 'yearly_unlimited',
    name: '畅享版（年度）',
    price: 19900,
    durationDays: 365,
    badge: '年度更划算',
    sort: 2,
    membershipTier: 'unlimited',
    benefits: unlimitedLimits,
    benefitsText: '快速记录不限次数，适合长期持续记录家庭健康变化',
  },
  {
    planId: 'monthly_unlimited',
    name: '畅享版（月度）',
    price: 1990,
    durationDays: 30,
    badge: '不限次数',
    sort: 3,
    membershipTier: 'unlimited',
    benefits: unlimitedLimits,
    benefitsText: '快速记录不限次数，适合长期持续记录家庭健康变化',
  },
  {
    planId: 'unlimited_pro',
    name: '畅享版（年度）',
    price: 19900,
    durationDays: 365,
    badge: '不限次数',
    sort: 99,
    visible: false,
    membershipTier: 'unlimited',
    benefits: unlimitedLimits,
    benefitsText: '历史兑换码兼容套餐',
  },
]

const coupons = []
const demoRedeemCodes = ['XXLIFELAB-TEST-2026', 'XXLIFELAB-UNLIMITED-2026']
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
    publicUserId: '1000000001',
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
    membershipTier: 'free',
    planId: 'free',
    membershipTier: 'free',
    planId: 'free',
  }
  const entitlement = {
    plan: 'free',
    tier: 'free',
    planName: '基础版',
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
    quickRecordHistory: testSeed.illnessRecords
      .filter((item) => item.entrySource === 'quick')
      .map((item) => ({ createdAt: item.createdAt || createdAt })),
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
    ...members.map((member, index) => ({
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
    features: {
      imageParsingEnabled: true,
    },
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
    quickRecordUsage: buildQuickRecordUsage(),
    stats: buildStats(),
  })
}

function listMedicationHistory() {
  return clone({ logs: state.medicationLogs })
}

function updateUserProfile(payload = {}) {
  const user = { ...state.user }
  ;['nickname', 'avatarUrl', 'avatarPreset', 'gender', 'birthday', 'phone', 'email', 'note'].forEach((field) => {
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
  const families = buildFamilyList()
  const ownedFamilyCount = families.filter((family) => family.role === 'owner').length
  const policy = getOwnedFamilyCreationPolicy(families)
  return clone({
    family: state.family,
    entitlement: state.entitlement,
    usage: buildUsage(),
    familyPolicy: {
      ownedFamilyCount,
      maxOwnedFamilies: policy.maxOwnedFamilies,
    },
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
        : '基础版最多创建 1 个家庭，开通会员后可创建多个家庭',
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
      plan: 'free',
      tier: 'free',
      planName: '基础版',
      expireAt: '',
      limits,
    },
    members: [ownerMember],
    medicines: [],
    illnessRecords: [],
    quickRecordHistory: [],
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
    roles: state.roles.map((role) => ({
      roleId: role._id,
      nickname: role.nickname || '已关联家人',
      role: role.role,
      memberId: role.memberId || '',
      joinedAt: role.joinedAt || '',
      isCurrentUser: role.openid === 'demo-owner',
    })),
    pendingInvites: state.invites
      .filter((invite) => invite.status === 'active' && invite.targetMemberId)
      .map(toPublicFamilyInvite),
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
  if (!existing && payload.entrySource === 'quick' && buildQuickRecordUsage().exhausted) {
    throw new Error('快速记录次数已用完，请升级会员')
  }
  const createdAt = existing && existing.createdAt ? existing.createdAt : nowText()
  const record = {
    _id: id || newId('health'),
    entrySource: payload.entrySource || (existing && existing.entrySource) || '',
    createdAt,
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
    quickInputText: payload.quickInputText || '',
    prescriptionText: payload.prescriptionText || '',
    aiStructured: Array.isArray(payload.aiStructured) ? payload.aiStructured : [],
    aiProcessing: payload.aiProcessing !== undefined
      ? Boolean(payload.aiProcessing)
      : Boolean(existing && existing.aiProcessing),
    aiProcessingStatus: payload.aiProcessingStatus !== undefined
      ? String(payload.aiProcessingStatus || '')
      : (existing && existing.aiProcessingStatus) || '',
    aiProcessingStartedAt: payload.aiProcessingStartedAt !== undefined
      ? payload.aiProcessingStartedAt || ''
      : (existing && existing.aiProcessingStartedAt) || '',
    aiProcessingFinishedAt: payload.aiProcessingFinishedAt !== undefined
      ? payload.aiProcessingFinishedAt || ''
      : (existing && existing.aiProcessingFinishedAt) || '',
    aiProcessingError: payload.aiProcessingError !== undefined
      ? payload.aiProcessingError || ''
      : (existing && existing.aiProcessingError) || '',
    status: payload.status || '观察中',
    summary: payload.summary || payload.symptomDescription || '新健康记录',
  }
  if (existing) {
    Object.assign(existing, record)
    syncDemoInitialCourseEvent(record, payload)
    return clone({ id: record._id, mode: 'updated', ...existing })
  }
  state.illnessRecords.unshift(record)
  if (record.entrySource === 'quick') {
    state.quickRecordHistory = Array.isArray(state.quickRecordHistory)
      ? state.quickRecordHistory
      : []
    state.quickRecordHistory.push({ createdAt: record.createdAt })
  }
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
    hospitalName: record.hospitalName || '',
    doctorDiagnosis: record.doctorDiagnosis || '',
    examinationResult: record.examinationResult || '',
    doctorAdvice: record.doctorAdvice || '',
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
  if (record.relatedType === 'illness' && isVisitImageKind(record.imageKind)) {
    const illness = state.illnessRecords.find((item) => item._id === record.relatedId)
    if (illness && !['已恢复', '已关闭'].includes(illness.status) && !illness.endedAt) {
      illness.status = '已就医'
    }
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
    status: 'new',
    createdAt: nowText(),
  }
  state.feedback.unshift(record)
  return clone({ id: record._id, ...record })
}

function parseAttachment(payload = {}) {
  const taskId = newId('ai-task')
  const attachment = state.attachments.find((item) => item._id === payload.attachmentId || item._id === payload.attachmentIds?.[0])
  const output = buildParseOutput(payload.imageKind)
  const appliedToIllness = payload.autoApply
    ? applyAiOutputToIllness(payload.illnessId || (attachment && attachment.relatedId), payload.imageKind, output)
    : false
  if (attachment) {
    attachment.aiStructured = output
    attachment.aiSummary = '已完成图片整理，已自动写入病程'
    attachment.parseStatus = appliedToIllness ? 'confirmed' : 'parsed'
  }
  return clone({
    task: {
      _id: taskId,
      status: appliedToIllness ? 'confirmed' : 'success',
      imageKind: payload.imageKind || '',
      relatedType: payload.relatedType || '',
    },
    output,
    appliedToIllness,
  })
}

function parseIllnessText(payload = {}) {
  const text = String(payload.text || '').trim()
  if (!text) {
    throw new Error('文字内容不能为空')
  }
  const symptomWords = ['发烧', '发热', '咳嗽', '流鼻涕', '鼻塞', '呕吐', '腹泻', '头痛', '乏力', '咽痛']
  const symptoms = symptomWords.filter((word) => text.includes(word))
  const temperatureMatch = text.match(/(?:最高体温|体温|发烧|发热)[^0-9]{0,8}(3[5-9](?:\.\d)?|4[0-2](?:\.\d)?)/)
  const hospitalMatch = text.match(/(?:去了|就诊于|到|在)\s*([^，。；,;]{2,20}(?:医院|诊所|卫生院|门诊))/)
  const output = {
    symptoms,
    temperatureMax: temperatureMatch ? Number(temperatureMatch[1]) : '',
    hospitalName: hospitalMatch ? hospitalMatch[1].trim() : '',
    doctorDiagnosis: '',
    doctorAdvice: '',
    examinationResult: '',
    medicinesText: '',
    summary: text,
  }
  const appliedToIllness = payload.autoApply
    ? applyAiOutputToIllness(payload.illnessId, 'text', output)
    : false
  return clone({
    task: { _id: newId('ai-task'), status: appliedToIllness ? 'confirmed' : 'success', taskType: 'text_parse' },
    output,
    appliedToIllness,
  })
}

function processQuickIllness(payload = {}) {
  const illness = state.illnessRecords.find((item) => item._id === payload.illnessId)
  if (!illness) {
    throw new Error('未找到这次病程')
  }
  illness.aiProcessing = true
  illness.aiProcessingStatus = 'processing'
  illness.aiProcessingError = ''
  const errors = []
  if (payload.includeText !== false && (illness.quickInputText || illness.symptomDescription)) {
    try {
      parseIllnessText({ illnessId: illness._id, text: illness.quickInputText || illness.symptomDescription, autoApply: true })
    } catch (error) {
      errors.push(`文字：${error.message || '整理失败'}`)
    }
  }
  let imageProcessed = 0
  state.attachments
    .filter((item) => item.relatedType === 'illness' && item.relatedId === illness._id && item.parseStatus !== 'confirmed')
    .forEach((attachment) => {
      try {
        parseAttachment({
          illnessId: illness._id,
          attachmentId: attachment._id,
          attachmentIds: [attachment._id],
          fileId: attachment.fileId,
          imageKind: attachment.imageKind,
          relatedType: 'illness',
          autoApply: true,
        })
        imageProcessed += 1
      } catch (error) {
        errors.push(`${attachment.imageKind || '图片'}：${error.message || '整理失败'}`)
      }
    })
  if (illness.prescriptionText) {
    try {
      syncPrescriptionMedicines(illness, illness.prescriptionText)
    } catch (error) {
      errors.push(`药箱同步：${error.message || '同步失败'}`)
    }
  }
  illness.aiProcessing = false
  illness.aiProcessingStatus = errors.length ? 'partial' : 'completed'
  illness.aiProcessingError = errors.join('；')
  illness.aiProcessingFinishedAt = nowText()
  return clone({
    illnessId: illness._id,
    imageProcessed,
    status: illness.aiProcessingStatus,
    error: illness.aiProcessingError,
  })
}

function confirmAiParseResult(payload = {}) {
  const output = payload.output || {}
  applyAiOutputToIllness(payload.illnessId, payload.imageKind || 'text', output)
  return clone({
    taskId: payload.taskId,
    saved: true,
    output,
  })
}

function applyAiOutputToIllness(illnessId, imageKind, output = {}) {
  const illness = state.illnessRecords.find((item) => item._id === illnessId)
  if (!illness) {
    return false
  }
  const fields = imageKind === 'text'
    ? ['symptoms', 'temperatureMax', 'hospitalName', 'doctorDiagnosis', 'doctorAdvice', 'examinationResult', 'medicinesText', 'summary']
    : imageKind === 'medical_record'
      ? ['symptoms', 'doctorDiagnosis', 'doctorAdvice', 'summary']
      : imageKind === 'prescription'
        ? ['symptoms', 'doctorDiagnosis', 'doctorAdvice', 'medicinesText', 'summary']
        : imageKind === 'examination'
          ? ['symptoms', 'examinationResult', 'summary']
          : []
  fields.forEach((field) => {
    const value = output[field]
    if (field === 'symptoms' && Array.isArray(value) && value.length) {
      illness.symptoms = value
    } else if (field === 'temperatureMax' && Number.isFinite(Number(value))) {
      illness.temperatureMax = Number(value)
    } else if (field !== 'symptoms' && field !== 'temperatureMax' && value) {
      illness[field === 'medicinesText' ? 'prescriptionText' : field] = value
    }
  })
  if (isVisitEvidence(imageKind, output) && !['已恢复', '已关闭'].includes(illness.status) && !illness.endedAt) {
    illness.status = '已就医'
  }
  if (output.medicinesText) {
    syncPrescriptionMedicines(illness, output.medicinesText)
  }
  return true
}

function syncPrescriptionMedicines(illness, medicinesText) {
  const candidates = parsePrescriptionMedicineText(medicinesText)
  const medicineIds = []
  candidates.forEach((candidate) => {
    const existing = state.medicines.find((item) => (
      item.memberId === illness.memberId
      && normalizeMedicineMatch(item.name) === normalizeMedicineMatch(candidate.name)
      && normalizeMedicineMatch(item.specification) === normalizeMedicineMatch(candidate.specification)
    ))
    const medicine = existing || {
      _id: newId('medicine'),
      memberId: illness.memberId,
      memberNameSnapshot: getMemberName(illness.memberId),
      name: candidate.name,
      category: '其他',
      tags: ['处方药'],
      specification: candidate.specification,
      packageSize: 0,
      packageUnit: '',
      totalQuantity: 1,
      remainingQuantity: 1,
      unit: '盒',
      expireDate: '',
      location: '家庭药箱',
      source: '处方识别',
      indicationsText: '',
      instructionText: '',
      note: `来自病程处方识别：${candidate.text}`,
    }
    if (!existing) {
      state.medicines.unshift(medicine)
    }
    medicineIds.push(medicine._id)
  })
  const event = state.courseEvents.find((item) => (
    item.illnessRecordId === illness._id && item.source === 'illness_created'
  ))
  if (event && medicineIds.length) {
    const prescribedMedicineIds = Array.from(new Set([
      ...(event.prescribedMedicineIds || []),
      ...medicineIds,
    ]))
    event.eventType = 'visit'
    event.prescribedMedicineIds = prescribedMedicineIds
    event.prescribedMedicines = prescribedMedicineIds.map((medicineId) => {
      const medicine = state.medicines.find((item) => item._id === medicineId)
      return {
        medicineId,
        medicineNameSnapshot: medicine ? medicine.name : '',
        unitSnapshot: medicine ? medicine.unit : '',
      }
    })
  }
  return medicineIds
}

function parsePrescriptionMedicineText(value) {
  return Array.from(new Map(
    String(value || '')
      .split(/[\r\n；;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((text) => text.replace(/^\s*\d+[.、)）]\s*/, '').replace(/^(处方药品|药品|用药情况)\s*[：:]\s*/, ''))
      .map((text) => {
        const nameMatch = text.match(/^([^（(\s：:，,]+)/)
        const name = nameMatch ? nameMatch[1].trim() : text
        const specification = text.slice(name.length).replace(/^[：:，,\s]+/, '').trim()
        return [
          `${normalizeMedicineMatch(name)}|${normalizeMedicineMatch(specification)}`,
          { text, name, specification },
        ]
      }),
  ).values())
}

function normalizeMedicineMatch(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

function isVisitImageKind(imageKind) {
  return ['medical_record', 'examination', 'prescription'].includes(String(imageKind || '').trim())
}

function isVisitEvidence(imageKind, output = {}) {
  if (isVisitImageKind(imageKind)) {
    return true
  }
  return imageKind === 'text'
    && ['hospitalName', 'doctorDiagnosis', 'examinationResult', 'medicinesText']
      .some((field) => String(output[field] || '').trim())
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
  return clone({
    plans,
    membershipPurchaseGuide: DEFAULT_MEMBERSHIP_PURCHASE_GUIDE,
  })
}

function listCouponsForUser() {
  return clone({ coupons })
}

function listOrdersForUser() {
  return clone({ familyId: state.family._id, orders: state.orders || [] })
}

function getOrderForUser(payload = {}) {
  const order = (state.orders || []).find((item) => item.orderId === payload.orderId || item._id === payload.orderId)
  if (!order) throw new Error('订单不存在')
  return clone({ order })
}

function cancelOrderForUser(payload = {}) {
  const order = (state.orders || []).find((item) => item.orderId === payload.orderId || item._id === payload.orderId)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 'pending') throw new Error('只有待支付订单可以取消')
  order.status = 'cancelled'
  return clone({ orderId: order.orderId, status: order.status })
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
    status: 'paid',
    paymentProvider: 'demo',
    createdAt: nowText(),
  }
  state.orders.unshift(order)
  state.entitlement = {
    ...state.entitlement,
    plan: 'pro',
    tier: preview.plan && preview.plan.membershipTier || 'paid',
    planName: preview.plan && preview.plan.name || '安心版',
    limits: preview.plan && preview.plan.benefits || proLimits,
    expireAt: nextYearText(),
  }
  state.family = { ...state.family, plan: 'pro', membershipTier: state.entitlement.tier, planId: preview.planId }
  return clone(order)
}

function mockPaymentSuccess(payload = {}) {
  const order = state.orders.find((item) => item.orderId === payload.orderId)
  if (order) {
    order.status = 'paid'
  }
  state.entitlement = {
    ...state.entitlement,
    plan: 'pro',
    tier: 'paid',
    planName: '安心版',
    limits: proLimits,
    expireAt: nextYearText(),
  }
  state.family = { ...state.family, plan: 'pro', membershipTier: 'paid', planId: 'yearly_pro' }
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
  const isUnlimited = code === 'XXLIFELAB-UNLIMITED-2026'
  const membershipTier = isUnlimited ? 'unlimited' : 'paid'
  const membershipPlan = isUnlimited ? plans.find((item) => item.planId === 'unlimited_pro') : plans[0]
  state.entitlement = {
    ...state.entitlement,
    plan: 'pro',
    tier: membershipTier,
    planName: isUnlimited ? '畅享版' : '安心版',
    limits: isUnlimited ? unlimitedLimits : proLimits,
    expireAt: nextYearText(),
  }
  state.family = {
    ...state.family,
    plan: 'pro',
    membershipTier,
    planId: membershipPlan.planId,
  }
  fillProUsageForTesting()
  return clone({
    subscriptionId: newId('subscription'),
    familyId: state.family._id,
    status: 'active',
    code,
    expireAt: state.entitlement.expireAt,
    plan: membershipPlan,
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
    ...toPublicFamilyInvite(invite),
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
    ...toPublicFamilyInvite(invite),
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
  const target = state.roles.find((role) => role._id === payload.roleId)
  if (!target) {
    throw new Error('家庭角色不存在')
  }
  target.role = payload.role
  return clone({ updated: true })
}

function removeFamilyUser(roleId) {
  const target = state.roles.find((role) => role._id === roleId)
  if (!target) {
    throw new Error('家庭角色不存在')
  }
  state.roles = state.roles.filter((role) => role._id !== roleId)
  return clone({ removed: true })
}

function toPublicFamilyInvite(invite) {
  return {
    inviteId: invite._id,
    inviteCode: invite.inviteCode,
    familyId: invite.familyId,
    familyNameSnapshot: invite.familyNameSnapshot,
    inviterNameSnapshot: invite.inviterNameSnapshot || '家人',
    targetMemberId: invite.targetMemberId || '',
    targetMemberNameSnapshot: invite.targetMemberNameSnapshot || '',
    role: invite.role,
    expiresAt: invite.expiresAt || '',
    privacyNotice: invite.privacyNotice || '',
  }
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
    quickRecord: buildQuickRecordUsage(),
  }
}

function buildQuickRecordUsage() {
  const tier = state.entitlement.tier || (state.entitlement.plan === 'pro' ? 'paid' : 'free')
  const history = Array.isArray(state.quickRecordHistory) ? state.quickRecordHistory : []
  const monthKey = nowText().slice(0, 7)
  const lifetimeUsed = history.length
  const monthlyUsed = history.filter((item) => String(item.createdAt || '').slice(0, 7) === monthKey).length
  const limit = state.entitlement.limits && state.entitlement.limits.quickRecordLimit
  const unlimited = limit === null || tier === 'unlimited'
  const used = tier === 'free' ? lifetimeUsed : monthlyUsed
  return {
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    period: state.entitlement.limits.quickRecordPeriod,
    lifetimeUsed,
    monthlyUsed,
    exhausted: !unlimited && used >= limit,
  }
}

function buildParseOutput(imageKind) {
  if (imageKind === 'medical_record') {
    return {
      symptoms: [],
      doctorDiagnosis: '',
      doctorAdvice: '',
      summary: '',
    }
  }
  if (imageKind === 'instruction') {
    return {
      name: '',
      instructionText: '',
      contraindications: '',
    }
  }
  if (imageKind === 'prescription') {
    return {
      symptoms: [],
      doctorDiagnosis: '',
      doctorAdvice: '',
      summary: '',
    }
  }
  if (imageKind === 'examination') {
    return {
      symptoms: [],
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
    quickRecordHistory: source.quickRecordHistory,
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
      entitlement: space
        ? space.entitlement
        : { plan: 'free', tier: 'free', planName: '基础版', limits },
    }
  })
}

function getOwnedFamilyCreationPolicy(families) {
  const hasProOwnedFamily = families.some(
    (family) =>
      family.role === 'owner' &&
      family.entitlement &&
      !(
        family.entitlement.tier === 'free'
        || family.entitlement.plan === 'free'
        || /免费|基础/.test(String(family.entitlement.planName || ''))
      ),
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
  applyAiOutputToIllness,
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
  listOrdersForUser,
  getOrderForUser,
  cancelOrderForUser,
  listFamilyRoles,
  listMedicationHistory,
  listMyFamilies,
  mockPaymentSuccess,
  parseAttachment,
  parseIllnessText,
  processQuickIllness,
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
