const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const { AVATAR_PRESETS, createDefaultProfile } = loadCjsModule(path.join(
  root,
  'cloudfunctions/login/default-profile.js',
))
const { AVATAR_PRESET_STYLES } = loadCjsModule(path.join(root, 'miniprogram/utils/avatar-presets.js'))

test('default profiles are stable for the same WeChat identity', () => {
  const first = createDefaultProfile('openid-user-a')
  const second = createDefaultProfile('openid-user-a')

  assert.deepEqual(second, first)
  assert.match(first.nickname, /^守护者·[A-F0-9]{6}$/)
  assert.ok(AVATAR_PRESETS.includes(first.avatarPreset))
  assert.ok(AVATAR_PRESETS.every((preset) => AVATAR_PRESET_STYLES[preset]))
})

test('different WeChat identities receive different default nicknames', () => {
  const first = createDefaultProfile('openid-user-a')
  const second = createDefaultProfile('openid-user-b')

  assert.notEqual(second.nickname, first.nickname)
})
