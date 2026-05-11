const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'getDashboard'
  const payload = event.payload || {}

  try {
    await assertAdmin(openid)

    switch (action) {
      case 'getDashboard':
        return ok(await getDashboard())
      case 'listUsers':
        return ok(await pageList('users', payload))
      case 'listFamilies':
        return ok(await pageList('families', payload))
      case 'listMedicines':
        return ok(await pageList('medicines', payload))
      case 'listIllness':
        return ok(await pageList('illness_records', payload))
      case 'listMedication':
        return ok(await pageList('medication_logs', payload))
      case 'listAttachments':
        return ok(await pageList('attachments', payload))
      default:
        return fail(`unknown admin action: ${action}`)
    }
  } catch (error) {
    console.error(action, error)
    return fail(error.message || 'admin server error')
  }
}

async function assertAdmin(openid) {
  const result = await db
    .collection('admins')
    .where({
      openid,
      status: 'active',
    })
    .limit(1)
    .get()

  if (!result.data.length) {
    throw new Error('no admin permission')
  }
}

async function getDashboard() {
  const [users, families, members, medicines, illnessRecords, medicationLogs, attachments, reminders] =
    await Promise.all([
    count('users'),
    count('families'),
    count('family_members'),
    count('medicines'),
    count('illness_records'),
    count('medication_logs'),
    count('attachments'),
    count('reminders'),
  ])

  const [recentUsers, recentIllness, recentMedication, medicineSample, memberSample, attachmentSample] =
    await Promise.all([
      latest('users', 8),
      latest('illness_records', 8),
      latest('medication_logs', 8),
      sample('medicines', 100),
      sample('family_members', 100),
      sample('attachments', 100),
    ])

  const expiringMedicines = medicineSample.data
    .filter((medicine) => daysUntil(medicine.expireDate) <= 60)
    .sort((a, b) => daysUntil(a.expireDate) - daysUntil(b.expireDate))
    .slice(0, 20)
  const lowStockMedicines = medicineSample.data
    .filter((medicine) => isLowStock(medicine))
    .slice(0, 20)
  const missingProfileMembers = memberSample.data.filter(
    (member) => !member.allergyHistory && !member.medicalHistory,
  )
  const pendingOcrAttachments = attachmentSample.data.filter(
    (attachment) => !attachment.ocrText,
  )
  const trend = {
    users: await trendCount('users', 'createdAt', 7),
    illnessRecords: await trendCount('illness_records', 'createdAt', 7),
    medicationLogs: await trendCount('medication_logs', 'createdAt', 7),
    medicines: await trendCount('medicines', 'createdAt', 7),
  }

  return {
    stats: {
      users,
      families,
      members,
      medicines,
      illnessRecords,
      medicationLogs,
      attachments,
      reminders,
    },
    health: {
      averageMembersPerFamily: ratio(members, families),
      averageMedicinesPerFamily: ratio(medicines, families),
      averageIllnessPerFamily: ratio(illnessRecords, families),
      averageMedicationPerIllness: ratio(medicationLogs, illnessRecords),
      attachmentCoverageRate: ratio(attachments, illnessRecords),
    },
    risk: {
      expiringMedicines: expiringMedicines.length,
      lowStockMedicines: lowStockMedicines.length,
      missingProfileMembers: missingProfileMembers.length,
      pendingOcrAttachments: pendingOcrAttachments.length,
    },
    trend,
    recentUsers: recentUsers.data,
    recentIllness: recentIllness.data,
    recentMedication: recentMedication.data,
    expiringMedicines,
    lowStockMedicines,
    missingProfileMembers: missingProfileMembers.slice(0, 20),
    pendingOcrAttachments: pendingOcrAttachments.slice(0, 20),
    generatedAt: new Date().toISOString(),
  }
}

async function count(collection) {
  const result = await db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .count()
  return result.total
}

async function latest(collection, limit) {
  return db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
}

async function sample(collection, limit) {
  return db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
}

async function trendCount(collection, field, days) {
  const trend = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = dateOffset(-index)
    const nextDay = dateOffset(-index + 1)
    const result = await db
      .collection(collection)
      .where({
        deletedAt: _.exists(false),
        [field]: _.gte(day).and(_.lt(nextDay)),
      })
      .count()
    trend.push({
      date: day.slice(5, 10),
      count: result.total,
    })
  }
  return trend
}

async function pageList(collection, payload) {
  const limit = Math.min(Number(payload.limit || 50), 100)
  const skip = Math.max(Number(payload.skip || 0), 0)
  const result = await db
    .collection(collection)
    .where({
      deletedAt: _.exists(false),
    })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get()
  return {
    list: result.data,
    skip,
    limit,
  }
}

function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function dateOffset(offset) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

function daysUntil(dateValue) {
  if (!dateValue) {
    return Number.POSITIVE_INFINITY
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateValue)
  if (Number.isNaN(target.getTime())) {
    return Number.POSITIVE_INFINITY
  }
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function isLowStock(medicine) {
  const total = Number(medicine.totalQuantity || 0)
  const remaining = Number(medicine.remainingQuantity || 0)
  return total > 0 && remaining <= Math.max(1, total * 0.25)
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return 0
  }
  return Math.round((numerator / denominator) * 100) / 100
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
