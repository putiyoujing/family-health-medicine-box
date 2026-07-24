function getMediaSourceType(tapIndex, albumIndex) {
  return Number(tapIndex) === Number(albumIndex) ? ['album'] : ['camera']
}

function isImageSelectionCanceled(error) {
  const message = String(error && (error.errMsg || error.message) || '').toLowerCase()
  return message.includes('cancel') || message.includes('取消')
}

function getImageUploadErrorMessage(error, label = '图片') {
  const rawMessage = String(error && (error.errMsg || error.message) || '').trim()
  const normalizedMessage = rawMessage.toLowerCase()
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
  getImageUploadErrorMessage,
  getMediaSourceType,
  isImageSelectionCanceled,
}
