const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const {
  MODEL: DEEPSEEK_VISION_MODEL,
  callDeepSeekVision,
  callDeepSeekText,
  detectImageMimeType,
} = require('./deepseek-vision')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database({
  throwOnNotFound: false,
})
const _ = db.command

const SAFETY_NOTICE =
  '本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。'

const COLLECTIONS = {
  members: 'family_members',
  medicines: 'medicines',
  illness: 'illness_records',
  courseEvents: 'course_events',
  medication: 'medication_logs',
  attachments: 'attachments',
  reminders: 'reminders',
  feedback: 'feedback',
}

const VIEW_ROLES = ['owner', 'admin', 'member', 'viewer']
const EDIT_ROLES = ['owner', 'admin', 'member']
const MANAGE_ROLES = ['owner', 'admin']
const IMAGE_KINDS = ['medical_record', 'medicine_box', 'instruction', 'prescription', 'examination']
const VISIT_IMAGE_KINDS = ['medical_record', 'examination', 'prescription']
const FREE_MAX_OWNED_FAMILIES = 1
const PRO_MAX_OWNED_FAMILIES = 3
const ALREADY_IN_FAMILY_MESSAGE =
  '你已经在这个家庭中，无需重复加入；请让尚未加入的家人接受邀请'

const FREE_LIMITS = {
  maxOwnedFamilies: FREE_MAX_OWNED_FAMILIES,
  maxMembers: 3,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 10,
  aiImageParseMonthly: 3,
  aiAssistantMonthly: 10,
  familyMonthlyReport: false,
  quickRecordLimit: 3,
  quickRecordPeriod: 'lifetime',
}

const PRO_LIMITS = {
  maxOwnedFamilies: PRO_MAX_OWNED_FAMILIES,
  maxMembers: 10,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxAttachments: 100,
  aiImageParseMonthly: 100,
  aiAssistantMonthly: 300,
  familyMonthlyReport: true,
  quickRecordLimit: 30,
  quickRecordPeriod: 'monthly',
}

const UNLIMITED_LIMITS = {
  ...PRO_LIMITS,
  quickRecordLimit: null,
  quickRecordPeriod: 'unlimited',
}

const MEMBERSHIP_TIER_NAMES = {
  free: '基础版',
  paid: '安心版',
  unlimited: '畅享版',
}

