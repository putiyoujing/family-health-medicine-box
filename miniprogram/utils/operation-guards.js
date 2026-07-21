function ensureLoginReady(options = {}) {
  const app = getApp()
  if (!app || typeof app.ensureLogin !== 'function') {
    return Promise.resolve(true)
  }

  if (app.globalData && app.globalData.openid && !options.force) {
    return Promise.resolve(true)
  }

  if (options.showLoading !== false) {
    wx.showLoading({ title: '登录中' })
  }

  return app
    .ensureLogin({ force: !!options.force })
    .then(() => {
      if (options.showLoading !== false) {
        wx.hideLoading()
      }
      return true
    })
    .catch(() => {
      if (options.showLoading !== false) {
        wx.hideLoading()
      }
      wx.showModal({
        title: '需要微信登录',
        content: '请先完成微信登录，登录后才能查看和修改个人信息、家庭成员和健康记录。',
        confirmText: '重新登录',
        cancelText: '稍后',
        success: (result) => {
          if (result.confirm && app && typeof app.ensureLogin === 'function') {
            app.ensureLogin({ force: true }).catch(() => {
              wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' })
            })
          }
        },
      })
      return false
    })
}

function ensureHasFamily(home = {}) {
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
  ensureHasFamily,
  ensureHasMembers,
  ensureHasMedicines,
  ensureLoginReady,
  ensureMedicationReady,
}
