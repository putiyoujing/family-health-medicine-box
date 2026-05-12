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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action
  const payload = event.payload || {}

  try {
    switch (action) {
      case 'getHome':
        return ok(await getHome(openid))
      case 'saveMember':
        return ok(await saveRecord(openid, 'members', payload))
      case 'deleteMember':
        return ok(await deleteRecord(openid, 'members', payload.id))
      case 'saveMedicine':
        return ok(await saveRecord(openid, 'medicines', payload))
      case 'deleteMedicine':
        return ok(await deleteRecord(openid, 'medicines', payload.id))
      case 'saveIllness':
        return ok(await saveRecord(openid, 'illness', payload))
      case 'deleteIllness':
        return ok(await deleteRecord(openid, 'illness', payload.id))
      case 'saveMedication':
        return ok(await saveMedication(openid, payload))
      case 'deleteMedication':
        return ok(await deleteRecord(openid, 'medication', payload.id))
      case 'saveAttachment':
        return ok(await saveRecord(openid, 'attachments', payload))
      case 'deleteAttachment':
        return ok(await deleteRecord(openid, 'attachments', payload.id))
      case 'saveReminder':
        return ok(await saveRecord(openid, 'reminders', payload))
      case 'deleteReminder':
        return ok(await deleteRecord(openid, 'reminders', payload.id))
      case 'assistantQuery':
        return ok(await assistantQuery(openid, payload.question || ''))
      case 'exportData':
        return ok(await exportData(openid))
      default:
        return fail(`unknown action: ${action || 'empty'}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'server error')
  }
}

async function getHome(openid) {
  const family = await getFamily(openid)
  const familyId = family._id
  const [members, medicines, illnessRecords, medicationLogs, attachments, reminders] =
    await Promise.all([
      listByFamily('family_members', familyId),
      listByFamily('medicines', familyId),
      listByFamily('illness_records', familyId),
      listByFamily('medication_logs', familyId),
      listByFamily('attachments', familyId),
      listByFamily('reminders', familyId),
    ])

  return {
    safetyNotice: SAFETY_NOTICE,
    family,
    members,
    medicines,
    illnessRecords,
    medicationLogs,
    attachments,
    reminders,
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

async function getFamily(openid) {
  const roleResult = await db
    .collection('family_roles')
    .where({
      openid,
    })
    .limit(1)
    .get()

  if (roleResult.data.length) {
    const family = await db.collection('families').doc(roleResult.data[0].familyId).get()
    return {
      ...family.data,
      role: roleResult.data[0].role,
    }
  }

  const now = db.serverDate()
  const familyResult = await db.collection('families').add({
    data: {
      ownerOpenid: openid,
      name: '我的家庭健康记录',
      membersOpenids: [openid],
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
    },
  })

  const family = await db.collection('families').doc(familyResult._id).get()
  return {
    ...family.data,
    role: 'owner',
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

async function saveRecord(openid, type, payload) {
  const family = await getFamily(openid)
  const collection = COLLECTIONS[type]
  if (!collection) {
    throw new Error('invalid collection type')
  }

  const now = db.serverDate()
  const data = {
    ...payload,
    familyId: family._id,
    updatedBy: openid,
    updatedAt: now,
  }
  delete data._id
  delete data.id

  const id = payload._id || payload.id
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

async function deleteRecord(openid, type, id) {
  const family = await getFamily(openid)
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

async function saveMedication(openid, payload) {
  const family = await getFamily(openid)
  const now = db.serverDate()
  const medicineId = payload.medicineId
  const doseQuantity = Number(payload.doseQuantity || 0)

  if (!medicineId || doseQuantity <= 0) {
    throw new Error('medicineId and doseQuantity are required')
  }

  const medicine = await assertFamilyRecord('medicines', medicineId, family._id)
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

async function assistantQuery(openid, question) {
  const home = await getHome(openid)
  const normalized = String(question || '').trim().toLowerCase()

  if (!normalized) {
    return {
      intent: '等待问题',
      answer: '请输入问题，我会只基于当前家庭记录做检索和整理。',
      facts: [],
      safetyNotice: SAFETY_NOTICE,
    }
  }

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
    const facts = home.medicines
      .filter((medicine) =>
        [medicine.name, medicine.category, medicine.location, medicine.indicationsText]
          .join(' ')
          .toLowerCase()
          .includes(normalized.replace('家里有没有', '').replace('？', '').trim()),
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

async function exportData(openid) {
  const home = await getHome(openid)
  return {
    exportedAt: new Date().toISOString(),
    safetyNotice: SAFETY_NOTICE,
    data: home,
  }
}

async function assertFamilyRecord(collection, id, familyId) {
  const result = await db.collection(collection).doc(id).get()
  if (!result.data || result.data.familyId !== familyId) {
    throw new Error('record not found or no permission')
  }
  return result.data
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