const QUOTA_RULES = {
  members: {
    collection: 'family_members',
    limitKey: 'maxMembers',
    label: '家庭成员',
  },
  attachments: {
    collection: 'attachments',
    limitKey: 'maxAttachments',
    label: '附件',
  },
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action
  const payload = event.payload || {}
  const familyId = event.familyId || payload.familyId || ''

  try {
    if (!openid) {
      throw new Error('用户身份未就绪，请重新登录后再试')
    }
    switch (action) {
      case 'getHome':
        return ok(await getHome(openid, familyId))
      case 'getDashboardSummary':
        return ok(await getDashboardSummary(openid, familyId))
      case 'getProfileBootstrap':
        return ok(await getProfileBootstrap(openid, familyId))
      case 'updateUserProfile':
        return ok(await updateUserProfile(openid, payload))
      case 'listMyFamilies':
        return ok(await listMyFamilies(openid))
      case 'switchFamily':
        return ok(await switchFamily(openid, payload.familyId || familyId))
      case 'createFamily':
        return ok(await createFamily(openid, payload))
      case 'getMembershipStatus':
      case 'getEntitlement':
        return ok(await getMembershipStatus(openid, familyId))
      case 'getFamilyInvite':
        return ok(await getFamilyInvite(openid, payload.inviteCode || payload.code))
      case 'createFamilyInvite':
        return ok(await createFamilyInvite(openid, familyId, payload))
      case 'acceptFamilyInvite':
        return ok(await acceptFamilyInvite(openid, payload.inviteCode || payload.code))
      case 'listFamilyRoles':
        return ok(await listFamilyRoles(openid, familyId))
      case 'updateFamilyRole':
        return ok(await updateFamilyRole(openid, familyId, payload))
      case 'removeFamilyUser':
        return ok(await removeFamilyUser(openid, familyId, payload))
      case 'saveMember':
        return ok(await saveRecord(openid, familyId, 'members', payload))
      case 'deleteMember':
        return ok(await archiveMember(openid, familyId, payload.id))
      case 'saveMedicine':
        return ok(await saveRecord(openid, familyId, 'medicines', payload))
      case 'deleteMedicine':
        return ok(await deleteRecord(openid, familyId, 'medicines', payload.id))
      case 'saveIllness':
        return ok(await saveIllness(openid, familyId, payload))
      case 'completeIllness':
        return ok(await completeIllness(openid, familyId, payload))
      case 'deleteIllness':
        return ok(await deleteRecord(openid, familyId, 'illness', payload.id))
      case 'saveCourseEvent':
        return ok(await saveCourseEvent(openid, familyId, payload))
      case 'deleteCourseEvent':
        return ok(await deleteRecord(openid, familyId, 'courseEvents', payload.id))
      case 'saveMedication':
        return ok(await saveMedication(openid, familyId, payload))
      case 'listMedicationHistory':
        return ok(await listMedicationHistory(openid, familyId))
      case 'deleteMedication':
        return ok(await deleteMedication(openid, familyId, payload.id))
      case 'saveAttachment':
        return ok(await saveAttachment(openid, familyId, payload))
      case 'deleteAttachment':
        return ok(await deleteRecord(openid, familyId, 'attachments', payload.id))
      case 'saveReminder':
        return ok(await saveReminder(openid, familyId, payload))
      case 'completeReminder':
        return ok(await completeReminder(openid, familyId, payload.id))
      case 'deleteReminder':
        return ok(await deleteRecord(openid, familyId, 'reminders', payload.id))
      case 'saveFeedback':
        return ok(await saveFeedback(openid, familyId, payload))
      case 'parseAttachment':
        return ok(await parseAttachment(openid, familyId, payload))
      case 'parseIllnessText':
        return ok(await parseIllnessText(openid, familyId, payload))
      case 'processQuickIllness':
        return ok(await processQuickIllness(openid, familyId, payload))
      case 'getAiTask':
        return ok(await getAiTask(openid, familyId, payload.taskId))
      case 'confirmAiParseResult':
        return ok(await confirmAiParseResult(openid, familyId, payload))
      case 'exportReport':
        return ok(await exportReport(openid, familyId, payload))
      default:
        return fail(`unknown action: ${action || 'empty'}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'server error')
  }
}

async function getHome(openid, familyId) {
  const { user, familyList, family, targetFamilyId } = await getFamilyContext(openid, familyId)
  if (!family) {
    if (targetFamilyId) {
      throw new Error('family not found or no permission')
    }
    return buildEmptyHome(user, familyList)
  }
  const currentFamilyId = family._id
  const [members, medicines, illnessRecords, courseEvents, medicationLogs, attachments, reminders, familyListResult] =
    await Promise.all([
      listByFamily('family_members', currentFamilyId),
      listByFamily('medicines', currentFamilyId),
      listByFamily('illness_records', currentFamilyId),
      listByFamily('course_events', currentFamilyId),
      listByFamily('medication_logs', currentFamilyId),
      listByFamily('attachments', currentFamilyId),
      listByFamily('reminders', currentFamilyId),
      Promise.resolve(familyList),
    ])
  const quickRecordUsage = await buildQuickRecordUsage(currentFamilyId, family.entitlement)

  return {
    safetyNotice: SAFETY_NOTICE,
    features: {
      imageParsingEnabled: isImageParsingConfigured(),
    },
    user: publicUser(user),
    family,
    families: familyListResult.families,
    currentFamilyId: family._id,
    members,
    medicines,
    illnessRecords,
    courseEvents,
    medicationLogs,
    attachments,
    reminders,
    entitlement: family.entitlement,
    quickRecordUsage,
    stats: {
      members: members.length,
      medicines: medicines.length,
      illnessRecords: illnessRecords.length,
      courseEvents: courseEvents.length,
      medicationLogs: medicationLogs.length,
      attachments: attachments.length,
      reminders: reminders.length,
    },
  }
}

async function updateUserProfile(openid, payload) {
  const user = await getUser(openid)
  const data = {
    updatedAt: db.serverDate(),
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'nickname')) {
    data.nickname = String(payload.nickname || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'avatarUrl')) {
    data.avatarUrl = String(payload.avatarUrl || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'gender')) {
    data.gender = normalizeProfileGender(payload.gender)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'birthday')) {
    data.birthday = normalizeProfileBirthday(payload.birthday)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
    data.phone = String(payload.phone || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    data.email = String(payload.email || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'note')) {
    data.note = String(payload.note || '').trim()
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lowStockThreshold')) {
    data.lowStockThreshold = normalizeLowStockThreshold(payload.lowStockThreshold)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'expiryReminderDays')) {
    data.expiryReminderDays = normalizeExpiryReminderDays(payload.expiryReminderDays)
  }
  await db.collection('users').doc(user._id).update({ data })
  return {
    user: {
      ...publicUser(user),
      ...data,
      updatedAt: new Date().toISOString(),
    },
  }
}

function publicUser(user) {
  return {
    _id: user._id,
    publicUserId: user.publicUserId || '',
    nickname: user.nickname || '',
    avatarUrl: user.avatarUrl || '',
    avatarPreset: user.avatarPreset || '',
    gender: user.gender || '',
    birthday: user.birthday || '',
    phone: user.phone || '',
    email: user.email || '',
    note: user.note || '',
    lowStockThreshold: normalizeLowStockThreshold(user.lowStockThreshold),
    expiryReminderDays: normalizeExpiryReminderDays(user.expiryReminderDays),
    currentFamilyId: user.currentFamilyId || '',
  }
}

function normalizeProfileGender(value) {
  const gender = String(value || '').trim()
  if (!['', 'male', 'female', 'other'].includes(gender)) {
    throw new Error('gender is invalid')
  }
  return gender
}

function normalizeProfileBirthday(value) {
  const birthday = String(value || '').trim()
  if (!birthday) {
    return ''
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error('birthday must use YYYY-MM-DD')
  }
  const date = new Date(`${birthday}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthday) {
    throw new Error('birthday is invalid')
  }
  if (birthday > new Date().toISOString().slice(0, 10)) {
    throw new Error('birthday cannot be in the future')
  }
  return birthday
}

function normalizeLowStockThreshold(value) {
  const threshold = Number(value)
  if (![10, 20, 25, 30, 50].includes(threshold)) {
    return 25
  }
  return threshold
}

function normalizeExpiryReminderDays(value) {
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return 60
  }
  return days
}

async function getUser(openid) {
  const result = await db
    .collection('users')
    .where({
      openid,
    })
    .limit(1)
    .get()

  if (result.data.length) {
    const user = result.data[0]
    if (isPublicUserId(user.publicUserId)) {
      return user
    }
    const publicUserId = await createUniquePublicUserId()
    await db.collection('users').doc(user._id).update({ data: { publicUserId } })
    return { ...user, publicUserId }
  }

  const now = db.serverDate()
  const publicUserId = await createUniquePublicUserId()
  const userResult = await db.collection('users').add({
    data: {
      openid,
      nickname: '',
      avatarUrl: '',
      publicUserId,
      lowStockThreshold: 25,
      expiryReminderDays: 60,
      currentFamilyId: '',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    },
  })

  return {
    _id: userResult._id,
    openid,
    nickname: '',
    avatarUrl: '',
    publicUserId,
    lowStockThreshold: 25,
    expiryReminderDays: 60,
    currentFamilyId: '',
  }
}

async function listMyFamilies(openid, existingUser = null) {
  const user = existingUser || await getUser(openid)
  const rolesResult = await db
    .collection('family_roles')
    .where({
      openid,
      deletedAt: _.exists(false),
    })
    .limit(50)
    .get()
  const roles = await Promise.all(
    rolesResult.data.map((role) => ensureOwnerMemberLink(openid, role)),
  )

  const families = (
    await Promise.all(
      roles.map(async (role) => {
        try {
          const familyResult = await db.collection('families').doc(role.familyId).get()
          const family = normalizeFamily(familyResult.data, role)
          family.entitlement = await getFamilyEntitlement(family._id, familyResult.data)
          return family
        } catch (error) {
          console.warn('skip invalid family role', role.familyId, error.message)
          return null
        }
      }),
    )
  ).filter(Boolean)

  const currentFamilyId =
    families.find((family) => family._id === user.currentFamilyId)?._id ||
    (families[0] && families[0]._id) ||
    ''

  if (currentFamilyId && currentFamilyId !== user.currentFamilyId) {
    await db.collection('users').doc(user._id).update({
      data: {
        currentFamilyId,
        updatedAt: db.serverDate(),
      },
    })
  }
  const ownedFamilies = families.filter((family) => family.role === 'owner')
  const hasProOwnedFamily = ownedFamilies.some(
    (family) => family.entitlement && family.entitlement.plan === 'pro',
  )
  const maxOwnedFamilies = hasProOwnedFamily
    ? PRO_MAX_OWNED_FAMILIES
    : FREE_MAX_OWNED_FAMILIES

  return {
    currentFamilyId,
    families,
    ownedFamilyCount: ownedFamilies.length,
    maxOwnedFamilies,
    canCreateFamily: ownedFamilies.length < maxOwnedFamilies,
    multiFamilyPlan: hasProOwnedFamily ? 'pro' : 'free',
  }
}

async function ensureOwnerMemberLink(openid, role) {
  if (!role || role.role !== 'owner') {
    return role
  }
  if (role.memberId) {
    const linkedMember = await db.collection('family_members').doc(role.memberId).get()
    if (linkedMember.data && !linkedMember.data.deletedAt && linkedMember.data.familyId === role.familyId) {
      return role
    }
  }

  const user = await getUser(openid)
  const memberId = createDeterministicDocumentId('owner_member', role.familyId, openid)
  const memberResult = await db.collection('family_members').doc(memberId).get()
  const now = db.serverDate()
  if (!memberResult.data || memberResult.data.deletedAt) {
    await db.collection('family_members').doc(memberId).set({
      data: {
        familyId: role.familyId,
        name: user.nickname || '我',
        relation: '本人',
        gender: user.gender || '',
        birthday: user.birthday || '',
        allergyHistory: '',
        medicalHistory: '',
        note: '',
        isOwnerProfile: true,
        createdBy: openid,
        updatedBy: openid,
        createdAt: now,
        updatedAt: now,
      },
    })
  }
  await db.collection('family_roles').doc(role._id).update({
    data: {
      memberId,
      memberLinkedAt: now,
      updatedAt: now,
    },
  })
  return {
    ...role,
    memberId,
    memberLinkedAt: now,
  }
}

async function getCurrentFamily(openid, familyId) {
  return selectFamilyFromList(await listMyFamilies(openid), familyId)
}

function selectFamilyFromList(list, familyId) {
  const targetId = familyId || list.currentFamilyId
  const family = (list.families || []).find((item) => item._id === targetId)
  if (!family) {
    throw new Error('family not found or no permission')
  }
  return family
}

async function switchFamily(openid, familyId) {
  if (!familyId) {
    throw new Error('familyId is required')
  }
  const family = await getCurrentFamily(openid, familyId)
  const user = await getUser(openid)
  await db.collection('users').doc(user._id).update({
    data: {
      currentFamilyId: family._id,
      updatedAt: db.serverDate(),
    },
  })
  return {
    currentFamilyId: family._id,
    family,
  }
}

async function createFamily(openid, payload) {
  const name = String(payload.name || '').trim()
  if (!name) {
    throw new Error('请填写家庭名称')
  }
  if (name.length > 30) {
    throw new Error('家庭名称不能超过 30 个字')
  }

  const ownerRolesResult = await db
    .collection('family_roles')
    .where({
      openid,
      role: 'owner',
      deletedAt: _.exists(false),
    })
    .limit(PRO_MAX_OWNED_FAMILIES + 1)
    .get()
  let hasProOwnedFamily = false
  for (const role of ownerRolesResult.data) {
    try {
      const entitlement = await getFamilyEntitlement(role.familyId)
      if (entitlement.plan === 'pro') {
        hasProOwnedFamily = true
        break
      }
    } catch (error) {
      console.warn('skip invalid owned family while checking creation policy', role.familyId, error.message)
    }
  }
  const maxOwnedFamilies = hasProOwnedFamily
    ? PRO_MAX_OWNED_FAMILIES
    : FREE_MAX_OWNED_FAMILIES
  if (ownerRolesResult.data.length >= maxOwnedFamilies) {
    throw new Error(
      hasProOwnedFamily
        ? `会员最多创建 ${PRO_MAX_OWNED_FAMILIES} 个家庭`
        : '基础版最多创建 1 个家庭，开通会员后可创建多个家庭',
    )
  }

  const user = await getUser(openid)
  const familyId = createOpaqueDocumentId('family')
  const roleId = createDeterministicDocumentId('owner_role', familyId, openid)
  const memberId = createDeterministicDocumentId('owner_member', familyId, openid)
  const now = db.serverDate()
  const familyData = {
    ownerOpenid: openid,
    name,
    membersOpenids: [openid],
    plan: 'free',
    membershipTier: 'free',
    planId: 'free',
    proExpireAt: null,
    proSource: '',
    proUpdatedAt: null,
    currentQuotaSnapshot: FREE_LIMITS,
    createdAt: now,
    updatedAt: now,
  }

  await db.runTransaction(async (transaction) => {
    await transaction.collection('families').doc(familyId).set({ data: familyData })
    await transaction.collection('family_members').doc(memberId).set({
      data: {
        familyId,
        name: user.nickname || '我',
        relation: '本人',
        gender: user.gender || '',
        birthday: user.birthday || '',
        allergyHistory: '',
        medicalHistory: '',
        note: '',
        isOwnerProfile: true,
        createdBy: openid,
        updatedBy: openid,
        createdAt: now,
        updatedAt: now,
      },
    })
    await transaction.collection('family_roles').doc(roleId).set({
      data: {
        familyId,
        openid,
        role: 'owner',
        memberId,
        memberLinkedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    })
    await transaction.collection('users').doc(user._id).update({
      data: {
        currentFamilyId: familyId,
        updatedAt: now,
      },
    })
  })

  return {
    currentFamilyId: familyId,
    family: {
      ...normalizeFamily({ ...familyData, _id: familyId }, {
        _id: roleId,
        familyId,
        role: 'owner',
      }),
      entitlement: await getFamilyEntitlement(familyId, familyData),
    },
    ownerMemberId: memberId,
    maxOwnedFamilies,
  }
}

async function assertFamilyAccess(openid, familyId, roles = VIEW_ROLES) {
  if (!familyId) {
    throw new Error('familyId is required')
  }

  const result = await db
    .collection('family_roles')
    .where({
      openid,
      familyId,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()

  if (!result.data.length || !roles.includes(result.data[0].role)) {
    throw new Error('no family permission')
  }

  return result.data[0]
}

async function getFamilyEntitlement(familyId, familyData) {
  const family = familyData || (await db.collection('families').doc(familyId).get()).data
  const expireAt = family && family.proExpireAt ? new Date(family.proExpireAt).getTime() : 0
  const configuredTier = resolveMembershipTier(family)
  const activeTier = configuredTier !== 'free' && expireAt > Date.now() ? configuredTier : 'free'
  const limits = getLimitsForTier(activeTier)

  return {
    plan: activeTier === 'free' ? 'free' : 'pro',
    tier: activeTier,
    planId: activeTier === 'free' ? 'free' : (family.planId || `${activeTier}_pro`),
    planName: MEMBERSHIP_TIER_NAMES[activeTier],
    proExpireAt: activeTier === 'free' ? null : family.proExpireAt,
    limits,
  }
}

async function getDashboardSummary(openid, familyId) {
  const { user, familyList, family, targetFamilyId } = await getFamilyContext(openid, familyId)
  if (!family) {
    if (targetFamilyId) {
      throw new Error('family not found or no permission')
    }
    return buildDashboardSummary(buildEmptyHome(user, familyList))
  }

  const currentFamilyId = family._id
  const [members, medicines, illnessRecords, medicationLogs, attachmentCount, reminderCount] = await Promise.all([
    listByFamily('family_members', currentFamilyId, 20),
    listByFamily('medicines', currentFamilyId, 100),
    listByFamily('illness_records', currentFamilyId, 50),
    listByFamily('medication_logs', currentFamilyId, 20),
    safeCount('attachments', { familyId: currentFamilyId, deletedAt: _.exists(false) }),
    safeCount('reminders', { familyId: currentFamilyId, deletedAt: _.exists(false) }),
  ])

  return {
    safetyNotice: SAFETY_NOTICE,
    features: {
      imageParsingEnabled: isImageParsingConfigured(),
    },
    user: publicUser(user),
    family,
    families: familyList.families,
    currentFamilyId,
    members,
    medicines,
    illnessRecords,
    medicationLogs,
    hasSupportingData: attachmentCount > 0 || reminderCount > 0,
    stats: {
      members: members.length,
      medicines: medicines.length,
      illnessRecords: illnessRecords.length,
      medicationLogs: medicationLogs.length,
      attachments: attachmentCount,
      reminders: reminderCount,
    },
  }
}

async function getProfileBootstrap(openid, familyId) {
  const { user, family, targetFamilyId } = await getFamilyContext(openid, familyId)
  if (!family) {
    if (targetFamilyId) {
      throw new Error('family not found or no permission')
    }
    return {
      user: publicUser(user),
      family: null,
      currentFamilyId: '',
      members: [],
      entitlement: getEmptyFamilyEntitlement(),
    }
  }

  const members = await listByFamily('family_members', family._id, 20)
  return {
    user: publicUser(user),
    family,
    currentFamilyId: family._id,
    members,
    entitlement: family.entitlement || getEmptyFamilyEntitlement(),
  }
}

function buildDashboardSummary(home = {}) {
  return {
    ...home,
    hasSupportingData: Boolean(home.hasSupportingData),
  }
}

async function getFamilyContext(openid, familyId) {
  const user = await getUser(openid)
  const familyList = await listMyFamilies(openid, user)
  const targetFamilyId = familyId || familyList.currentFamilyId
  const family = (familyList.families || []).find((item) => item._id === targetFamilyId) || null
  return { user, familyList, family, targetFamilyId }
}

function buildEmptyHome(user, familyList) {
  return {
    safetyNotice: SAFETY_NOTICE,
    features: {
      imageParsingEnabled: isImageParsingConfigured(),
    },
    user: publicUser(user),
    family: null,
    families: familyList.families || [],
    currentFamilyId: '',
    members: [],
    medicines: [],
    illnessRecords: [],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
    reminders: [],
    entitlement: null,
    quickRecordUsage: null,
    stats: {
      members: 0,
      medicines: 0,
      illnessRecords: 0,
      courseEvents: 0,
      medicationLogs: 0,
      attachments: 0,
      reminders: 0,
    },
  }
}

async function getMembershipStatus(openid, familyId) {
  const familyList = await listMyFamilies(openid)
  const targetFamilyId = familyId || familyList.currentFamilyId
  const family = (familyList.families || []).find((item) => item._id === targetFamilyId) || null
  if (!family) {
    if (targetFamilyId) {
      throw new Error('family not found or no permission')
    }
    return {
      family: null,
      entitlement: getEmptyFamilyEntitlement(),
      usage: buildEmptyFamilyUsage(),
      familyPolicy: {
        ownedFamilyCount: familyList.ownedFamilyCount,
        maxOwnedFamilies: familyList.maxOwnedFamilies,
      },
      plans: getMembershipPlans(),
    }
  }
  const entitlement = family.entitlement || await getFamilyEntitlement(family._id)
  const usage = await buildFamilyUsage(family._id, entitlement)

  return {
    family,
    entitlement,
    usage,
    familyPolicy: {
      ownedFamilyCount: familyList.ownedFamilyCount,
      maxOwnedFamilies: familyList.maxOwnedFamilies,
    },
    plans: getMembershipPlans(),
  }
}

function getEmptyFamilyEntitlement() {
  return {
    plan: 'free',
    tier: 'free',
    planId: 'free',
    planName: MEMBERSHIP_TIER_NAMES.free,
    proExpireAt: null,
    limits: FREE_LIMITS,
  }
}

function buildEmptyFamilyUsage() {
  return {
    members: 0,
    sharedUsers: 0,
    attachments: 0,
    aiImageParseMonthly: 0,
    aiAssistantMonthly: 0,
    quickRecord: {
      used: 0,
      limit: FREE_LIMITS.quickRecordLimit,
      remaining: FREE_LIMITS.quickRecordLimit,
      period: FREE_LIMITS.quickRecordPeriod,
      lifetimeUsed: 0,
      monthlyUsed: 0,
      exhausted: false,
    },
  }
}

function resolveMembershipTier(family = {}) {
  if (family.membershipTier === 'unlimited' || family.plan === 'unlimited') {
    return 'unlimited'
  }
  if (family.membershipTier === 'paid' || family.plan === 'pro') {
    return 'paid'
  }
  return 'free'
}

function getLimitsForTier(tier) {
  if (tier === 'unlimited') {
    return UNLIMITED_LIMITS
  }
  if (tier === 'paid') {
    return PRO_LIMITS
  }
  return FREE_LIMITS
}

function getMembershipPlans() {
  return [
    {
      planId: 'free',
      tier: 'free',
      name: MEMBERSHIP_TIER_NAMES.free,
      durationDays: 0,
      benefits: FREE_LIMITS,
    },
    {
      planId: 'monthly_pro',
      tier: 'paid',
      name: MEMBERSHIP_TIER_NAMES.paid,
      durationDays: 30,
      benefits: PRO_LIMITS,
    },
    {
      planId: 'unlimited_pro',
      tier: 'unlimited',
      name: MEMBERSHIP_TIER_NAMES.unlimited,
      durationDays: 365,
      benefits: UNLIMITED_LIMITS,
    },
  ]
}

async function buildQuickRecordUsage(familyId, entitlement) {
  const resolvedEntitlement = entitlement || await getFamilyEntitlement(familyId)
  const tier = resolvedEntitlement.tier || 'free'
  const limit = resolvedEntitlement.limits && resolvedEntitlement.limits.quickRecordLimit
  const query = {
    familyId,
    entrySource: 'quick',
  }
  const [lifetimeUsed, monthlyUsed] = await Promise.all([
    safeCount('illness_records', query),
    safeCount('illness_records', {
      ...query,
      createdAt: _.gte(getMonthStart()),
    }),
  ])
  const used = tier === 'free' ? lifetimeUsed : monthlyUsed
  const unlimited = limit === null || tier === 'unlimited'
  return {
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    period: resolvedEntitlement.limits.quickRecordPeriod,
    lifetimeUsed,
    monthlyUsed,
    exhausted: !unlimited && used >= limit,
  }
}

async function assertQuickRecordQuota(familyId) {
  const entitlement = await getFamilyEntitlement(familyId)
  const usage = await buildQuickRecordUsage(familyId, entitlement)
  if (usage.exhausted) {
    throw new Error('快速记录次数已用完，请升级会员')
  }
}

async function buildFamilyUsage(familyId, entitlement) {
  const monthStart = getMonthStart()
  const resolvedEntitlement = entitlement || await getFamilyEntitlement(familyId)
  const [members, sharedUsers, attachments, aiImageParse, aiAssistant, quickRecord] =
    await Promise.all([
      safeCount('family_members', { familyId, deletedAt: _.exists(false) }),
      countSharedUsers(familyId),
      safeCount('attachments', { familyId, deletedAt: _.exists(false) }),
      safeCount('ai_usage_logs', {
        familyId,
        usageType: 'image_parse',
        createdAt: _.gte(monthStart),
      }),
      safeCount('ai_usage_logs', {
        familyId,
        usageType: 'assistant_query',
        createdAt: _.gte(monthStart),
      }),
      buildQuickRecordUsage(familyId, resolvedEntitlement),
    ])

  return {
    members,
    sharedUsers,
    attachments,
    aiImageParseMonthly: aiImageParse,
    aiAssistantMonthly: aiAssistant,
    quickRecord,
  }
}

async function listByFamily(collection, familyId, limit = 100) {
  const result = await db
    .collection(collection)
    .where({
      familyId,
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return result.data
}

async function listMedicationHistory(openid, familyId) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, VIEW_ROLES)
  const result = await db
    .collection('medication_logs')
    .where({ familyId: family._id })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  return { logs: result.data }
}

async function saveReminder(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const id = String(payload._id || payload.id || '').trim()
  const existingReminder = id ? await assertFamilyRecord('reminders', id, family._id) : null
  if (existingReminder && existingReminder.status === 'completed') {
    throw new Error('completed health todo cannot be edited')
  }
  const memberId = String(payload.memberId || '').trim()
  const illnessRecordId = String(payload.illnessRecordId || '').trim()
  const title = String(payload.title || '').trim()
  const remindAt = String(payload.remindAt || '').trim()
  const note = String(payload.note || '').trim()
  const type = String(payload.type || 'medication').trim()
  const requestedSubscriptionStatus = normalizeSubscriptionStatus(payload.subscriptionStatus)
  const remindAtMs = parseChinaDateTime(remindAt)

  if (!memberId || !title || !remindAtMs) {
    throw new Error('memberId, title and valid remindAt are required')
  }
  if (remindAtMs <= Date.now()) {
    throw new Error('remindAt must be in the future')
  }
  if (title.length > 50 || note.length > 200) {
    throw new Error('health todo content is too long')
  }
  if (!['medication', 'follow_up', 'stock_check', 'other'].includes(type)) {
    throw new Error('invalid health todo type')
  }

  const member = await assertFamilyRecord('family_members', memberId, family._id)
  let illness = null
  if (illnessRecordId) {
    illness = await assertFamilyRecord('illness_records', illnessRecordId, family._id)
    assertSameMember(illness, memberId, 'illness record')
  }

  const preserveSubscription = Boolean(
    existingReminder &&
      payload.preserveSubscription === true &&
      existingReminder.subscriptionStatus === 'accepted' &&
      existingReminder.notificationOpenid &&
      ['scheduled', 'sending'].includes(existingReminder.deliveryStatus),
  )
  const notificationAccepted = requestedSubscriptionStatus === 'accepted'
  const subscriptionStatus = preserveSubscription
    ? existingReminder.subscriptionStatus
    : requestedSubscriptionStatus
  const notificationOpenid = preserveSubscription
    ? existingReminder.notificationOpenid
    : notificationAccepted
      ? openid
      : ''
  const deliveryStatus = preserveSubscription
    ? existingReminder.deliveryStatus
    : notificationAccepted
      ? 'scheduled'
      : 'not_scheduled'
  return saveRecord(openid, family._id, 'reminders', {
    _id: id,
    memberId,
    memberNameSnapshot: member.name || '',
    illnessRecordId,
    illnessSummarySnapshot: illness ? buildIllnessSnapshot(illness) : '',
    type,
    title,
    remindAt: formatChinaDateTime(remindAtMs),
    remindAtMs,
    note,
    status: 'active',
    subscriptionStatus,
    notificationOpenid,
    deliveryStatus,
  })
}

function normalizeSubscriptionStatus(value) {
  const status = String(value || 'not_requested').trim()
  return ['accepted', 'reject', 'ban', 'filter', 'unconfigured', 'unavailable', 'not_requested'].includes(status)
    ? status
    : 'unavailable'
}

function parseChinaDateTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/)
  if (!match) {
    return 0
  }
  const [, year, month, day, hour, minute] = match.map(Number)
  const timestamp = Date.UTC(year, month - 1, day, hour - 8, minute)
  const chinaTime = new Date(timestamp + 8 * 60 * 60 * 1000)
  if (
    chinaTime.getUTCFullYear() !== year ||
    chinaTime.getUTCMonth() !== month - 1 ||
    chinaTime.getUTCDate() !== day ||
    chinaTime.getUTCHours() !== hour ||
    chinaTime.getUTCMinutes() !== minute
  ) {
    return 0
  }
  return timestamp
}

function formatChinaDateTime(timestamp) {
  const chinaTime = new Date(timestamp + 8 * 60 * 60 * 1000)
  const year = chinaTime.getUTCFullYear()
  const month = `${chinaTime.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${chinaTime.getUTCDate()}`.padStart(2, '0')
  const hour = `${chinaTime.getUTCHours()}`.padStart(2, '0')
  const minute = `${chinaTime.getUTCMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function buildIllnessSnapshot(illness) {
  const symptoms = Array.isArray(illness.symptoms) ? illness.symptoms.join('、') : ''
  return [illness.startedAt || '', symptoms || illness.summary || '本次病程']
    .filter(Boolean)
    .join(' · ')
    .slice(0, 80)
}

async function saveRecord(openid, familyId, type, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const collection = COLLECTIONS[type]
  if (!collection) {
    throw new Error('invalid collection type')
  }
  const id = payload._id || payload.id
  const existingRecord = id ? await assertFamilyRecord(collection, id, family._id) : null
  await assertSaveRecordRelations(type, existingRecord ? { ...existingRecord, ...payload } : payload, family._id)

  const now = db.serverDate()
  const data = {
    ...payload,
    familyId: family._id,
    updatedBy: openid,
    updatedAt: now,
  }
  delete data._id
  delete data.id

  if (id) {
    await db.collection(collection).doc(id).update({
      data,
    })
    return {
      id,
      mode: 'updated',
    }
  }

  await assertRecordQuota(family._id, type)
  const result = await db.collection(collection).add({
    data: {
      ...data,
      createdBy: openid,
      createdAt: now,
    },
  })

  return {
    id: result._id,
    mode: 'created',
  }
}

async function deleteRecord(openid, familyId, type, id) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const collection = COLLECTIONS[type]
  if (!collection || !id) {
    throw new Error('invalid delete request')
  }
  await assertFamilyRecord(collection, id, family._id)
  await db.collection(collection).doc(id).update({
    data: {
      deletedAt: db.serverDate(),
      updatedBy: openid,
    },
  })
  return {
    id,
    mode: 'deleted',
  }
}

async function completeReminder(openid, familyId, id) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  if (!id) {
    throw new Error('health todo id is required')
  }
  const reminder = await assertFamilyRecord('reminders', id, family._id)
  if (reminder.status === 'completed') {
    return { id, mode: 'already_completed' }
  }
  const now = db.serverDate()
  const deliveryStatus = ['scheduled', 'sending'].includes(reminder.deliveryStatus)
    ? 'cancelled'
    : reminder.deliveryStatus || 'not_scheduled'
  await db.collection('reminders').doc(id).update({
    data: {
      status: 'completed',
      deliveryStatus,
      completedAt: now,
      completedBy: openid,
      updatedAt: now,
      updatedBy: openid,
    },
  })
  return { id, mode: 'completed' }
}

async function archiveMember(openid, familyId, id) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  if (!id) {
    throw new Error('member id is required')
  }
  await assertFamilyRecord('family_members', id, family._id)
  const linkedOwnerRole = await db
    .collection('family_roles')
    .where({
      familyId: family._id,
      memberId: id,
      role: 'owner',
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (linkedOwnerRole.data.length) {
    throw new Error('家庭创建者本人档案不能归档')
  }
  const now = db.serverDate()

  await db.collection('family_roles').where({
    familyId: family._id,
    memberId: id,
    deletedAt: _.exists(false),
  }).update({
    data: {
      memberId: '',
      memberUnlinkedAt: now,
      updatedBy: openid,
      updatedAt: now,
    },
  })
  await db.collection('family_members').doc(id).update({
    data: {
      deletedAt: now,
      archivedBy: openid,
      updatedBy: openid,
      updatedAt: now,
    },
  })

  return {
    id,
    mode: 'archived',
  }
}

async function saveIllness(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  if (!payload._id && !payload.id && payload.entrySource === 'quick') {
    await assertQuickRecordQuota(family._id)
  }
  const result = await saveRecord(openid, family._id, 'illness', payload)
  if (result.mode === 'created') {
    await saveCourseEvent(openid, familyId, {
      illnessRecordId: result.id,
      memberId: payload.memberId,
      eventType: payload.initialEventType || 'symptom',
      recordedAt: payload.startedAt,
      temperature: payload.temperatureMax || null,
      symptoms: payload.symptoms || [],
      hospitalName: payload.hospitalName || '',
      doctorDiagnosis: payload.doctorDiagnosis || '',
      examinationResult: payload.examinationResult || '',
      doctorAdvice: payload.doctorAdvice || '',
      prescribedMedicineIds: payload.prescribedMedicineIds || [],
      note: payload.initialEventNote || payload.symptomDescription || payload.summary || '',
      source: 'illness_created',
    })
  } else {
    await syncInitialCourseEvent(openid, familyId, result.id, payload)
  }
  return result
}

async function saveAttachment(openid, familyId, payload) {
  const id = payload._id || payload.id
  if (!id && payload.relatedType === 'illness' && payload.relatedId && payload.imageKind) {
    const family = await getCurrentFamily(openid, familyId)
    assertRole(family.role, EDIT_ROLES)
    const illness = await assertFamilyRecord('illness_records', payload.relatedId, family._id)
    if (illness.entrySource === 'quick') {
      const imageCount = await safeCount('attachments', {
        familyId: family._id,
        relatedType: 'illness',
        relatedId: payload.relatedId,
        imageKind: payload.imageKind,
        deletedAt: _.exists(false),
      })
      if (imageCount >= 3) {
        throw new Error('每类最多上传 3 张图片')
      }
    }
  }
  const result = await saveRecord(openid, familyId, 'attachments', payload)
  if (payload.relatedType === 'illness' && payload.relatedId && isVisitImageKind(payload.imageKind)) {
    await markIllnessVisited(openid, familyId, payload.relatedId)
  }
  return result
}

async function syncInitialCourseEvent(openid, familyId, illnessRecordId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  const result = await db
    .collection('course_events')
    .where({
      familyId: family._id,
      illnessRecordId,
      source: 'illness_created',
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    return
  }
  await db.collection('course_events').doc(result.data[0]._id).update({
    data: {
      memberId: payload.memberId,
      eventType: payload.initialEventType || 'symptom',
      recordedAt: payload.startedAt,
      temperature: payload.temperatureMax ? Number(payload.temperatureMax) : null,
      symptoms: Array.isArray(payload.symptoms) ? payload.symptoms : [],
      hospitalName: payload.hospitalName || '',
      doctorDiagnosis: payload.doctorDiagnosis || '',
      examinationResult: payload.examinationResult || '',
      doctorAdvice: payload.doctorAdvice || '',
      note: payload.initialEventNote || payload.symptomDescription || payload.summary || '',
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
}

async function completeIllness(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const id = String(payload.id || payload._id || '').trim()
  if (!id) {
    throw new Error('illness id is required')
  }
  const endedAt = String(payload.endedAt || '').trim()
  if (!endedAt) {
    throw new Error('endedAt is required')
  }
  const reviewNote = String(payload.reviewNote || '').trim()
  if (reviewNote.length > 1000) {
    throw new Error('复盘记录不能超过 1000 字')
  }

  return db.runTransaction(async (transaction) => {
    const illness = await assertTransactionFamilyRecord(transaction, 'illness_records', id, family._id)
    if (illness.status === '已恢复' || illness.status === '已关闭' || illness.endedAt) {
      return { id, status: '已关闭', endedAt: illness.endedAt || endedAt, idempotent: true }
    }
    const now = db.serverDate()
    await transaction.collection('illness_records').doc(id).update({
      data: {
        status: '已关闭',
        endedAt,
        updatedBy: openid,
        updatedAt: now,
      },
    })
    if (reviewNote) {
      const courseEventId = createDeterministicDocumentId('illness_complete', family._id, id)
      await transaction.collection('course_events').doc(courseEventId).set({
        data: {
          familyId: family._id,
          illnessRecordId: id,
          memberId: illness.memberId,
          eventType: 'note',
          recordedAt: endedAt,
          temperature: null,
          symptoms: [],
          medicineId: '',
          medicineNameSnapshot: '',
          doseQuantity: null,
          doseUnit: '',
          prescribedMedicineIds: [],
          prescribedMedicines: [],
          note: reviewNote,
          source: 'illness_completed',
          createdBy: openid,
          createdAt: now,
          updatedBy: openid,
          updatedAt: now,
        },
      })
    }
    return { id, status: '已关闭', endedAt, reviewSaved: !!reviewNote }
  })
}

async function saveCourseEvent(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  if (!payload.illnessRecordId || !payload.memberId) {
    throw new Error('illnessRecordId and memberId are required')
  }
  const illness = await assertFamilyRecord('illness_records', payload.illnessRecordId, family._id)
  await assertFamilyRecord('family_members', payload.memberId, family._id)
  assertSameMember(illness, payload.memberId, 'illness record')
  const medicine = payload.medicineId
    ? await assertFamilyRecord('medicines', payload.medicineId, family._id)
    : null
  if (medicine) {
    assertSameMember(medicine, payload.memberId, 'medicine')
  }
  const prescribedMedicineIds = Array.from(new Set(
    (Array.isArray(payload.prescribedMedicineIds) ? payload.prescribedMedicineIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ))
  if (prescribedMedicineIds.length > 20) {
    throw new Error('a visit can link at most 20 prescribed medicines')
  }
  const prescribedMedicineRecords = await Promise.all(
    prescribedMedicineIds.map((id) => assertFamilyRecord('medicines', id, family._id)),
  )
  prescribedMedicineRecords.forEach((item) => assertSameMember(item, payload.memberId, 'prescribed medicine'))
  const now = db.serverDate()
  const data = {
    familyId: family._id,
    illnessRecordId: payload.illnessRecordId,
    memberId: payload.memberId,
    eventType: payload.eventType || 'note',
    recordedAt: payload.recordedAt || payload.createdAt || '',
    temperature: payload.temperature ? Number(payload.temperature) : null,
    symptoms: Array.isArray(payload.symptoms) ? payload.symptoms : [],
    medicineId: payload.medicineId || '',
    medicineNameSnapshot: medicine ? medicine.name || '' : payload.medicineNameSnapshot || '',
    doseQuantity: payload.doseQuantity ? Number(payload.doseQuantity) : null,
    doseUnit: payload.doseUnit || '',
    prescribedMedicineIds,
    prescribedMedicines: prescribedMedicineRecords.map((item) => ({
      medicineId: item._id,
      medicineNameSnapshot: item.name || '',
      unitSnapshot: item.unit || '',
    })),
    hospitalName: String(payload.hospitalName || '').trim(),
    doctorDiagnosis: String(payload.doctorDiagnosis || '').trim(),
    examinationResult: String(payload.examinationResult || '').trim(),
    doctorAdvice: String(payload.doctorAdvice || '').trim(),
    note: payload.note || '',
    source: payload.source || 'manual',
    createdBy: openid,
    updatedBy: openid,
    createdAt: now,
    updatedAt: now,
  }
  const courseEventId = createOpaqueDocumentId('event')
  return db.runTransaction(async (transaction) => {
    const currentIllness = await assertTransactionFamilyRecord(
      transaction,
      'illness_records',
      payload.illnessRecordId,
      family._id,
    )
    assertSameMember(currentIllness, payload.memberId, 'illness record')
    await transaction.collection('course_events').doc(courseEventId).set({ data })
    let illnessStatus = currentIllness.status || ''
    if (data.eventType === 'visit') {
      const illnessUpdate = {
        updatedBy: openid,
        updatedAt: now,
      }
      const visitFields = ['hospitalName', 'doctorDiagnosis', 'examinationResult', 'doctorAdvice']
      visitFields.forEach((field) => {
        if (data[field]) {
          illnessUpdate[field] = data[field]
        }
      })
      if (currentIllness.status !== '已恢复' && currentIllness.status !== '已关闭' && !currentIllness.endedAt) {
        illnessStatus = '已就医'
        illnessUpdate.status = illnessStatus
      }
      await transaction.collection('illness_records').doc(payload.illnessRecordId).update({
        data: illnessUpdate,
      })
    }
    return {
      id: courseEventId,
      mode: 'created',
      illnessStatus,
    }
  })
}

async function saveFeedback(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  const content = String(payload.content || '').trim()
  if (!content) {
    throw new Error('请填写反馈内容')
  }
  const now = db.serverDate()
  const result = await db.collection('feedback').add({
    data: {
      familyId: family._id,
      openid,
      type: payload.type || '建议',
      content,
      page: payload.page || '',
      status: 'new',
      createdAt: now,
      updatedAt: now,
    },
  })
  return {
    id: result._id,
    mode: 'created',
  }
}

async function saveMedication(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const id = String(payload._id || payload.id || '').trim()
  const medicineId = String(payload.medicineId || '').trim()
  const memberId = String(payload.memberId || '').trim()
  const doseQuantity = Number(payload.doseQuantity || 0)
  const clientRequestId = normalizeClientRequestId(payload.clientRequestId)
  const takenAtMs = parseChinaDateTime(payload.takenAt)
  const takenAt = takenAtMs ? formatChinaDateTime(takenAtMs) : ''

  if (!memberId || !medicineId) {
    throw new Error('请选择家庭成员和药品')
  }
  if (!Number.isFinite(doseQuantity) || doseQuantity <= 0) {
    throw new Error('本次剂量必须大于 0')
  }
  if (!takenAt) {
    throw new Error('实际服用时间格式不正确')
  }
  if (takenAtMs > Date.now() + 5 * 60 * 1000) {
    throw new Error('实际服用时间不能晚于当前时间')
  }
  if (String(payload.reaction || '').length > 500 || String(payload.note || '').length > 500) {
    throw new Error('用药后反应和备注均不能超过 500 个字')
  }
  if (id) {
    return updateMedication(openid, family, {
      ...payload,
      id,
      medicineId,
      memberId,
      doseQuantity,
      takenAt,
    })
  }

  const requestFingerprint = createRequestFingerprint({
    memberId,
    medicineId,
    illnessRecordId: payload.illnessRecordId || '',
    doseQuantity,
    doseUnit: payload.doseUnit || '',
    takenAt,
    reaction: payload.reaction || '',
    note: payload.note || '',
  })
  const medicationLogId = clientRequestId
    ? createDeterministicDocumentId('medlog', family._id, openid, clientRequestId)
    : createOpaqueDocumentId('medlog')
  const courseEventId = payload.illnessRecordId
    ? clientRequestId
      ? createDeterministicDocumentId('medevent', family._id, openid, clientRequestId)
      : createOpaqueDocumentId('medevent')
    : ''

  if (clientRequestId) {
    const existingResult = await db.collection('medication_logs').doc(medicationLogId).get()
    if (existingResult.data) {
      return buildIdempotentMedicationResult(existingResult.data, {
        clientRequestId,
        familyId: family._id,
        medicationLogId,
        openid,
        requestFingerprint,
      })
    }
  }

  await assertRecordQuota(family._id, 'medication')
  const now = db.serverDate()

  return db.runTransaction(async (transaction) => {
    if (clientRequestId) {
      const existingResult = await transaction.collection('medication_logs').doc(medicationLogId).get()
      if (existingResult.data) {
        return buildIdempotentMedicationResult(existingResult.data, {
          clientRequestId,
          familyId: family._id,
          medicationLogId,
          openid,
          requestFingerprint,
        })
      }
    }

    const member = await assertTransactionFamilyRecord(transaction, 'family_members', memberId, family._id)
    const medicine = await assertTransactionFamilyRecord(transaction, 'medicines', medicineId, family._id)
    assertSameMember(medicine, memberId, 'medicine')
    const doseUnit = normalizeMedicationUnit(payload.doseUnit, medicine.unit)
    let illness = null
    if (payload.illnessRecordId) {
      illness = await assertTransactionFamilyRecord(
        transaction,
        'illness_records',
        payload.illnessRecordId,
        family._id,
      )
      assertSameMember(illness, memberId, 'illness record')
    }

    const stockQuantity = Number(medicine.remainingQuantity)
    if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) {
      throw new Error('所选药品库存不足')
    }
    if (doseQuantity > stockQuantity) {
      throw new Error(`库存不足，当前剩余 ${stockQuantity}${doseUnit}`)
    }
    const remainingQuantity = stockQuantity - doseQuantity
    const logData = {
      ...payload,
      familyId: family._id,
      clientRequestId,
      requestFingerprint,
      memberId,
      memberNameSnapshot: member.name || '',
      medicineId,
      medicineNameSnapshot: medicine.name || '',
      doseQuantity,
      doseUnit,
      takenAt,
      remainingQuantityAfter: remainingQuantity,
      courseEventId,
      createdBy: openid,
      updatedBy: openid,
      createdAt: now,
      updatedAt: now,
    }
    delete logData._id
    delete logData.id
    delete logData.frequencyText
    delete logData.wasPlanned

    await transaction.collection('medication_logs').doc(medicationLogId).set({ data: logData })
    await transaction.collection('medicines').doc(medicineId).update({
      data: {
        remainingQuantity,
        updatedBy: openid,
        updatedAt: now,
      },
    })

    if (illness) {
      await transaction.collection('course_events').doc(courseEventId).set({
        data: {
          familyId: family._id,
          illnessRecordId: payload.illnessRecordId,
          memberId,
          medicationLogId,
          eventType: 'medication',
          recordedAt: takenAt,
          temperature: null,
          symptoms: [],
          medicineId,
          medicineNameSnapshot: medicine.name || '',
          doseQuantity,
          doseUnit,
          note: buildMedicationEventNote(payload.reaction, payload.note),
          source: 'medication_log',
          createdBy: openid,
          updatedBy: openid,
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    return {
      id: medicationLogId,
      medicineId,
      remainingQuantity,
      clientRequestId,
      idempotent: false,
    }
  })
}

async function updateMedication(openid, family, payload) {
  const existing = await assertFamilyRecord('medication_logs', payload.id, family._id)
  const existingEvent = await findMedicationCourseEvent(existing, family._id)
  const now = db.serverDate()

  return db.runTransaction(async (transaction) => {
    const current = await assertTransactionFamilyRecord(
      transaction,
      'medication_logs',
      payload.id,
      family._id,
    )
    const member = await assertTransactionFamilyRecord(
      transaction,
      'family_members',
      payload.memberId,
      family._id,
    )
    const medicine = await assertTransactionFamilyRecord(
      transaction,
      'medicines',
      payload.medicineId,
      family._id,
    )
    assertSameMember(medicine, payload.memberId, 'medicine')
    const doseUnit = normalizeMedicationUnit(payload.doseUnit, medicine.unit)
    let illness = null
    if (payload.illnessRecordId) {
      illness = await assertTransactionFamilyRecord(
        transaction,
        'illness_records',
        payload.illnessRecordId,
        family._id,
      )
      assertSameMember(illness, payload.memberId, 'illness record')
    }

    const previousMedicine = current.medicineId === medicine._id
      ? medicine
      : await assertTransactionFamilyRecord(
          transaction,
          'medicines',
          current.medicineId,
          family._id,
        )
    const previousDose = Number(current.doseQuantity || 0)
    const previousStock = Number(previousMedicine.remainingQuantity)
    const newStock = Number(medicine.remainingQuantity)
    if (!Number.isFinite(previousDose) || previousDose <= 0 || !Number.isFinite(previousStock) || !Number.isFinite(newStock)) {
      throw new Error('原用药记录或药品库存数据异常，暂时无法修改')
    }

    let remainingQuantity
    if (previousMedicine._id === medicine._id) {
      const availableQuantity = newStock + previousDose
      if (payload.doseQuantity > availableQuantity) {
        throw new Error(`库存不足，本次最多可记录 ${availableQuantity}${doseUnit}`)
      }
      remainingQuantity = availableQuantity - payload.doseQuantity
      await transaction.collection('medicines').doc(medicine._id).update({
        data: { remainingQuantity, updatedBy: openid, updatedAt: now },
      })
    } else {
      if (payload.doseQuantity > newStock) {
        throw new Error(`库存不足，当前剩余 ${newStock}${doseUnit}`)
      }
      remainingQuantity = newStock - payload.doseQuantity
      await transaction.collection('medicines').doc(previousMedicine._id).update({
        data: {
          remainingQuantity: previousStock + previousDose,
          updatedBy: openid,
          updatedAt: now,
        },
      })
      await transaction.collection('medicines').doc(medicine._id).update({
        data: { remainingQuantity, updatedBy: openid, updatedAt: now },
      })
    }

    let courseEventId = ''
    if (illness) {
      courseEventId = existingEvent && existingEvent._id
        ? existingEvent._id
        : createOpaqueDocumentId('medevent')
      await transaction.collection('course_events').doc(courseEventId).set({
        data: {
          familyId: family._id,
          illnessRecordId: illness._id,
          memberId: payload.memberId,
          medicationLogId: current._id || payload.id,
          eventType: 'medication',
          recordedAt: payload.takenAt,
          temperature: null,
          symptoms: [],
          medicineId: medicine._id,
          medicineNameSnapshot: medicine.name || '',
          doseQuantity: payload.doseQuantity,
          doseUnit,
          note: buildMedicationEventNote(payload.reaction, payload.note),
          source: 'medication_log',
          createdBy: existingEvent ? existingEvent.createdBy || openid : openid,
          updatedBy: openid,
          createdAt: existingEvent ? existingEvent.createdAt || now : now,
          updatedAt: now,
        },
      })
    } else if (existingEvent && existingEvent._id) {
      await transaction.collection('course_events').doc(existingEvent._id).update({
        data: { deletedAt: now, updatedBy: openid, updatedAt: now },
      })
    }

    await transaction.collection('medication_logs').doc(payload.id).update({
      data: {
        memberId: payload.memberId,
        memberNameSnapshot: member.name || '',
        medicineId: medicine._id,
        medicineNameSnapshot: medicine.name || '',
        illnessRecordId: illness ? illness._id : '',
        doseQuantity: payload.doseQuantity,
        doseUnit,
        takenAt: payload.takenAt,
        reaction: String(payload.reaction || '').trim(),
        note: String(payload.note || '').trim(),
        remainingQuantityAfter: remainingQuantity,
        courseEventId,
        updatedBy: openid,
        updatedAt: now,
      },
    })

    return {
      id: payload.id,
      medicineId: medicine._id,
      remainingQuantity,
      mode: 'updated',
    }
  })
}

async function deleteMedication(openid, familyId, id) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const existing = await assertFamilyRecord('medication_logs', id, family._id)
  const existingEvent = await findMedicationCourseEvent(existing, family._id)
  const now = db.serverDate()

  return db.runTransaction(async (transaction) => {
    const current = await assertTransactionFamilyRecord(transaction, 'medication_logs', id, family._id)
    const medicineResult = await transaction.collection('medicines').doc(current.medicineId).get()
    const medicine = medicineResult.data
    let remainingQuantity = null
    let inventoryRestored = false
    if (medicine && medicine.familyId === family._id) {
      const currentStock = Number(medicine.remainingQuantity)
      const doseQuantity = Number(current.doseQuantity)
      if (Number.isFinite(currentStock) && Number.isFinite(doseQuantity) && doseQuantity > 0) {
        remainingQuantity = currentStock + doseQuantity
        inventoryRestored = true
        await transaction.collection('medicines').doc(current.medicineId).update({
          data: { remainingQuantity, updatedBy: openid, updatedAt: now },
        })
      }
    }
    await transaction.collection('medication_logs').doc(id).update({
      data: {
        deletedAt: now,
        inventoryRestored,
        inventoryRestoredAt: inventoryRestored ? now : null,
        updatedBy: openid,
        updatedAt: now,
      },
    })
    if (existingEvent && existingEvent._id) {
      await transaction.collection('course_events').doc(existingEvent._id).update({
        data: { deletedAt: now, updatedBy: openid, updatedAt: now },
      })
    }
    return { id, mode: 'voided', inventoryRestored, remainingQuantity }
  })
}

async function findMedicationCourseEvent(record, familyId) {
  if (record.courseEventId) {
    const direct = await db.collection('course_events').doc(record.courseEventId).get()
    if (direct.data && direct.data.familyId === familyId && !direct.data.deletedAt) {
      return { ...direct.data, _id: direct.data._id || record.courseEventId }
    }
  }
  const result = await db
    .collection('course_events')
    .where({
      familyId,
      medicationLogId: record._id,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  return result.data[0] || null
}

function normalizeMedicationUnit(requestedUnit, medicineUnit) {
  const unit = String(medicineUnit || '').trim()
  if (!unit) {
    throw new Error('请先在药箱中为该药品填写可扣减单位，例如 ml 或片')
  }
  const requested = String(requestedUnit || '').trim()
  if (requested && requested !== unit) {
    throw new Error('用药单位必须与药箱库存单位一致')
  }
  return unit
}

function buildMedicationEventNote(reaction, note) {
  const parts = []
  if (String(reaction || '').trim()) {
    parts.push(`用药后反应：${String(reaction).trim()}`)
  }
  if (String(note || '').trim()) {
    parts.push(`备注：${String(note).trim()}`)
  }
  return parts.join('；')
}

async function parseAttachment(openid, familyId, payload) {
  const imageParsingProvider = assertImageParsingEnabled()
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  await assertAiQuota(family._id, 'image_parse')
  const fileId = payload.fileId
  if (!fileId) {
    throw new Error('fileId is required')
  }
  const attachmentIds = normalizeAttachmentIds(payload.attachmentIds)
  const attachments = await assertFamilyRecords('attachments', attachmentIds, family._id)
  const attachment = attachments.find((item) => item.fileId === fileId)
  if (!attachment) {
    throw new Error('fileId does not belong to the validated attachments')
  }
  const imageKind = payload.imageKind || 'medicine_box'
  if (!IMAGE_KINDS.includes(imageKind)) {
    throw new Error('图片资料类型不受支持')
  }
  const output = buildParseDraft(imageKind)
  const now = db.serverDate()
  const result = await db.collection('ai_tasks').add({
    data: {
      familyId: family._id,
      userOpenid: openid,
      taskType: 'image_parse',
      provider: imageParsingProvider,
      model: DEEPSEEK_VISION_MODEL,
      imageKind,
      attachmentIds,
      input: {
        fileId,
        relatedType: payload.relatedType || '',
        relatedId: attachment.relatedId || '',
      },
      output,
      status: 'processing',
      errorMessage: '',
      tokenUsage: {},
      createdAt: now,
      updatedAt: now,
    },
  })
  try {
    const fileResult = await cloud.downloadFile({ fileID: fileId })
    const imageBuffer = fileResult && fileResult.fileContent
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('无法读取已上传的图片')
    }
    const visionResult = await callDeepSeekVision({
      apiKey: process.env.DEEPSEEK_API_KEY,
      imageBuffer,
      mimeType: detectImageMimeType(imageBuffer),
      prompt: buildVisionPrompt(imageKind),
    })
    const normalizedOutput = normalizeVisionOutput(imageKind, visionResult.output)
    if (!hasVisionContent(normalizedOutput)) {
      throw new Error('图片未识别出可用内容，请重新拍摄或手动填写')
    }
    const appliedToIllness = payload.autoApply
      ? await applyAiOutputToIllness(
        openid,
        family._id,
        attachment.relatedType === 'illness' ? attachment.relatedId : '',
        imageKind,
        normalizedOutput,
      )
      : false
    await db.collection('ai_tasks').doc(result._id).update({
      data: {
        output: normalizedOutput,
        rawOutput: visionResult.rawContent,
        status: appliedToIllness ? 'confirmed' : 'success',
        confirmedBy: appliedToIllness ? openid : '',
        confirmedAt: appliedToIllness ? db.serverDate() : null,
        tokenUsage: visionResult.usage,
        updatedAt: db.serverDate(),
      },
    })
    await recordAiUsage(family._id, openid, 'image_parse', result._id)
    await db.collection('attachments').doc(attachment._id).update({
      data: {
        aiStructured: normalizedOutput,
        aiSummary: buildAiSummary(imageKind, normalizedOutput),
        parseStatus: appliedToIllness ? 'confirmed' : 'parsed',
        parseConfirmedBy: appliedToIllness ? openid : '',
        parseConfirmedAt: appliedToIllness ? db.serverDate() : null,
        aiTaskId: result._id,
        updatedBy: openid,
        updatedAt: db.serverDate(),
      },
    })
    return {
      task: {
        _id: result._id,
        status: appliedToIllness ? 'confirmed' : 'success',
        imageKind,
        model: visionResult.model,
      },
      output: normalizedOutput,
      appliedToIllness,
    }
  } catch (error) {
    await db.collection('ai_tasks').doc(result._id).update({
      data: {
        status: 'failed',
        errorMessage: String(error.message || '图片识别失败').slice(0, 500),
        updatedAt: db.serverDate(),
      },
    })
    throw error
  }
}

async function parseIllnessText(openid, familyId, payload) {
  const textParsingProvider = assertImageParsingEnabled()
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  await assertAiQuota(family._id, 'text_parse')
  const text = String(payload.text || '').trim()
  if (!text) {
    throw new Error('text is required')
  }
  if (text.length > 4000) {
    throw new Error('文字内容不能超过 4000 字')
  }
  const output = buildTextParseDraft()
  const now = db.serverDate()
  const result = await db.collection('ai_tasks').add({
    data: {
      familyId: family._id,
      userOpenid: openid,
      taskType: 'text_parse',
      provider: textParsingProvider,
      model: DEEPSEEK_VISION_MODEL,
      imageKind: 'text',
      attachmentIds: [],
      input: { text, illnessId: payload.illnessId || '' },
      output,
      status: 'processing',
      errorMessage: '',
      tokenUsage: {},
      createdAt: now,
      updatedAt: now,
    },
  })
  try {
    const textResult = await callDeepSeekText({
      apiKey: process.env.DEEPSEEK_API_KEY,
      prompt: buildTextParsePrompt(text),
    })
    const normalizedOutput = normalizeTextParseOutput(textResult.output)
    const illnessId = payload.illnessId || ''
    const appliedToIllness = payload.autoApply
      ? await applyAiOutputToIllness(openid, family._id, illnessId, 'text', normalizedOutput)
      : false
    await db.collection('ai_tasks').doc(result._id).update({
      data: {
        output: normalizedOutput,
        rawOutput: textResult.rawContent,
        status: appliedToIllness ? 'confirmed' : 'success',
        confirmedBy: appliedToIllness ? openid : '',
        confirmedAt: appliedToIllness ? db.serverDate() : null,
        tokenUsage: textResult.usage,
        updatedAt: db.serverDate(),
      },
    })
    await recordAiUsage(family._id, openid, 'text_parse', result._id)
    return {
      task: {
        _id: result._id,
        status: appliedToIllness ? 'confirmed' : 'success',
        taskType: 'text_parse',
        model: textResult.model,
      },
      output: normalizedOutput,
      appliedToIllness,
    }
  } catch (error) {
    await db.collection('ai_tasks').doc(result._id).update({
      data: {
        status: 'failed',
        errorMessage: String(error.message || '文字整理失败').slice(0, 500),
        updatedAt: db.serverDate(),
      },
    })
    throw error
  }
}

async function processQuickIllness(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const illnessId = String(payload.illnessId || '').trim()
  if (!illnessId) {
    throw new Error('illnessId is required')
  }
  const illness = await assertFamilyRecord('illness_records', illnessId, family._id)
  const attachmentResult = await db
    .collection('attachments')
    .where({
      familyId: family._id,
      relatedType: 'illness',
      relatedId: illnessId,
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'asc')
    .limit(20)
    .get()
  const attachments = attachmentResult.data || []

  await db.collection('illness_records').doc(illnessId).update({
    data: {
      aiProcessing: true,
      aiProcessingStatus: 'processing',
      aiProcessingStartedAt: db.serverDate(),
      aiProcessingError: '',
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })

  const errors = []
  let textProcessed = false
  let imageProcessed = 0
  const text = String(illness.quickInputText || illness.symptomDescription || '').trim()
  if (text && payload.includeText !== false) {
    try {
      await parseIllnessText(openid, family._id, {
        illnessId,
        text,
        autoApply: true,
      })
      textProcessed = true
    } catch (error) {
      errors.push(`文字：${String(error.message || '整理失败')}`)
    }
  }

  for (const attachment of attachments) {
    if (!attachment.fileId || attachment.parseStatus === 'confirmed') {
      continue
    }
    try {
      await parseAttachment(openid, family._id, {
        fileId: attachment.fileId,
        attachmentIds: [attachment._id],
        imageKind: attachment.imageKind || 'medicine_box',
        relatedType: 'illness',
        autoApply: true,
      })
      imageProcessed += 1
    } catch (error) {
      errors.push(`${attachment.imageKind || '图片'}：${String(error.message || '整理失败')}`)
    }
  }

  try {
    const latestIllness = await assertFamilyRecord('illness_records', illnessId, family._id)
    if (latestIllness.prescriptionText) {
      const medicineIds = await syncPrescriptionMedicines(openid, family._id, latestIllness, latestIllness.prescriptionText)
      await syncPrescriptionMedicineLinks(openid, family._id, illnessId, medicineIds)
    }
  } catch (error) {
    errors.push(`药箱同步：${String(error.message || '同步失败')}`)
  }

  const errorMessage = errors.join('；').slice(0, 500)
  await db.collection('illness_records').doc(illnessId).update({
    data: {
      aiProcessing: false,
      aiProcessingStatus: errors.length ? 'partial' : 'completed',
      aiProcessingFinishedAt: db.serverDate(),
      aiProcessingError: errorMessage,
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
  return {
    illnessId,
    textProcessed,
    imageProcessed,
    status: errors.length ? 'partial' : 'completed',
    error: errorMessage,
  }
}

async function markIllnessVisited(openid, familyId, illnessId) {
  const illness = await assertFamilyRecord('illness_records', illnessId, familyId)
  if (['已恢复', '已关闭'].includes(illness.status) || illness.endedAt || illness.status === '已就医') {
    return false
  }
  await db.collection('illness_records').doc(illnessId).update({
    data: {
      status: '已就医',
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
  return true
}

async function applyAiOutputToIllness(openid, familyId, illnessId, imageKind, output, options = {}) {
  const id = String(illnessId || '').trim()
  if (!id) {
    return false
  }
  await assertFamilyRecord('illness_records', id, familyId)
  const update = {
    updatedBy: openid,
    updatedAt: db.serverDate(),
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
    const value = output && output[field]
    if (field === 'symptoms') {
      if (Array.isArray(value) && (value.length || options.clearEmpty)) {
        update.symptoms = value
      }
      return
    }
    if (field === 'temperatureMax') {
      const temperature = Number(value)
      if (value !== '' && value !== null && value !== undefined && Number.isFinite(temperature)) {
        update.temperatureMax = temperature
      } else if (options.clearEmpty) {
        update.temperatureMax = ''
      }
      return
    }
    const text = textValue(value)
    if (text || options.clearEmpty) {
      update[field === 'medicinesText' ? 'prescriptionText' : field] = text
    }
  })

  if (isVisitEvidence(imageKind, output)) {
    const current = await assertFamilyRecord('illness_records', id, familyId)
    if (!['已恢复', '已关闭'].includes(current.status) && !current.endedAt) {
      update.status = '已就医'
    }
  }

  const recognizedMedicineText = buildRecognizedMedicineText(imageKind, output)
  const hasIllnessUpdate = Object.keys(update).length > 2
  if (hasIllnessUpdate) {
    await db.collection('illness_records').doc(id).update({ data: update })
  }
  if (recognizedMedicineText) {
    const illness = await assertFamilyRecord('illness_records', id, familyId)
    const source = imageKind === 'prescription' ? '处方识别' : '图片识别'
    const medicineIds = await syncPrescriptionMedicines(openid, familyId, illness, recognizedMedicineText, source)
    await syncPrescriptionMedicineLinks(openid, familyId, id, medicineIds)
  }
  return hasIllnessUpdate || Boolean(recognizedMedicineText)
}

function isVisitImageKind(imageKind) {
  return VISIT_IMAGE_KINDS.includes(String(imageKind || '').trim())
}

function isVisitEvidence(imageKind, output = {}) {
  if (isVisitImageKind(imageKind)) {
    return true
  }
  if (imageKind !== 'text') {
    return false
  }
  return ['hospitalName', 'doctorDiagnosis', 'examinationResult', 'medicinesText']
    .some((field) => Boolean(textValue(output[field])))
}

async function getAiTask(openid, familyId, taskId) {
  const family = await getCurrentFamily(openid, familyId)
  if (!taskId) {
    throw new Error('taskId is required')
  }
  const task = await assertFamilyRecord('ai_tasks', taskId, family._id)
  return {
    task,
  }
}

async function confirmAiParseResult(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const taskId = payload.taskId
  if (!taskId) {
    throw new Error('taskId is required')
  }
  const task = await assertFamilyRecord('ai_tasks', taskId, family._id)
  if (!['image_parse', 'text_parse'].includes(task.taskType)) {
    throw new Error('task type cannot be confirmed')
  }
  if (!['success', 'confirmed'].includes(task.status)) {
    throw new Error('ai parse task is not ready for confirmation')
  }

  const output = task.taskType === 'text_parse'
    ? normalizeTextParseOutput(payload.output)
    : normalizeVisionOutput(task.imageKind, payload.output)

  if (task.taskType === 'image_parse') {
    const attachmentIds = normalizeAttachmentIds(task.attachmentIds)
    if (payload.attachmentIds !== undefined) {
      const requestedAttachmentIds = normalizeAttachmentIds(payload.attachmentIds)
      if (!haveSameIds(attachmentIds, requestedAttachmentIds)) {
        throw new Error('attachmentIds do not match the task')
      }
    }
    const attachments = await assertFamilyRecords('attachments', attachmentIds, family._id)
    const now = db.serverDate()
    for (const attachmentId of attachmentIds) {
      await db.collection('attachments').doc(attachmentId).update({
        data: {
          aiStructured: output,
          aiSummary: buildAiSummary(task.imageKind, output),
          parseStatus: 'confirmed',
          parseConfirmedBy: openid,
          parseConfirmedAt: now,
          updatedBy: openid,
          updatedAt: now,
        },
      })
    }
    const illnessIds = Array.from(new Set(
      attachments
        .filter((attachment) => attachment.relatedType === 'illness' && attachment.relatedId)
        .map((attachment) => attachment.relatedId),
    ))
    for (const illnessId of illnessIds) {
      await applyAiOutputToIllness(openid, family._id, illnessId, task.imageKind, output, {
        clearEmpty: task.status === 'confirmed',
      })
    }
  } else {
    await applyAiOutputToIllness(
      openid,
      family._id,
      payload.illnessId || (task.input && task.input.illnessId) || '',
      'text',
      output,
      { clearEmpty: task.status === 'confirmed' },
    )
  }
  const now = db.serverDate()
  await db.collection('ai_tasks').doc(taskId).update({
    data: {
      output,
      status: 'confirmed',
      confirmedBy: openid,
      confirmedAt: now,
      updatedAt: now,
    },
  })

  return {
    taskId,
    output,
    status: 'confirmed',
  }
}

async function getFamilyInvite(openid, inviteCode) {
  if (!inviteCode) {
    throw new Error('inviteCode is required')
  }
  const invite = await findActiveInvite(inviteCode)
  if (!invite.targetMemberId) {
    throw new Error('邀请未关联家庭成员，请联系创建者重新邀请')
  }
  const existingRoleResult = await db
    .collection('family_roles')
    .where({
      familyId: invite.familyId,
      openid,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  const canAccept = invite.inviterOpenid !== openid && !existingRoleResult.data.length
  return {
    inviteCode: invite.inviteCode,
    familyId: invite.familyId,
    familyNameSnapshot: invite.familyNameSnapshot,
    inviterNameSnapshot: invite.inviterNameSnapshot || '家人',
    targetMemberId: invite.targetMemberId || '',
    targetMemberNameSnapshot: invite.targetMemberNameSnapshot || '',
    role: invite.role,
    expiresAt: invite.expiresAt,
    canAccept,
    acceptBlockedReason: canAccept ? '' : ALREADY_IN_FAMILY_MESSAGE,
    privacyNotice:
      '加入后，对方将能够根据你的角色权限查看或编辑该家庭空间内的药箱记录、健康记录、用药记录和附件。请仅接受你信任的家庭成员邀请。',
  }
}

async function createFamilyInvite(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const entitlement = await getFamilyEntitlement(family._id)
  const role = payload.role || 'viewer'
  const targetMemberId = String(payload.targetMemberId || '').trim()

  if (!targetMemberId) {
    throw new Error('请先选择要关联的家庭成员')
  }

  if (!entitlement.limits.sharedRoles.includes(role)) {
    throw new Error('当前版本不支持邀请该角色，请开通会员后再试')
  }

  const targetMember = await assertFamilyRecord('family_members', targetMemberId, family._id)
  const linkedRoleResult = await db
    .collection('family_roles')
    .where({
      familyId: family._id,
      memberId: targetMemberId,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (linkedRoleResult.data.length) {
    throw new Error('该成员已经关联微信账号')
  }
  const pendingInviteResult = await db
    .collection('family_invites')
    .where({
      familyId: family._id,
      targetMemberId,
      status: 'active',
      deletedAt: _.exists(false),
    })
    .limit(10)
    .get()
  if (pendingInviteResult.data.some(
    (invite) => !invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now(),
  )) {
    throw new Error('该成员已有待接受邀请')
  }

  const inviteCode = await createUniqueInviteCode()
  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + (entitlement.plan === 'pro' ? 7 * 24 : 24) * 60 * 60 * 1000,
  )
  const user = await getUser(openid)
  const inviterName = user.nickname || payload.inviterName || '家人'
  const result = await db.collection('family_invites').add({
    data: {
      inviteCode,
      familyId: family._id,
      familyNameSnapshot: family.name || '我的家庭健康记录',
      inviterOpenid: openid,
      inviterNameSnapshot: inviterName,
      targetMemberId,
      targetMemberNameSnapshot: targetMember ? targetMember.name || '' : '',
      role,
      status: 'active',
      maxUses: 1,
      usedCount: 0,
      expiresAt,
      acceptedOpenids: [],
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  return {
    id: result._id,
    inviteCode,
    targetMemberId,
    targetMemberNameSnapshot: targetMember ? targetMember.name || '' : '',
    role,
    expiresAt,
    path: `/pages/family/accept?code=${inviteCode}`,
  }
}

async function acceptFamilyInvite(openid, inviteCode) {
  inviteCode = String(inviteCode || '').trim().toUpperCase()
  if (!inviteCode) {
    throw new Error('inviteCode is required')
  }
  const invite = await findInviteByCode(inviteCode)
  if (invite.inviterOpenid === openid) {
    throw new Error(ALREADY_IN_FAMILY_MESSAGE)
  }

  const existing = await db
    .collection('family_roles')
    .where({
      familyId: invite.familyId,
      openid,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (existing.data.length) {
    throw new Error(ALREADY_IN_FAMILY_MESSAGE)
  }

  const user = await getUser(openid)
  const familyRoleId = createDeterministicDocumentId('familyrole', invite.familyId, openid)
  const now = db.serverDate()
  return db.runTransaction(async (transaction) => {
    const inviteResult = await transaction.collection('family_invites').doc(invite._id).get()
    const currentInvite = inviteResult.data
    if (!currentInvite || currentInvite.inviteCode !== inviteCode || currentInvite.deletedAt) {
      throw new Error('invite not found')
    }
    if (currentInvite.inviterOpenid === openid) {
      throw new Error(ALREADY_IN_FAMILY_MESSAGE)
    }

    const familyResult = await transaction.collection('families').doc(currentInvite.familyId).get()
    const family = familyResult.data
    if (!family) {
      throw new Error('family not found')
    }
    const targetMemberId = String(currentInvite.targetMemberId || '').trim()
    if (!targetMemberId) {
      throw new Error('邀请未关联家庭成员，请联系创建者重新邀请')
    }
    await assertTransactionFamilyRecord(transaction, 'family_members', targetMemberId, currentInvite.familyId)
    const linkedRoleResult = await transaction
      .collection('family_roles')
      .where({
        familyId: currentInvite.familyId,
        memberId: targetMemberId,
        deletedAt: _.exists(false),
      })
      .limit(1)
      .get()
    const conflictingRole = linkedRoleResult.data.find((role) => role.openid !== openid)
    if (conflictingRole) {
      throw new Error('该成员已经关联其他微信账号')
    }
    const acceptedOpenids = Array.from(new Set(currentInvite.acceptedOpenids || []))
    const alreadyAccepted = acceptedOpenids.includes(openid)
    const usedCount = Number(currentInvite.usedCount || 0)
    const maxUses = Number(currentInvite.maxUses || 1)
    if (!alreadyAccepted) {
      if (currentInvite.status !== 'active' || usedCount >= maxUses) {
        throw new Error('invite has already been used')
      }
      if (currentInvite.expiresAt && new Date(currentInvite.expiresAt).getTime() < Date.now()) {
        throw new Error('invite has expired')
      }
    }

    const entitlement = await getFamilyEntitlement(currentInvite.familyId, family)
    if (!entitlement.limits.sharedRoles.includes(currentInvite.role)) {
      throw new Error('invite role is no longer available for this family')
    }
    const membersOpenids = Array.from(new Set(family.membersOpenids || []))
    const roleResult = await transaction.collection('family_roles').doc(familyRoleId).get()
    const existingRole = roleResult.data
    const hasActiveRole = !!(existingRole && !existingRole.deletedAt)
    if (hasActiveRole) {
      if (existingRole.familyId !== currentInvite.familyId || existingRole.openid !== openid) {
        throw new Error('family role id conflict')
      }
      throw new Error(ALREADY_IN_FAMILY_MESSAGE)
    }
    await transaction.collection('family_roles').doc(familyRoleId).set({
      data: {
        familyId: currentInvite.familyId,
        openid,
        role: currentInvite.role,
        memberId: targetMemberId,
        joinedByInviteCode: currentInvite.inviteCode,
        memberLinkedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    })
    await transaction.collection('families').doc(currentInvite.familyId).update({
      data: {
        membersOpenids: Array.from(new Set([...membersOpenids, openid])),
        updatedAt: now,
      },
    })

    const nextUsedCount = alreadyAccepted ? usedCount : usedCount + 1
    await transaction.collection('family_invites').doc(currentInvite._id || invite._id).update({
      data: {
        usedCount: nextUsedCount,
        acceptedOpenids: Array.from(new Set([...acceptedOpenids, openid])),
        status: nextUsedCount >= maxUses ? 'accepted' : 'active',
        updatedAt: now,
      },
    })
    await transaction.collection('users').doc(user._id).update({
      data: {
        currentFamilyId: currentInvite.familyId,
        updatedAt: now,
      },
    })

    return {
      familyId: currentInvite.familyId,
      memberId: targetMemberId,
      role: currentInvite.role,
      mode: alreadyAccepted ? 'recovered' : 'joined',
    }
  })
}

async function listFamilyRoles(openid, familyId) {
  const familyList = await listMyFamilies(openid)
  const targetFamilyId = familyId || familyList.currentFamilyId
  const family = (familyList.families || []).find((item) => item._id === targetFamilyId) || null
  if (!family) {
    if (targetFamilyId) {
      throw new Error('family not found or no permission')
    }
    return {
      family: null,
      roles: [],
      pendingInvites: [],
    }
  }
  await assertFamilyAccess(openid, family._id, VIEW_ROLES)
  const [result, inviteResult] = await Promise.all([
    db
      .collection('family_roles')
      .where({
        familyId: family._id,
        deletedAt: _.exists(false),
      })
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get(),
    db
      .collection('family_invites')
      .where({
        familyId: family._id,
        status: 'active',
        deletedAt: _.exists(false),
      })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get(),
  ])

  const roles = await Promise.all(
    result.data.map(async (role) => {
      const user = await findUserByOpenid(role.openid)
      return {
        roleId: role._id,
        role: role.role,
        memberId: role.memberId || '',
        nickname: (user && user.nickname) || '已关联家人',
        avatarUrl: (user && user.avatarUrl) || '',
        isCurrentUser: role.openid === openid,
        joinedAt: role.joinedAt || role.createdAt || '',
      }
    }),
  )

  return {
    family,
    roles,
    pendingInvites: inviteResult.data.filter(
      (invite) =>
        invite.targetMemberId &&
        Number(invite.usedCount || 0) < Number(invite.maxUses || 1) &&
        (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now()),
    ).map((invite) => ({
      inviteId: invite._id,
      inviteCode: invite.inviteCode,
      targetMemberId: invite.targetMemberId,
      targetMemberNameSnapshot: invite.targetMemberNameSnapshot || '',
      role: invite.role,
      expiresAt: invite.expiresAt || '',
      createdAt: invite.createdAt || '',
    })),
  }
}

async function updateFamilyRole(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const targetRoleId = String(payload.roleId || '')
  const role = payload.role
  if (!targetRoleId || !role) {
    throw new Error('roleId and role are required')
  }
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw new Error('invalid role')
  }
  const entitlement = await getFamilyEntitlement(family._id)
  if (!entitlement.limits.sharedRoles.includes(role)) {
    throw new Error('当前家庭权益不支持该角色')
  }
  const targetRole = await assertFamilyRoleTarget(targetRoleId, family._id)
  if (targetRole.role === 'owner') {
    throw new Error('不能修改家庭创建者角色')
  }
  await db.collection('family_roles').doc(targetRole._id).update({
    data: {
      role,
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
  return {
    roleId: targetRole._id,
    role,
  }
}

async function removeFamilyUser(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const targetRoleId = String(payload.roleId || '')
  if (!targetRoleId) {
    throw new Error('roleId is required')
  }
  const targetRole = await assertFamilyRoleTarget(targetRoleId, family._id)
  if (targetRole.role === 'owner') {
    throw new Error('家庭创建者不能直接移除')
  }
  const targetOpenid = targetRole.openid
  await db.collection('family_roles').doc(targetRole._id).update({
    data: {
      deletedAt: db.serverDate(),
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
  const familyDoc = await db.collection('families').doc(family._id).get()
  await db.collection('families').doc(family._id).update({
    data: {
      membersOpenids: (familyDoc.data.membersOpenids || []).filter((item) => item !== targetOpenid),
      updatedAt: db.serverDate(),
    },
  })
  return {
    roleId: targetRole._id,
    mode: 'removed',
  }
}

async function exportReport(openid, familyId, payload) {
  const home = await getHome(openid, familyId)
  if (!payload.illnessRecordId) {
    throw new Error('请从病程详情中生成复诊摘要')
  }
  return buildIllnessReport(home, payload)
}

function buildIllnessReport(home, payload) {
  const illness = home.illnessRecords.find((item) => item._id === payload.illnessRecordId)
  if (!illness) {
    throw new Error('未找到这次病程')
  }
  const member = home.members.find((item) => item._id === illness.memberId) || {}
  const events = home.courseEvents
    .filter((item) => item.illnessRecordId === illness._id)
    .sort((a, b) => toTime(a.recordedAt || a.createdAt) - toTime(b.recordedAt || b.createdAt))
  const medicationLogs = home.medicationLogs
    .filter((item) => item.illnessRecordId === illness._id)
    .sort((a, b) => toTime(a.takenAt || a.createdAt) - toTime(b.takenAt || b.createdAt))
  const attachments = home.attachments.filter((item) => item.relatedType === 'illness' && item.relatedId === illness._id)
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
  const reportText = [
    `# ${member.name || '家人'}本次病程复诊摘要`,
    '',
    `整理时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '## 本次病程',
    ...(illnessLines.length ? illnessLines : ['暂无病程详情']),
    '',
    '## 想问医生的问题',
    ...(questions.length ? questions.map((item, index) => `${index + 1}. ${item}`) : ['暂无补充问题']),
    '',
    '## 时间线',
    ...(events.length ? events.map((item, index) => `${index + 1}. ${formatEventLine(item)}`) : ['暂无追加事件']),
    '',
    '## 用药记录',
    ...(medicationLogs.length
      ? medicationLogs.map(
          (item, index) =>
            formatMedicationReportLine(item, index),
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
  ].join('\n')

  return {
    illnessRecordId: illness._id,
    reportText,
    exportedAt: new Date().toISOString(),
  }
}

function reportField(label, value) {
  return value === undefined || value === null || value === '' ? '' : `- ${label}：${value}`
}

function formatMedicationReportLine(item, index) {
  const reaction = item.reaction ? `用药后反应：${item.reaction}` : '用药后反应：未填写'
  const note = item.note ? `｜备注：${item.note}` : ''
  return `${index + 1}. ${item.takenAt || '未记录时间'}｜${item.medicineNameSnapshot || '未命名药品'}｜${item.doseQuantity || 0}${item.doseUnit || ''}｜${reaction}${note}`
}

function formatEventLine(item) {
  const label = item.source === 'illness_completed' ? '恢复复盘' : eventTypeLabel(item.eventType)
  const parts = [item.recordedAt || '未记录时间', label]
  if (item.temperature) {
    parts.push(`${item.temperature}℃`)
  }
  if (item.symptoms && item.symptoms.length) {
    parts.push(item.symptoms.join('、'))
  }
  if (item.medicineNameSnapshot) {
    parts.push(`${item.medicineNameSnapshot} ${item.doseQuantity || 0}${item.doseUnit || ''}`)
  }
  if (item.prescribedMedicines && item.prescribedMedicines.length) {
    parts.push(`开药：${item.prescribedMedicines.map((medicine) => medicine.medicineNameSnapshot).join('、')}`)
  }
  if (item.note) {
    parts.push(item.note)
  }
  return parts.join('｜')
}

function eventTypeLabel(type) {
  const map = {
    symptom: '症状变化',
    temperature: '体温记录',
    medication: '用药记录',
    visit: '就诊',
    exam: '检查',
    note: '备注',
  }
  return map[type] || '记录'
}

async function assertRecordQuota(familyId, type) {
  const rule = QUOTA_RULES[type]
  if (!rule) {
    return
  }
  const entitlement = await getFamilyEntitlement(familyId)
  const limit = entitlement.limits[rule.limitKey]
  const used = await countForQuota(rule.collection, {
    familyId,
    deletedAt: _.exists(false),
  })
  if (used >= limit) {
    throw new Error(`${rule.label}已达到 ${limit} 条免费额度，请开通会员后继续使用`)
  }
}

async function assertAiQuota(familyId, usageType) {
  const entitlement = await getFamilyEntitlement(familyId)
  const limitKey = usageType === 'image_parse' ? 'aiImageParseMonthly' : 'aiAssistantMonthly'
  const used = await countForQuota('ai_usage_logs', {
    familyId,
    usageType,
    createdAt: _.gte(getMonthStart()),
  })
  if (used >= entitlement.limits[limitKey]) {
    throw new Error('本月 AI 使用次数已用完，请开通会员后继续使用')
  }
}

async function recordAiUsage(familyId, openid, usageType, relatedTaskId = '') {
  try {
    await db.collection('ai_usage_logs').add({
      data: {
        familyId,
        userOpenid: openid,
        usageType,
        count: 1,
        relatedTaskId,
        createdAt: db.serverDate(),
      },
    })
  } catch (error) {
    console.warn('ai_usage_logs not ready', error.message)
  }
}

async function assertFamilyRecord(collection, id, familyId) {
  const result = await db.collection(collection).doc(id).get()
  if (!result.data || result.data.familyId !== familyId || result.data.deletedAt) {
    throw new Error('record not found or no permission')
  }
  return result.data
}

async function assertTransactionFamilyRecord(transaction, collection, id, familyId) {
  const result = await transaction.collection(collection).doc(id).get()
  if (!result.data || result.data.familyId !== familyId || result.data.deletedAt) {
    throw new Error('record not found or no permission')
  }
  return result.data
}

async function assertFamilyRecords(collection, ids, familyId) {
  const records = []
  for (const id of ids) {
    records.push(await assertFamilyRecord(collection, id, familyId))
  }
  return records
}

async function assertSaveRecordRelations(type, payload, familyId) {
  if (type === 'illness') {
    if (!payload.memberId) {
      throw new Error('memberId is required')
    }
    await assertFamilyRecord('family_members', payload.memberId, familyId)
  }

  if (type === 'medicines' && payload.memberId) {
    await assertFamilyRecord('family_members', payload.memberId, familyId)
  }

  if (type === 'reminders') {
    if (!payload.memberId) {
      throw new Error('memberId is required')
    }
    await assertFamilyRecord('family_members', payload.memberId, familyId)
    if (payload.illnessRecordId) {
      const illness = await assertFamilyRecord('illness_records', payload.illnessRecordId, familyId)
      assertSameMember(illness, payload.memberId, 'illness record')
    }
  }

  if (type === 'attachments' && payload.relatedId) {
    const relatedCollections = {
      illness: 'illness_records',
      medicine: 'medicines',
      member: 'family_members',
    }
    const relatedCollection = relatedCollections[payload.relatedType]
    if (!relatedCollection) {
      throw new Error('invalid attachment relatedType')
    }
    await assertFamilyRecord(relatedCollection, payload.relatedId, familyId)
  }
}

function assertSameMember(record, memberId, label) {
  if (record.memberId && record.memberId !== memberId) {
    const labelText = label === 'medicine' ? '所选药品' : label === 'illness record' ? '关联病程' : label
    throw new Error(`${labelText}不属于当前家庭成员`)
  }
}

function normalizeClientRequestId(value) {
  const clientRequestId = String(value || '').trim()
  if (clientRequestId.length > 128) {
    throw new Error('clientRequestId is too long')
  }
  return clientRequestId
}

function createRequestFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function createDeterministicDocumentId(prefix, ...parts) {
  return `${prefix}_${createRequestFingerprint(parts).slice(0, 40)}`
}

function createOpaqueDocumentId(prefix) {
  return `${prefix}_${crypto.randomBytes(20).toString('hex')}`
}

function buildIdempotentMedicationResult(record, context) {
  if (
    record.familyId !== context.familyId ||
    record.createdBy !== context.openid ||
    record.clientRequestId !== context.clientRequestId
  ) {
    throw new Error('clientRequestId conflicts with an existing medication record')
  }
  if (record.requestFingerprint !== context.requestFingerprint) {
    throw new Error('clientRequestId was already used with different medication data')
  }
  const remainingQuantity = Number(record.remainingQuantityAfter)
  if (!Number.isFinite(remainingQuantity) || remainingQuantity < 0) {
    throw new Error('idempotent medication record is incomplete')
  }
  return {
    id: record._id || context.medicationLogId,
    medicineId: record.medicineId,
    remainingQuantity,
    clientRequestId: context.clientRequestId,
    idempotent: true,
  }
}

function assertImageParsingEnabled() {
  const provider = String(process.env.IMAGE_PARSING_PROVIDER || '').trim().toLowerCase()
  if (!isImageParsingConfigured()) {
    throw new Error('图片整理服务暂未开放')
  }
  return provider
}

function isImageParsingConfigured() {
  return process.env.ENABLE_IMAGE_PARSING === 'true'
    && String(process.env.IMAGE_PARSING_PROVIDER || '').trim().toLowerCase() === 'deepseek_vision'
    && Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim())
}

function normalizeAttachmentIds(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error('attachmentIds must be a non-empty array')
  }
  if (value.length > 20) {
    throw new Error('too many attachmentIds')
  }
  const ids = value.map((id) => String(id || '').trim())
  if (ids.some((id) => !id)) {
    throw new Error('attachmentIds contains an invalid id')
  }
  return [...new Set(ids)]
}

function haveSameIds(left, right) {
  return left.length === right.length && left.every((id) => right.includes(id))
}

async function findInviteByCode(inviteCode) {
  const result = await db
    .collection('family_invites')
    .where({
      inviteCode,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    throw new Error('invite not found')
  }
  return result.data[0]
}

async function findActiveInvite(inviteCode) {
  const result = await db
    .collection('family_invites')
    .where({
      inviteCode,
      status: 'active',
    })
    .limit(1)
    .get()

  if (!result.data.length) {
    throw new Error('邀请不存在或已失效')
  }
  const invite = result.data[0]
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    await db.collection('family_invites').doc(invite._id).update({
      data: {
        status: 'expired',
        updatedAt: db.serverDate(),
      },
    })
    throw new Error('邀请已过期')
  }
  if (Number(invite.usedCount || 0) >= Number(invite.maxUses || 1)) {
    throw new Error('邀请已被使用')
  }
  return invite
}

async function createUniqueInviteCode() {
  for (let index = 0; index < 5; index += 1) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase()
    const existing = await db
      .collection('family_invites')
      .where({
        inviteCode: code,
      })
      .limit(1)
      .get()
    if (!existing.data.length) {
      return code
    }
  }
  return `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`
}

async function countSharedUsers(familyId) {
  const result = await db
    .collection('family_roles')
    .where({
      familyId,
      deletedAt: _.exists(false),
    })
    .limit(100)
    .get()
  return result.data.filter((role) => role.role !== 'owner').length
}

async function countActiveInvites(familyId) {
  try {
    const result = await db
      .collection('family_invites')
      .where({
        familyId,
        status: 'active',
      })
      .limit(100)
      .get()
    return result.data.filter(
      (invite) => !invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now(),
    ).length
  } catch (error) {
    return 0
  }
}

async function safeCount(collection, query) {
  try {
    const result = await db.collection(collection).where(query).count()
    return result.total || 0
  } catch (error) {
    console.warn(`safeCount ${collection}`, error.message)
    return 0
  }
}

async function findUserByOpenid(openid) {
  const result = await db
    .collection('users')
    .where({
      openid,
    })
    .limit(1)
    .get()
  return result.data[0] || null
}

function isPublicUserId(value) {
  return /^\d{10}$/.test(String(value || ''))
}

async function createUniquePublicUserId() {
  for (let index = 0; index < 5; index += 1) {
    const publicUserId = String(crypto.randomInt(1000000000, 10000000000))
    const existing = await db.collection('users').where({ publicUserId }).limit(1).get()
    if (!existing.data.some((user) => user.publicUserId === publicUserId)) {
      return publicUserId
    }
  }
  throw new Error('unable to allocate user ID')
}

function normalizeFamily(family, role) {
  return {
    _id: family._id || role.familyId,
    name: family.name || '我的家庭健康记录',
    role: role.role,
    roleId: role._id,
    createdAt: family.createdAt || '',
    updatedAt: family.updatedAt || '',
  }
}

async function assertFamilyRoleTarget(roleId, familyId) {
  const result = await db.collection('family_roles').doc(roleId).get()
  if (!result.data || result.data.familyId !== familyId || result.data.deletedAt) {
    throw new Error('family role not found or no permission')
  }
  return result.data
}

function assertRole(role, allowedRoles) {
  if (!allowedRoles.includes(role)) {
    throw new Error('当前角色没有操作权限')
  }
}

function getMonthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
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

function buildParseDraft(imageKind) {
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
      medicinesText: '',
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

async function countForQuota(collection, query) {
  try {
    const result = await db.collection(collection).where(query).count()
    return result.total || 0
  } catch (error) {
    console.warn(`countForQuota ${collection}`, error.message)
    throw new Error('暂时无法核验使用额度，请稍后重试')
  }
}

function buildTextParseDraft() {
  return {
    symptoms: [],
    temperatureMax: '',
    hospitalName: '',
    doctorDiagnosis: '',
    doctorAdvice: '',
    examinationResult: '',
    medicinesText: '',
    summary: '',
  }
}

function buildTextParsePrompt(text) {
  const schema = '{"symptoms": [], "temperatureMax": "", "hospitalName": "", "doctorDiagnosis": "", "doctorAdvice": "", "examinationResult": "", "medicinesText": "", "summary": ""}'
  return [
    '你是家庭健康记录中的文字整理模块，不是医生。',
    '下面的内容是用户提供的原始描述，只把明确写出的事实整理成结构化字段。',
    '不要诊断疾病，不要猜测症状、体温、医院、检查结果、药品或用法；没有明确写出的字段填写空字符串或空数组。',
    'temperatureMax 只填写用户明确说出的最高体温数值，不要把普通数字当作体温。',
    'symptoms 只填写原文明确提到的症状，保持简短；medicinesText 只记录原文明确提到的药品和用法。',
    `请严格返回 JSON 对象，字段格式为：${schema}`,
    '【用户原始描述】',
    text,
  ].join('\n')
}

function normalizeTextParseOutput(output) {
  const source = output && typeof output === 'object' && !Array.isArray(output) ? output : {}
  const rawSymptoms = Array.isArray(source.symptoms) ? source.symptoms : String(source.symptoms || '').split(/[、,，\s]+/)
  const temperature = source.temperatureMax
  const numericTemperature = temperature !== '' && temperature !== null ? Number(temperature) : NaN
  return {
    symptoms: normalizeSymptoms(rawSymptoms),
    temperatureMax: Number.isFinite(numericTemperature) ? numericTemperature : '',
    hospitalName: textValue(source.hospitalName),
    doctorDiagnosis: textValue(source.doctorDiagnosis),
    doctorAdvice: textValue(source.doctorAdvice),
    examinationResult: textValue(source.examinationResult),
    medicinesText: textValue(source.medicinesText),
    summary: textValue(source.summary),
  }
}

function buildVisionPrompt(imageKind) {
  const schema = Object.keys(buildParseDraft(imageKind))
    .map((field) => `"${field}": ${field === 'symptoms' ? '[]' : '""'}`)
    .join(', ')
  return [
    '你是家庭健康记录中的图片资料整理模块，不是医生。',
    '请只识别图片中明确可见的内容，不要诊断疾病、推荐药品、修改剂量或补全看不清的信息。',
    '请严格返回 JSON 对象，不要返回 Markdown、解释或代码围栏。',
    `资料类型为 ${imageKind}，返回字段必须包含：{${schema}, "documentType": "", "rawText": "", "confidence": 0}`,
    '看不清或图片中不存在的字段填写空字符串；confidence 为 0 到 1 之间的识别把握度。',
    '病例、处方或检查图片中的 symptoms 只填写图片明确写出的症状或主诉，不要根据诊断名称推断；只代表资料记录，不代表你在做诊断。',
    '处方图片中的 medicinesText 请逐项整理药名、规格和用法用量；只代表医生开具记录，不代表用户已经购买或正在使用。',
  ].join('\n')
}

function normalizeVisionOutput(imageKind, output) {
  const source = unwrapVisionOutput(output)
  const normalized = buildParseDraft(imageKind)
  Object.keys(normalized).forEach((field) => {
    normalized[field] = field === 'symptoms'
      ? normalizeSymptoms(readVisionValue(source, field))
      : textValue(readVisionValue(source, field))
  })
  normalized.documentType = textValue(readVisionValue(source, 'documentType'))
  normalized.rawText = textValue(readVisionValue(source, 'rawText'))
  fillVisionFieldsFromRawText(imageKind, normalized)
  if (!normalized.summary && normalized.rawText && Object.hasOwn(normalized, 'summary')) {
    normalized.summary = normalized.rawText
  }
  const confidence = Number(readVisionValue(source, 'confidence'))
  normalized.confidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0
  return normalized
}

const VISION_FIELD_ALIASES = {
  doctorDiagnosis: ['doctorDiagnosis', 'doctorRecord', 'doctor_record', 'diagnosis', 'diagnoses', '医生记录', '医生诊断', '诊断'],
  doctorAdvice: ['doctorAdvice', 'doctor_advice', 'advice', '医生建议', '医嘱', '建议'],
  summary: ['summary', 'caseSummary', 'case_summary', 'summaryText', '病例摘要', '摘要'],
  name: ['name', 'medicineName', '药品名称', '药名'],
  specification: ['specification', '规格'],
  expireDate: ['expireDate', 'expiryDate', 'expirationDate', '有效期'],
  manufacturer: ['manufacturer', '厂家', '生产厂家'],
  approvalNo: ['approvalNo', 'approvalNumber', '批准文号'],
  instructionText: ['instructionText', 'instructions', '说明书重点', '用法用量'],
  contraindications: ['contraindications', '禁忌', '注意事项'],
  medicinesText: ['medicinesText', 'medicines', 'prescription', '处方药品', '药品与用法'],
  examinationResult: ['examinationResult', 'examination', 'testResult', '检查结果'],
  documentType: ['documentType', 'document_type', '资料类型', '文档类型'],
  rawText: ['rawText', 'raw_text', 'ocrText', 'text', '原文'],
  confidence: ['confidence', '置信度', '识别置信度'],
}

function unwrapVisionOutput(output) {
  const source = output && typeof output === 'object' && !Array.isArray(output) ? output : {}
  const nestedCandidates = [source.output, source.result, source.data, source.fields]
  return nestedCandidates.reduce((merged, candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return merged
    }
    return Object.entries(candidate).reduce((result, [key, value]) => {
      if (hasVisionValue(value) || !hasVisionValue(result[key])) {
        result[key] = value
      }
      return result
    }, { ...merged })
  }, source)
}

function readVisionValue(source, field) {
  const keys = VISION_FIELD_ALIASES[field] || [field]
  return keys.reduce((value, key) => (
    value !== '' && value !== undefined && value !== null
      ? value
      : source[key]
  ), '')
}

function hasVisionContent(output) {
  return Object.entries(output || {}).some(([key, value]) => (
    !['confidence', 'documentType', 'rawText'].includes(key) && Boolean(textValue(value))
  ))
}

function hasVisionValue(value) {
  if (Array.isArray(value)) {
    return value.some(hasVisionValue)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasVisionValue)
  }
  return typeof value === 'string'
    ? Boolean(value.trim())
    : value !== null && value !== undefined
}

const VISION_RAW_TEXT_LABELS = {
  medical_record: {
    symptoms: ['症状', '主要症状', '主诉', '临床表现'],
    doctorDiagnosis: ['医生记录', '医生诊断', '诊断'],
    doctorAdvice: ['医嘱', '诊疗意见'],
  },
  prescription: {
    symptoms: ['症状', '主要症状', '主诉'],
    doctorDiagnosis: ['医生记录', '医生诊断', '诊断'],
    doctorAdvice: ['医嘱', '诊疗意见'],
    medicinesText: ['处方药品', '用药情况', '药品'],
  },
  examination: {
    symptoms: ['症状', '主要症状', '主诉'],
    examinationResult: ['检查结果', '辅助检查结果', '检验结果'],
  },
  medicine_box: {
    name: ['药品名称', '通用名称', '药名'],
    specification: ['规格'],
    expireDate: ['有效期至', '有效期', '失效期'],
    manufacturer: ['生产厂家', '生产企业', '厂家'],
    approvalNo: ['批准文号'],
  },
  instruction: {
    name: ['药品名称', '通用名称', '药名'],
    instructionText: ['用法用量', '说明书重点'],
    contraindications: ['禁忌', '注意事项'],
  },
}

function fillVisionFieldsFromRawText(imageKind, normalized) {
  const rawText = String(normalized.rawText || '').trim()
  const labelsByField = VISION_RAW_TEXT_LABELS[imageKind]
  if (!rawText || !labelsByField) {
    return
  }
  Object.entries(labelsByField).forEach(([field, labels]) => {
    if (!hasFieldValue(normalized[field])) {
      const value = extractVisionLabeledText(rawText, labels)
      normalized[field] = field === 'symptoms' ? normalizeSymptoms(value) : value
    }
  })
}

async function syncPrescriptionMedicines(openid, familyId, illness, medicinesText, source = '处方识别') {
  const candidates = parsePrescriptionMedicineText(medicinesText)
  if (!candidates.length || !illness.memberId) {
    return []
  }
  const member = await assertFamilyRecord('family_members', illness.memberId, familyId)
  const existingResult = await db
    .collection('medicines')
    .where({
      familyId,
      memberId: illness.memberId,
      deletedAt: _.exists(false),
    })
    .limit(100)
    .get()
  const existingMedicines = existingResult.data || []
  const medicineIds = []

  for (const candidate of candidates) {
    const existing = existingMedicines.find((item) => (
      normalizeMedicineMatch(item.name) === normalizeMedicineMatch(candidate.name)
      && normalizeMedicineMatch(item.specification) === normalizeMedicineMatch(candidate.specification)
    ))
    if (existing) {
      medicineIds.push(existing._id)
      continue
    }

    await assertRecordQuota(familyId, 'medicines')
    const medicineId = createDeterministicDocumentId(
      'prescription_medicine',
      familyId,
      illness.memberId,
      candidate.name,
      candidate.specification,
    )
    const data = {
      familyId,
      memberId: illness.memberId,
      memberNameSnapshot: member.name || '',
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
      source,
      indicationsText: '',
      instructionText: '',
      note: `来自病程${source}：${candidate.text}`,
      createdBy: openid,
      createdAt: db.serverDate(),
      updatedBy: openid,
      updatedAt: db.serverDate(),
    }
    await db.collection('medicines').doc(medicineId).set({ data })
    existingMedicines.push({ _id: medicineId, ...data })
    medicineIds.push(medicineId)
  }
  return Array.from(new Set(medicineIds))
}

function buildRecognizedMedicineText(imageKind, output = {}) {
  if (imageKind === 'prescription') {
    return textValue(output.medicinesText)
  }
  if (!['medicine_box', 'instruction'].includes(imageKind)) {
    return ''
  }
  return [textValue(output.name), textValue(output.specification)]
    .filter(Boolean)
    .join(' ')
}

async function syncPrescriptionMedicineLinks(openid, familyId, illnessRecordId, medicineIds) {
  if (!medicineIds.length) {
    return
  }
  const family = await getCurrentFamily(openid, familyId)
  const result = await db
    .collection('course_events')
    .where({
      familyId: family._id,
      illnessRecordId,
      source: 'illness_created',
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()
  if (!result.data.length) {
    return
  }
  const event = result.data[0]
  const existingIds = Array.isArray(event.prescribedMedicineIds) ? event.prescribedMedicineIds : []
  const prescribedMedicineIds = Array.from(new Set([...existingIds, ...medicineIds]))
  const prescribedMedicineRecords = await assertFamilyRecords('medicines', prescribedMedicineIds, family._id)
  await db.collection('course_events').doc(event._id).update({
    data: {
      eventType: 'visit',
      prescribedMedicineIds,
      prescribedMedicines: prescribedMedicineRecords.map((item) => ({
        medicineId: item._id,
        medicineNameSnapshot: item.name || '',
        unitSnapshot: item.unit || '',
      })),
      updatedBy: openid,
      updatedAt: db.serverDate(),
    },
  })
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
  return textValue(value).replace(/\s+/g, '').toLowerCase()
}

function extractVisionLabeledText(rawText, labels) {
  const lines = String(rawText || '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^${escapeRegExp(label)}\\s*[：:]\\s*(.+)$`))
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  }
  return ''
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textValue(value) {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join('；')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = textValue(item)
        return text ? `${key}：${text}` : ''
      })
      .filter(Boolean)
      .join('；')
  }
  return ''
}

