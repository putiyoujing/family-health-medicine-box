function getMediaSourceType(tapIndex, albumIndex) {
  return Number(tapIndex) === Number(albumIndex) ? ['album'] : ['camera']
}

function isImageSelectionCanceled(error) {
  const message = String(error && (error.errMsg || error.message) || '').toLowerCase()
  return message.includes('cancel') || message.includes('取消')
}

async function ensureImagePrivacyAuthorization(page) {
  const app = typeof getApp === 'function' ? getApp() : null
  if (!app || typeof app.requestPrivacyAuthorization !== 'function') {
    return true
  }

  let currentPage = page
  if (!currentPage && typeof getCurrentPages === 'function') {
    const pages = getCurrentPages()
    currentPage = pages[pages.length - 1]
  }
  const layer = currentPage && typeof currentPage.selectComponent === 'function'
    ? currentPage.selectComponent('#global-auth-layer')
    : null
  if (!layer || typeof layer.showPrivacyDialog !== 'function') {
    return false
  }
  return !!(await app.requestPrivacyAuthorization(layer))
}

function getImageUploadErrorMessage(error, label = '图片') {
  const rawMessage = String(error && (error.errMsg || error.message) || '').trim()
  const normalizedMessage = rawMessage.toLowerCase()
  if (normalizedMessage.includes('privacy permission is not authorized')) {
    return '请先同意隐私保护指引后再选择图片。'
  }
  if (
    Number(error && error.errno) === 112
    || normalizedMessage.includes('api scope')
    || normalizedMessage.includes('privacy agreement')
  ) {
    return '微信后台尚未声明照片或摄像头权限，请在「设置 → 服务内容声明 → 用户隐私保护指引」完成配置后重试。'
  }
  if (normalizedMessage.includes('login') || normalizedMessage.includes('openid')) {
    return '登录状态已失效，请重新登录后上传。'
  }
  if (!rawMessage) {
    return `${label}上传失败，请稍后重试。`
  }
  return `${label}上传失败：${rawMessage.slice(0, 120)}`
}

module.exports = {
  ensureImagePrivacyAuthorization,
  getImageUploadErrorMessage,
  getMediaSourceType,
  isImageSelectionCanceled,
}
