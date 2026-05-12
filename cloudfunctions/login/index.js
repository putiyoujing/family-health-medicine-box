const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = db.serverDate()
  const openid = wxContext.OPENID

  const existing = await db
    .collection('users')
    .where({
      openid,
    })
    .limit(1)
    .get()

  if (existing.data.length) {
    const user = existing.data[0]
    const currentFamilyId = await ensureCurrentFamily(openid, user)
    await db.collection('users').doc(user._id).update({
      data: {
        currentFamilyId,
        lastLoginAt: now,
      },
    })
    return {
      openid,
      user: {
        ...user,
        currentFamilyId,
      },
      currentFamilyId,
    }
  }

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

  const familyResult = await db.collection('families').add({
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

  await db.collection('family_roles').add({
    data: {
      familyId: familyResult._id,
      openid,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    },
  })

  await db.collection('users').doc(userResult._id).update({
    data: {
      currentFamilyId: familyResult._id,
      updatedAt: now,
    },
  })

  return {
    openid,
    user: {
      _id: userResult._id,
      openid,
      nickname: '',
      avatarUrl: '',
      currentFamilyId: familyResult._id,
    },
    currentFamilyId: familyResult._id,
    familyId: familyResult._id,
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
  if (activeRoles.find((role) => role.familyId === user.currentFamilyId)) {
    return user.currentFamilyId
  }
  if (activeRoles.length) {
    return activeRoles[0].familyId
  }

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

  return familyResult._id
}