function hasFieldValue(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(textValue(value))
}

function normalizeSymptoms(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[、,，；;\n]+/)
  return Array.from(new Set(values.map((item) => textValue(item)).filter(Boolean)))
}

function buildAiSummary(imageKind, output) {
  if (imageKind === 'medical_record') {
    return `病例整理：${output.summary || output.doctorDiagnosis || output.doctorAdvice || '待补充'}`
  }
  if (imageKind === 'medicine_box') {
    return `包装信息：${output.name || '未填写药名'} ${output.specification || ''} ${output.expireDate || ''}`.trim()
  }
  if (imageKind === 'instruction') {
    return `说明书整理：${output.instructionText || '待补充'}`
  }
  if (imageKind === 'prescription') {
    const medicineText = output.medicinesText ? `处方药品：${output.medicinesText}` : ''
    const adviceText = output.doctorAdvice || output.summary || '待补充'
    return [`医嘱整理：${adviceText}`, medicineText].filter(Boolean).join('；')
  }
  return `检查单整理：${output.examinationResult || output.summary || '待补充'}`
}

function toTime(value) {
  if (!value) {
    return 0
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function ok(data) {
  return {
    ok: true,
    data: sanitizeClientData(data),
  }
}

function sanitizeClientData(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeClientData)
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateIdentityField(key))
      .map(([key, item]) => [key, sanitizeClientData(item)]),
  )
}

function isPrivateIdentityField(key) {
  const normalized = String(key || '').toLowerCase()
  return normalized.includes('openid') || [
    '_openid',
    'createdby',
    'updatedby',
    'completedby',
    'archivedby',
    'confirmedby',
  ].includes(normalized)
}

function fail(message) {
  return {
    ok: false,
    message,
  }
}

module.exports.normalizeVisionOutput = normalizeVisionOutput
module.exports.hasVisionContent = hasVisionContent
