const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const SAFETY_NOTICE =
  '本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。'

const COLLECTIONS = {
  members: 'family_members',
  medicines: 'medicines',
  illness: 'illness_records',
  medication: 'medication_logs',
  attachments: 'attachments',
  reminders: 'reminders',
}

const VIEW_ROLES = ['owner', 'admin', 'member', 'viewer']
const EDIT_ROLES = ['owner', 'admin', 'member']
const MANAGE_ROLES = ['owner', 'admin']

const FREE_LIMITS = {
  maxMembers: 3,
  maxSharedUsers: 1,
  sharedRoles: ['viewer'],
  maxMedicines: 30,
  maxHealthRecords: 30,
  maxMedicationLogs: 100,
  maxAttachments: 30,
  aiImageParseMonthly: 3,
  aiAssistantMonthly: 10,
  exportData: false,
  familyMonthlyReport: false,
}

const PRO_LIMITS = {
  maxMembers: 10,
  maxSharedUsers: 6,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxMedicines: 300,
  maxHealthRecords: 3000,
  maxMedicationLogs: 10000,
  maxAttachments: 1000,
  aiImageParseMonthly: 100,
  aiAssistantMonthly: 300,
  exportData: true,
  familyMonthlyReport: true,
}

const QUOTA_RULES = {
  members: {
    collection: 'family_members',
    limitKey: 'maxMembers',
    label: '家庭成员',
  },
  medicines: {
    collection: 'medicines',
    limitKey: 'maxMedicines',
    label: '药品',
  },
  illness: {
    collection: 'illness_records',
    limitKey: 'maxHealthRecords',
    label: '健康记录',
  },
  medication: {
    collection: 'medication_logs',
    limitKey: 'maxMedicationLogs',
    label: '用药记录',
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
    switch (action) {
      case 'getHome':
        return ok(await getHome(openid, familyId))
      case 'listMyFamilies':
        return ok(await listMyFamilies(openid))
      case 'switchFamily':
        return ok(await switchFamily(openid, payload.familyId || familyId))
      case 'getMembershipStatus':
      case 'getEntitlement':
        return ok(await getMembershipStatus(openid, familyId))
      case 'getFamilyInvite':
        return ok(await getFamilyInvite(payload.inviteCode || payload.code))
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
        return ok(await deleteRecord(openid, familyId, 'members', payload.id))
      case 'saveMedicine':
        return ok(await saveRecord(openid, familyId, 'medicines', payload))
      case 'deleteMedicine':
        return ok(await deleteRecord(openid, familyId, 'medicines', payload.id))
      case 'saveIllness':
        return ok(await saveRecord(openid, familyId, 'illness', payload))
      case 'deleteIllness':
        return ok(await deleteRecord(openid, familyId, 'illness', payload.id))
      case 'saveMedication':
        return ok(await saveMedication(openid, familyId, payload))
      case 'deleteMedication':
        return ok(await deleteRecord(openid, familyId, 'medication', payload.id))
      case 'saveAttachment':
        return ok(await saveRecord(openid, familyId, 'attachments', payload))
      case 'deleteAttachment':
        return ok(await deleteRecord(openid, familyId, 'attachments', payload.id))
      case 'saveReminder':
        return ok(await saveRecord(openid, familyId, 'reminders', payload))
      case 'deleteReminder':
        return ok(await deleteRecord(openid, familyId, 'reminders', payload.id))
      case 'parseAttachment':
        return ok(await parseAttachment(openid, familyId, payload))
      case 'getAiTask':
        return ok(await getAiTask(openid, familyId, payload.taskId))
      case 'confirmAiParseResult':
        return ok(await confirmAiParseResult(openid, familyId, payload))
      case 'assistantQuery':
        return ok(await assistantQuery(openid, familyId, payload.question || ''))
      case 'exportData':
        return ok(await exportData(openid, familyId))
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
  const family = await getCurrentFamily(openid, familyId)
  const currentFamilyId = family._id
  const [members, medicines, illnessRecords, medicationLogs, attachments, reminders, familyList] =
    await Promise.all([
      listByFamily('family_members', currentFamilyId),
      listByFamily('medicines', currentFamilyId),
      listByFamily('illness_records', currentFamilyId),
      listByFamily('medication_logs', currentFamilyId),
      listByFamily('attachments', currentFamilyId),
      listByFamily('reminders', currentFamilyId),
      listMyFamilies(openid),
    ])

  return {
    safetyNotice: SAFETY_NOTICE,
    family,
    families: familyList.families,
    currentFamilyId: family._id,
    members,
    medicines,
    illnessRecords,
    medicationLogs,
    attachments,
    reminders,
    entitlement: family.entitlement,
    stats: {
      members: members.length,
      medicines: medicines.length,
      illnessRecords: illnessRecords.length,
      medicationLogs: medicationLogs.length,
      attachments: attachments.length,
      reminders: reminders.length,
    },
  }
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
    return result.data[0]
  }

  const now = db.serverDate()
  const userResult = await db.collection('users').add({
    data: {
      openid,
      nickname: '',
      avatarUrl: '',
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
    currentFamilyId: '',
  }
}

async function ensureDefaultFamily(openid) {
  const roleResult = await db
    .collection('family_roles')
    .where({
      openid,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get()

  if (roleResult.data.length) {
    return roleResult.data[0].familyId
  }

  const user = await getUser(openid)
  const now = db.serverDate()
  const familyResult = await db.collection('families').add({
    data: {
      ownerOpenid: openid,
      name: '我的家庭健康记录',
      membersOpenids: [openid],
      plan: 'free',
      proExpireAt: null,
      proSource: '',
      proUpdatedAt: null,
      currentQuotaSnapshot: FREE_LIMITS,
      createdAt: now,
      updatedAt: now,
    },
  })

  await db.collection('family_roles').add({
    data: {
      familyId: familyResult._id,
      openid,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    },
  })

  await db.collection('users').doc(user._id).update({
    data: {
      currentFamilyId: familyResult._id,
      updatedAt: now,
    },
  })

  return familyResult._id
}

async function listMyFamilies(openid) {
  await ensureDefaultFamily(openid)
  const user = await getUser(openid)
  const rolesResult = await db
    .collection('family_roles')
    .where({
      openid,
      deletedAt: _.exists(false),
    })
    .limit(50)
    .get()

  const families = (
    await Promise.all(
      rolesResult.data.map(async (role) => {
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

  return {
    currentFamilyId,
    families,
  }
}

async function getCurrentFamily(openid, familyId) {
  const list = await listMyFamilies(openid)
  const targetId = familyId || list.currentFamilyId
  const family = list.families.find((item) => item._id === targetId)

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
  const isPro = family && family.plan === 'pro' && expireAt > Date.now()
  const limits = isPro ? PRO_LIMITS : FREE_LIMITS

  return {
    plan: isPro ? 'pro' : 'free',
    planName: isPro ? '会员版' : '免费版',
    proExpireAt: isPro ? family.proExpireAt : null,
    limits,
  }
}

async function getMembershipStatus(openid, familyId) {
  const family = await getCurrentFamily(openid, familyId)
  const entitlement = await getFamilyEntitlement(family._id)
  const usage = await buildFamilyUsage(family._id)

  return {
    family,
    entitlement,
    usage,
    plans: [
      {
        planId: 'yearly_pro',
        name: '年度会员',
        price: 9900,
        displayPrice: '99',
        durationDays: 365,
        badge: '推荐',
      },
      {
        planId: 'monthly_pro',
        name: '月度会员',
        price: 990,
        displayPrice: '9.9',
        durationDays: 30,
      },
    ],
  }
}

async function buildFamilyUsage(familyId) {
  const monthStart = getMonthStart()
  const [members, sharedUsers, medicines, illnessRecords, medicationLogs, attachments, aiImageParse, aiAssistant] =
    await Promise.all([
      safeCount('family_members', { familyId, deletedAt: _.exists(false) }),
      countSharedUsers(familyId),
      safeCount('medicines', { familyId, deletedAt: _.exists(false) }),
      safeCount('illness_records', { familyId, deletedAt: _.exists(false) }),
      safeCount('medication_logs', { familyId, deletedAt: _.exists(false) }),
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
    ])

  return {
    members,
    sharedUsers,
    medicines,
    healthRecords: illnessRecords,
    medicationLogs,
    attachments,
    aiImageParseMonthly: aiImageParse,
    aiAssistantMonthly: aiAssistant,
  }
}

async function listByFamily(collection, familyId) {
  const result = await db
    .collection(collection)
    .where({
      familyId,
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  return result.data
}

async function saveRecord(openid, familyId, type, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  const collection = COLLECTIONS[type]
  if (!collection) {
    throw new Error('invalid collection type')
  }

  const now = db.serverDate()
  const id = payload._id || payload.id
  const data = {
    ...payload,
    familyId: family._id,
    updatedBy: openid,
    updatedAt: now,
  }
  delete data._id
  delete data.id

  if (id) {
    await assertFamilyRecord(collection, id, family._id)
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

async function saveMedication(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  await assertRecordQuota(family._id, 'medication')
  const now = db.serverDate()
  const medicineId = payload.medicineId
  const doseQuantity = Number(payload.doseQuantity || 0)

  if (!medicineId || doseQuantity <= 0) {
    throw new Error('medicineId and doseQuantity are required')
  }

  const medicine = await assertFamilyRecord('medicines', medicineId, family._id)
  if (payload.illnessRecordId) {
    await assertFamilyRecord('illness_records', payload.illnessRecordId, family._id)
  }
  const remainingQuantity = Math.max(0, Number(medicine.remainingQuantity || 0) - doseQuantity)

  const result = await db.collection('medication_logs').add({
    data: {
      ...payload,
      familyId: family._id,
      medicineNameSnapshot: medicine.name,
      doseQuantity,
      createdBy: openid,
      updatedBy: openid,
      createdAt: now,
      updatedAt: now,
    },
  })

  await db.collection('medicines').doc(medicineId).update({
    data: {
      remainingQuantity,
      updatedBy: openid,
      updatedAt: now,
    },
  })

  return {
    id: result._id,
    medicineId,
    remainingQuantity,
  }
}

async function parseAttachment(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, EDIT_ROLES)
  await assertAiQuota(family._id, 'image_parse')
  const fileId = payload.fileId
  if (!fileId) {
    throw new Error('fileId is required')
  }
  const imageKind = payload.imageKind || 'medicine_box'
  const output = buildParseDraft(imageKind)
  const now = db.serverDate()
  const result = await db.collection('ai_tasks').add({
    data: {
      familyId: family._id,
      userOpenid: openid,
      taskType: 'image_parse',
      provider: 'local_stub',
      model: 'manual-confirm-v1',
      imageKind,
      attachmentIds: payload.attachmentIds || [],
      input: {
        fileId,
        relatedType: payload.relatedType || '',
      },
      output,
      status: 'success',
      errorMessage: '',
      tokenUsage: {},
      createdAt: now,
      updatedAt: now,
    },
  })
  await recordAiUsage(family._id, openid, 'image_parse', result._id)
  return {
    task: {
      _id: result._id,
      status: 'success',
      imageKind,
    },
    output,
  }
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
  const output = payload.output || {}
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

  const attachmentId = task.attachmentIds && task.attachmentIds[0]
  if (attachmentId) {
    try {
      await db.collection('attachments').doc(attachmentId).update({
        data: {
          aiStructured: output,
          aiSummary: buildAiSummary(task.imageKind, output),
          updatedBy: openid,
          updatedAt: now,
        },
      })
    } catch (error) {
      console.warn('attachment update skipped', error.message)
    }
  }

  return {
    taskId,
    output,
    status: 'confirmed',
  }
}

async function getFamilyInvite(inviteCode) {
  if (!inviteCode) {
    throw new Error('inviteCode is required')
  }
  const invite = await findActiveInvite(inviteCode)
  return {
    inviteCode: invite.inviteCode,
    familyId: invite.familyId,
    familyNameSnapshot: invite.familyNameSnapshot,
    inviterNameSnapshot: invite.inviterNameSnapshot || '家人',
    role: invite.role,
    expiresAt: invite.expiresAt,
    privacyNotice:
      '加入后，对方将能够根据你的角色权限查看或编辑该家庭空间内的药箱、健康记录、用药记录和附件。请仅接受你信任的家庭成员邀请。',
  }
}

async function createFamilyInvite(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const entitlement = await getFamilyEntitlement(family._id)
  const role = payload.role || 'viewer'

  if (!entitlement.limits.sharedRoles.includes(role)) {
    throw new Error('当前版本不支持邀请该角色，请开通会员后再试')
  }

  const sharedUsers = await countSharedUsers(family._id)
  const activeInvites = await countActiveInvites(family._id)
  if (sharedUsers + activeInvites >= entitlement.limits.maxSharedUsers) {
    throw new Error(`共享成员已达到 ${entitlement.limits.maxSharedUsers} 人上限`)
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
    role,
    expiresAt,
    path: `/pages/family/accept?code=${inviteCode}`,
  }
}

async function acceptFamilyInvite(openid, inviteCode) {
  if (!inviteCode) {
    throw new Error('inviteCode is required')
  }
  const invite = await findActiveInvite(inviteCode)
  if (invite.inviterOpenid === openid) {
    throw new Error('不能接受自己创建的邀请')
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
    await switchFamily(openid, invite.familyId)
    return {
      familyId: invite.familyId,
      mode: 'already_joined',
    }
  }

  const entitlement = await getFamilyEntitlement(invite.familyId)
  const sharedUsers = await countSharedUsers(invite.familyId)
  if (sharedUsers >= entitlement.limits.maxSharedUsers) {
    throw new Error('该家庭共享成员已满')
  }
  if (!entitlement.limits.sharedRoles.includes(invite.role)) {
    throw new Error('该邀请角色已超出当前家庭权益')
  }

  const now = db.serverDate()
  await db.collection('family_roles').add({
    data: {
      familyId: invite.familyId,
      openid,
      role: invite.role,
      joinedByInviteCode: invite.inviteCode,
      createdAt: now,
      updatedAt: now,
    },
  })

  const family = await db.collection('families').doc(invite.familyId).get()
  const membersOpenids = Array.from(new Set([...(family.data.membersOpenids || []), openid]))
  await db.collection('families').doc(invite.familyId).update({
    data: {
      membersOpenids,
      updatedAt: now,
    },
  })

  await db.collection('family_invites').doc(invite._id).update({
    data: {
      usedCount: Number(invite.usedCount || 0) + 1,
      acceptedOpenids: [...(invite.acceptedOpenids || []), openid],
      status: Number(invite.usedCount || 0) + 1 >= Number(invite.maxUses || 1) ? 'accepted' : 'active',
      updatedAt: now,
    },
  })

  await switchFamily(openid, invite.familyId)
  return {
    familyId: invite.familyId,
    role: invite.role,
    mode: 'joined',
  }
}

async function listFamilyRoles(openid, familyId) {
  const family = await getCurrentFamily(openid, familyId)
  await assertFamilyAccess(openid, family._id, VIEW_ROLES)
  const result = await db
    .collection('family_roles')
    .where({
      familyId: family._id,
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get()

  const roles = await Promise.all(
    result.data.map(async (role) => {
      const user = await findUserByOpenid(role.openid)
      return {
        ...role,
        nickname: (user && user.nickname) || maskOpenid(role.openid),
        avatarUrl: (user && user.avatarUrl) || '',
        isCurrentUser: role.openid === openid,
      }
    }),
  )

  return {
    family,
    roles,
  }
}

async function updateFamilyRole(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const targetOpenid = payload.openid
  const role = payload.role
  if (!targetOpenid || !role) {
    throw new Error('openid and role are required')
  }
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw new Error('invalid role')
  }
  const entitlement = await getFamilyEntitlement(family._id)
  if (!entitlement.limits.sharedRoles.includes(role)) {
    throw new Error('当前家庭权益不支持该角色')
  }
  const targetRole = await assertFamilyAccess(targetOpenid, family._id, VIEW_ROLES)
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
    openid: targetOpenid,
    role,
  }
}

async function removeFamilyUser(openid, familyId, payload) {
  const family = await getCurrentFamily(openid, familyId)
  assertRole(family.role, MANAGE_ROLES)
  const targetOpenid = payload.openid
  if (!targetOpenid) {
    throw new Error('openid is required')
  }
  const targetRole = await assertFamilyAccess(targetOpenid, family._id, VIEW_ROLES)
  if (targetRole.role === 'owner') {
    throw new Error('家庭创建者不能直接移除')
  }
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
    openid: targetOpenid,
    mode: 'removed',
  }
}

async function assistantQuery(openid, familyId, question) {
  const home = await getHome(openid, familyId)
  await assertAiQuota(home.family._id, 'assistant_query')
  const normalized = String(question || '').trim().toLowerCase()

  if (!normalized) {
    return {
      intent: '等待问题',
      answer: '请输入问题，我会只基于当前家庭记录做检索和整理。',
      facts: [],
      safetyNotice: SAFETY_NOTICE,
    }
  }

  await recordAiUsage(home.family._id, openid, 'assistant_query')

  if (hasAny(normalized, ['肺炎', '诊断', '是不是', '该吃', '剂量', '换药', '停药'])) {
    return {
      intent: '医疗诊断或处方风险',
      answer:
        '这个问题涉及诊断、处方或剂量判断，系统不能替代医生回答。你可以补充医生医嘱、检查单或历史记录，我可以帮你整理成复诊沟通摘要。',
      facts: ['已触发医疗安全边界，未给出诊断或用药建议。'],
      safetyNotice: SAFETY_NOTICE,
    }
  }

  if (hasAny(normalized, ['过期', '快过期', '有效期'])) {
    const facts = home.medicines
      .filter((medicine) => daysUntil(medicine.expireDate) <= 60)
      .map(
        (medicine) =>
          `${medicine.name}：有效期 ${medicine.expireDate || '未记录'}，剩余 ${medicine.remainingQuantity || 0}${medicine.unit || ''}`,
      )
    return {
      intent: '药品有效期查询',
      answer: facts.length ? `当前有 ${facts.length} 个药品在 60 天内到期或已过期。` : '当前没有 60 天内到期的药品记录。',
      facts,
      safetyNotice: SAFETY_NOTICE,
    }
  }

  if (hasAny(normalized, ['药', '有没有', '还剩', '药箱', '退烧', '咳嗽', '鼻炎', '腹泻'])) {
    const keyword = normalized.replace('家里有没有', '').replace('？', '').trim()
    const facts = home.medicines
      .filter((medicine) =>
        [medicine.name, medicine.category, medicine.location, medicine.indicationsText]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
      .map(
        (medicine) =>
          `${medicine.name}：${medicine.category || '未分类'}，剩余 ${medicine.remainingQuantity || 0}${medicine.unit || ''}，位置 ${medicine.location || '未记录'}`,
      )
    return {
      intent: '药箱库存查询',
      answer: facts.length ? `根据药箱记录，找到 ${facts.length} 个相关药品。` : '没有精确匹配药品，请检查药品名称或分类记录。',
      facts,
      safetyNotice: SAFETY_NOTICE,
    }
  }

  const latest = home.illnessRecords[0]
  const logs = latest
    ? home.medicationLogs.filter((log) => log.illnessRecordId === latest._id)
    : []

  return {
    intent: '历史记录整理',
    answer: latest ? '我按最近一条健康记录整理了历史情况和关联用药。' : '当前还没有健康记录。',
    facts: latest
      ? [
          `最近记录：${latest.startedAt || '未记录时间'}，症状 ${(latest.symptoms || []).join('、') || '未填'}`,
          `状态：${latest.status || '未填'}，最高体温：${latest.temperatureMax || '未记录'}`,
          ...logs.map(
            (log) =>
              `${log.takenAt || '未记录时间'} 使用 ${log.medicineNameSnapshot || '未命名药品'} ${log.doseQuantity || 0}${log.doseUnit || ''}`,
          ),
        ]
      : [],
    safetyNotice: SAFETY_NOTICE,
  }
}

async function exportData(openid, familyId) {
  const home = await getHome(openid, familyId)
  if (!home.entitlement.limits.exportData) {
    throw new Error('数据导出为会员权益，请开通会员后使用')
  }
  return {
    exportedAt: new Date().toISOString(),
    safetyNotice: SAFETY_NOTICE,
    data: home,
  }
}

async function exportReport(openid, familyId, payload) {
  const home = await getHome(openid, familyId)
  if (!home.entitlement.limits.exportData) {
    throw new Error('导出就医记录为会员权益，请开通会员后使用')
  }
  const days = Number(payload.days || 30)
  const since = Date.now() - days * 86400000
  const recentIllness = home.illnessRecords.filter((item) => toTime(item.startedAt || item.createdAt) >= since)
  const recentMedication = home.medicationLogs.filter((item) => toTime(item.takenAt || item.createdAt) >= since)
  const expiring = home.medicines.filter((medicine) => daysUntil(medicine.expireDate) <= 60)
  const reportText = [
    `# ${home.family.name || '家庭'}就医沟通记录`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    `导出范围：最近 ${days} 天`,
    '',
    '## 安全提示',
    SAFETY_NOTICE,
    '',
    '## 最近健康记录',
    ...(recentIllness.length
      ? recentIllness.map(
          (item, index) =>
            `${index + 1}. ${item.startedAt || '未记录时间'}｜${(item.symptoms || []).join('、') || '未填'}｜${item.summary || item.symptomDescription || '暂无总结'}`,
        )
      : ['暂无健康记录']),
    '',
    '## 用药时间线',
    ...(recentMedication.length
      ? recentMedication.map(
          (item, index) =>
            `${index + 1}. ${item.takenAt || '未记录时间'}｜${item.medicineNameSnapshot || '未命名药品'}｜${item.doseQuantity || 0}${item.doseUnit || ''}｜${item.reaction || '暂无反应记录'}`,
        )
      : ['暂无用药记录']),
    '',
    '## 需关注药品',
    ...(expiring.length
      ? expiring.map(
          (item, index) =>
            `${index + 1}. ${item.name}｜有效期 ${item.expireDate || '未记录'}｜剩余 ${item.remainingQuantity || 0}${item.unit || ''}`,
        )
      : ['暂无 60 天内到期药品']),
  ].join('\n')

  return {
    days,
    reportText,
    exportedAt: new Date().toISOString(),
  }
}

async function assertRecordQuota(familyId, type) {
  const rule = QUOTA_RULES[type]
  if (!rule) {
    return
  }
  const entitlement = await getFamilyEntitlement(familyId)
  const limit = entitlement.limits[rule.limitKey]
  const used = await safeCount(rule.collection, {
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
  const used = await safeCount('ai_usage_logs', {
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

function normalizeFamily(family, role) {
  return {
    ...family,
    _id: family._id || role.familyId,
    role: role.role,
    roleId: role._id,
  }
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

function buildAiSummary(imageKind, output) {
  if (imageKind === 'medicine_box') {
    return `药盒信息：${output.name || '未填写药名'} ${output.specification || ''} ${output.expireDate || ''}`.trim()
  }
  if (imageKind === 'instruction') {
    return `说明书整理：${output.instructionText || '待补充'}`
  }
  if (imageKind === 'prescription') {
    return `医嘱整理：${output.doctorAdvice || output.summary || '待补充'}`
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

function maskOpenid(openid) {
  if (!openid) {
    return '家庭成员'
  }
  return `${openid.slice(0, 4)}...${openid.slice(-4)}`
}

function ok(data) {
  return {
    ok: true,
    data,
  }
}

function fail(message) {
  return {
    ok: false,
    message,
  }
}
