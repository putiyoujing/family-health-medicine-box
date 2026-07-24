const crypto = require('node:crypto')

const AVATAR_PRESETS = ['sprout', 'sunrise', 'lake', 'berry', 'coral', 'forest']

function createDefaultProfile(openid) {
  const identity = String(openid || '').trim()
  if (!identity) {
    throw new Error('openid is required for default profile')
  }
  const digest = crypto.createHash('sha256').update(`profile:${identity}`).digest('hex')
  const presetIndex = Number.parseInt(digest.slice(8, 10), 16) % AVATAR_PRESETS.length
  return {
    nickname: `守护者·${digest.slice(0, 6).toUpperCase()}`,
    avatarPreset: AVATAR_PRESETS[presetIndex],
  }
}

module.exports = {
  AVATAR_PRESETS,
  createDefaultProfile,
}
