const cloud = require('wx-server-sdk')
const crypto = require('node:crypto')
const { createDefaultProfile } = require('./default-profile')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = db.serverDate()
  const openid = wxContext.OPENID

  if (!openid) {
    throw new Error('wechat login identity is missing')
  }

  const existing = await db
    .collection('users')
    .where({
      openid,
    })
    .limit(1)
    .get()

  if (existing.data.length) {
    const user = existing.data[0]
    const defaultProfile = createDefaultProfile(openid)
    const nickname = shouldUseDefaultNickname(user.nickname) ? defaultProfile.nickname : user.nickname
    const avatarPreset = user.avatarPreset || defaultProfile.avatarPreset
    const currentFamilyId = await ensureCurrentFamily(openid, { ...user, nickname, avatarPreset })
    await db.collection('users').doc(user._id).update({
      data: {
        currentFamilyId,
        nickname,
        avatarPreset,
        lastLoginAt: now,
      },
    })
    return {
      openid,
      user: {
        ...user,
        currentFamilyId,
        nickname,
        avatarPreset,
      },
      currentFamilyId,
    }
  }

  const userId = stableId('user', openid)
  const defaultProfile = createDefaultProfile(openid)
  const currentFamilyId = await provisionDefaultFamily(openid, now, defaultProfile)

  await db.collection('users').doc(userId).set({
    data: {
      openid,
      nickname: defaultProfile.nickname,
      avatarUrl: '',
      avatarPreset: defaultProfile.avatarPreset,
      gender: '',
      birthday: '',
      currentFamilyId,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    },
  })

  return {
    openid,
    user: {
      _id: userId,
      openid,
      nickname: defaultProfile.nickname,
      avatarUrl: '',
      avatarPreset: defaultProfile.avatarPreset,
      gender: '',
      birthday: '',
      currentFamilyId,
    },
    currentFamilyId,
    familyId: currentFamilyId,
  }
}

async function ensureCurrentFamily(openid, user) {
  const roleResult = await db
    .collection('family_roles')
    .where({
      openid,
    })
    .limit(20)
    .get()

  const activeRoles = roleResult.data.filter((role) => !role.deletedAt)
  for (const role of activeRoles) {
    if (role.role === 'owner') {
      await ensureOwnerMember(openid, role, user)
    }
  }
  if (activeRoles.find((role) => role.familyId === user.currentFamilyId)) {
    return user.currentFamilyId
  }
  if (activeRoles.length) {
    return activeRoles[0].familyId
  }

  return provisionDefaultFamily(openid, db.serverDate(), createDefaultProfile(openid))
}

async function provisionDefaultFamily(openid, now, profile) {
  const familyId = stableId('family', openid)
  const roleId = stableId('owner_role', openid)
  const memberId = stableId('owner_member', `${familyId}:${openid}`)
  const familyRef = db.collection('families').doc(familyId)

  const familyResult = await familyRef.get().catch(() => ({ data: null }))
  if (!familyResult.data) {
    await familyRef.set({
      data: {
        ownerOpenid: openid,
        name: '我的家庭健康记录',
        membersOpenids: [openid],
        plan: 'free',
        proExpireAt: null,
        proSource: '',
        proUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  await db.collection('family_members').doc(memberId).set({
    data: {
      familyId,
      name: (profile && profile.nickname) || createDefaultProfile(openid).nickname,
      relation: '本人',
      gender: '',
      birthday: '',
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

  await db.collection('family_roles').doc(roleId).set({
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

  return familyId
}

async function ensureOwnerMember(openid, role, user) {
  if (role.memberId) {
    const linkedMember = await db.collection('family_members').doc(role.memberId).get().catch(() => ({ data: null }))
    if (linkedMember.data && !linkedMember.data.deletedAt && linkedMember.data.familyId === role.familyId) {
      return role.memberId
    }
  }

  const memberId = stableId('owner_member', `${role.familyId}:${openid}`)
  const memberRef = db.collection('family_members').doc(memberId)
  const memberResult = await memberRef.get().catch(() => ({ data: null }))
  const now = db.serverDate()
  if (!memberResult.data || memberResult.data.deletedAt) {
    const defaultProfile = createDefaultProfile(openid)
    await memberRef.set({
      data: {
        familyId: role.familyId,
        name: shouldUseDefaultNickname(user.nickname) ? defaultProfile.nickname : user.nickname,
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
  return memberId
}

function stableId(prefix, value) {
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)
  return `${prefix}_${digest}`
}

function shouldUseDefaultNickname(value) {
  const nickname = String(value || '').trim()
  return !nickname || nickname === '微信用户'
}
