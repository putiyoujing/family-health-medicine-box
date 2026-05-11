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
    await db.collection('users').doc(user._id).update({
      data: {
        lastLoginAt: now,
      },
    })
    return {
      openid,
      user,
    }
  }

  const userResult = await db.collection('users').add({
    data: {
      openid,
      nickname: '',
      avatarUrl: '',
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

  return {
    openid,
    user: {
      _id: userResult._id,
      openid,
      nickname: '',
      avatarUrl: '',
    },
    familyId: familyResult._id,
  }
}
