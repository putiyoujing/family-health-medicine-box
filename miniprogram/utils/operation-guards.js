async function ensureLoginReady(options = {}) {
  if (isLoggedIn()) {
    return true
  }
  const app = getApp()
  if (app && app.restoreLoginPromise) {
    try {
      await app.restoreLoginPromise
    } catch (error) {
      console.warn('silent login restore failed', error)
    }
    if (isLoggedIn()) {
      return true
    }
  }
  if (!options.silent) {
    return openGlobalAuthLayer()
  }
  return false
}

function isLoggedIn() {
  const app = getApp()
  return !!(app && app.globalData && app.globalData.openid)
}

function canEditFamilyRecords(family = {}) {
  return ['owner', 'admin', 'member'].includes(family.role)
}

async function ensureFamilyWriteAccess(canEditRecords) {
  if (canEditRecords) {
    return true
  }
  await ensureLoginReady()
  return false
}

function openGlobalAuthLayer() {
  if (typeof getCurrentPages !== 'function') {
    wx.showToast({ title: '登录服务暂不可用', icon: 'none' })
    return Promise.resolve(false)
  }
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  const layer = page && typeof page.selectComponent === 'function'
    ? page.selectComponent('#global-auth-layer')
    : null
  if (!layer || typeof layer.open !== 'function') {
    wx.showToast({ title: '当前页面暂不支持登录，请重新进入', icon: 'none' })
    return Promise.resolve(false)
  }
  return layer.open()
}

async function requestWechatLogin(profile) {
  const app = getApp()
  if (!app || typeof app.requestLogin !== 'function') {
    wx.showToast({ title: '登录服务暂不可用', icon: 'none' })
    return false
  }
  const hasAvatar = profile && (
    String(profile.avatarUrl || '').trim()
    || String(profile.avatarPreset || '').trim()
  )
  if (!profile || !String(profile.nickname || '').trim() || !hasAvatar) {
    wx.showToast({ title: '请先填写昵称', icon: 'none' })
    return false
  }

  let loadingShown = false
  try {
    wx.showLoading({ title: '登录中' })
    loadingShown = true
    await app.requestLogin(profile)
    return true
  } catch (error) {
    console.error('wechat login failed', error)
    wx.showToast({ title: getWechatLoginErrorMessage(error), icon: 'none' })
    return false
  } finally {
    if (loadingShown) {
      wx.hideLoading()
    }
  }
}

function getWechatLoginErrorMessage(error) {
  const message = String(error && (error.errMsg || error.message) || '').toLowerCase()
  if (Number(error && error.errno) === 112 || message.includes('privacy agreement')) {
    return '微信登录授权尚未配置'
  }
  if (message.includes('deny') || message.includes('cancel') || message.includes('拒绝') || message.includes('取消')) {
    return '已取消微信授权'
  }
  return '微信登录失败，请稍后重试'
}

function ensureHasFamily(home = {}) {
  if (!isLoggedIn()) {
    openGlobalAuthLayer()
    return false
  }
  if (home.currentFamilyId || (home.family && home.family._id)) {
    return true
  }

  wx.showModal({
    title: '先创建家庭空间',
    content: '健康记录、药箱和用药都需要归属到一个家庭空间。请先创建或加入家庭。',
    confirmText: '去个人中心',
    cancelText: '稍后',
    success: (result) => {
      if (result.confirm) {
        wx.switchTab({ url: '/pages/profile/index' })
      }
    },
  })
  return false
}

function ensureHasMembers(home = {}, options = {}) {
  if (!ensureHasFamily(home)) {
    return false
  }

  const members = home.members || []
  if (members.length) {
    return true
  }

  const app = getApp()
  wx.showModal({
    title: '先添加家庭成员',
    content: options.content || '记录生病和用药前，需要先知道是哪位家人。请先添加一位家庭成员。',
    confirmText: '添加成员',
    cancelText: '稍后',
    success: (result) => {
      if (result.confirm) {
        if (app.globalData) {
          app.globalData.openMemberModal = true
        }
        wx.switchTab({ url: '/pages/profile/index' })
      }
    },
  })
  return false
}

function ensureHasMedicines(home = {}, options = {}) {
  if (!ensureHasFamily(home)) {
    return false
  }

  const medicines = home.medicines || []
  if (medicines.length) {
    return true
  }

  const app = getApp()
  wx.showModal({
    title: '先添加药品',
    content: options.content || '记录用药需要选择药品并扣减库存。请先把药品加入家庭药箱。',
    confirmText: '添加药品',
    cancelText: '稍后',
    success: (result) => {
      if (result.confirm) {
        if (app.globalData) {
          app.globalData.openMedicineForm = true
        }
        wx.switchTab({ url: '/pages/medicines/index' })
      }
    },
  })
  return false
}

function ensureMedicationReady(home = {}) {
  if (!ensureHasFamily(home)) {
    return false
  }

  const hasMembers = (home.members || []).length > 0
  const hasMedicines = (home.medicines || []).length > 0

  if (hasMembers && hasMedicines) {
    return true
  }

  if (!hasMembers) {
    return ensureHasMembers(home, {
      content: !hasMedicines
        ? '记录用药前，需要先添加家庭成员，再把药品加入药箱。请先添加一位家庭成员。'
        : '记录用药前，需要先知道是哪位家人用药。请先添加一位家庭成员。',
    })
  }

  return ensureHasMedicines(home)
}

module.exports = {
  canEditFamilyRecords,
  ensureFamilyWriteAccess,
  ensureHasFamily,
  ensureHasMembers,
  ensureHasMedicines,
  ensureLoginReady,
  ensureMedicationReady,
  requestWechatLogin,
}
