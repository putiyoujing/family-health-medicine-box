const cloud = require('wx-server-sdk')
const crypto = require('node:crypto')
const { createDefaultProfile } = require('./default-profile')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const now = db.serverDate()
  const openid = wxContext.OPENID
  const authorizedProfile = normalizeAuthorizedProfile(event.profile)

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
    const publicUserId = isPublicUserId(user.publicUserId)
      ? user.publicUserId
      : await createUniquePublicUserId()
    const defaultProfile = createDefaultProfile(openid)
    const nickname = authorizedProfile.nickname || (shouldUseDefaultNickname(user.nickname) ? defaultProfile.nickname : user.nickname)
    const avatarPreset = authorizedProfile.avatarPreset || user.avatarPreset || defaultProfile.avatarPreset
    const updatedUser = {
      ...user,
      nickname,
      avatarUrl: authorizedProfile.avatarUrl || user.avatarUrl || '',
      gender: authorizedProfile.gender || user.gender || '',
      avatarPreset,
      publicUserId,
    }
    const currentFamilyId = await ensureCurrentFamily(openid, updatedUser)
    await db.collection('users').doc(user._id).update({
      data: {
        currentFamilyId,
        nickname,
        avatarUrl: updatedUser.avatarUrl,
        gender: updatedUser.gender,
        avatarPreset,
        publicUserId,
        lastLoginAt: now,
      },
    })
    return {
      openid,
      user: {
        ...updatedUser,
        currentFamilyId,
      },
      currentFamilyId,
    }
  }

  const userId = stableId('user', openid)
  if (!authorizedProfile.nickname || (!authorizedProfile.avatarUrl && !authorizedProfile.avatarPreset)) {
    throw new Error('authorized user profile is required')
  }
  const currentFamilyId = await provisionDefaultFamily(openid, now, authorizedProfile)
  const publicUserId = await createUniquePublicUserId()

  await db.collection('users').doc(userId).set({
    data: {
      openid,
      nickname: authorizedProfile.nickname,
      avatarUrl: authorizedProfile.avatarUrl,
      avatarPreset: authorizedProfile.avatarPreset,
      publicUserId,
      gender: authorizedProfile.gender,
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
      nickname: authorizedProfile.nickname,
      avatarUrl: authorizedProfile.avatarUrl,
      avatarPreset: authorizedProfile.avatarPreset,
      publicUserId,
      gender: authorizedProfile.gender,
      birthday: '',
      currentFamilyId,
    },
    currentFamilyId,
    familyId: currentFamilyId,
  }
}

function normalizeAuthorizedProfile(value) {
  const profile = value && typeof value === 'object' ? value : {}
  const nickname = String(profile.nickname || '').trim().slice(0, 80)
  const avatarUrl = String(profile.avatarUrl || '').trim().slice(0, 2048)
  const avatarPreset = ['sprout', 'sunrise', 'lake', 'berry', 'coral', 'forest'].includes(profile.avatarPreset)
    ? profile.avatarPreset
    : ''
  const gender = ['male', 'female'].includes(profile.gender) ? profile.gender : ''
  return { nickname, avatarUrl, avatarPreset, gender }
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

  return provisionDefaultFamily(openid, db.serverDate(), user)
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
      gender: profile.gender || '',
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

function shouldUseDefaultNickname(value) {
  const nickname = String(value || '').trim()
  return !nickname || nickname === '微信用户'
}
