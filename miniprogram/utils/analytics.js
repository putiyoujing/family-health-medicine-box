const EVENT_IDS = Object.freeze({
  QUICK_RECORD_START: 'quick_record_start',
  RECORD_CONTENT_ADD: 'record_content_add',
  RECORD_AI_START: 'record_ai_start',
  RECORD_AI_RESULT: 'record_ai_result',
  RECORD_RESULT_VIEW: 'record_result_view',
  RECORD_CONFIRM: 'record_confirm',
  RECORD_CREATED: 'record_created',
  RECORD_QUOTA_BLOCKED: 'record_quota_blocked',
  MEDICINE_SUGGEST_VIEW: 'medicine_suggest_view',
  MEDICINE_CONFIRM_ADD: 'medicine_confirm_add',
  MEDICINE_SKIP: 'medicine_skip',
  MEDICINE_MANUAL_ADD: 'medicine_manual_add',
  IMAGE_UPLOAD_RESULT: 'image_upload_result',
  SERVICE_ERROR: 'service_error',
  FAMILY_CREATE_RESULT: 'family_create_result',
  FAMILY_INVITE_RESULT: 'family_invite_result',
  MEMBERSHIP_REDEEM_RESULT: 'membership_redeem_result',
})

const ALLOWED_KEYS = new Set([
  'entry',
  'input_type',
  'image_type',
  'status',
  'latency_bucket',
  'count_bucket',
  'source',
  'tier',
])

function track(eventId, properties = {}) {
  if (!Object.values(EVENT_IDS).includes(eventId) || typeof wx === 'undefined' || typeof wx.reportEvent !== 'function') {
    return false
  }
  try {
    wx.reportEvent(eventId, sanitizeProperties(properties))
    return true
  } catch (error) {
    console.warn('analytics report failed', eventId, error)
    return false
  }
}

function sanitizeProperties(properties = {}) {
  return Object.entries(properties).reduce((result, [key, value]) => {
    if (!ALLOWED_KEYS.has(key)) {
      return result
    }
    if (typeof value === 'string' && value.length <= 32) {
      result[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value
    } else if (typeof value === 'boolean') {
      result[key] = value
    }
    return result
  }, {})
}

function inputType({ inputText = '', imageCount = 0 } = {}) {
  const hasText = String(inputText || '').trim().length > 0
  const hasImage = Number(imageCount) > 0
  if (hasText && hasImage) return 'mixed'
  if (hasImage) return 'image'
  if (hasText) return 'text'
  return 'none'
}

function countBucket(value) {
  const count = Number(value) || 0
  if (count <= 0) return '0'
  if (count === 1) return '1'
  if (count <= 3) return '2_3'
  if (count <= 5) return '4_5'
  return '6_plus'
}

function latencyBucket(milliseconds) {
  const duration = Number(milliseconds)
  if (!Number.isFinite(duration) || duration < 2000) return '0_2s'
  if (duration < 5000) return '2_5s'
  if (duration < 10000) return '5_10s'
  if (duration < 20000) return '10_20s'
  return '20s_plus'
}

function trackServiceError(source) {
  return track(EVENT_IDS.SERVICE_ERROR, { source: String(source || 'unknown').slice(0, 32), status: 'fail' })
}

module.exports = {
  EVENT_IDS,
  countBucket,
  inputType,
  latencyBucket,
  track,
  trackServiceError,
}
