const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const appSource = fs.readFileSync(path.join(root, 'miniprogram/app.js'), 'utf8')
const envId = appSource.match(/const\s+ENV_ID\s*=\s*['"]([^'"]+)['"]/)?.[1]
const existingEvidence = [
  'ADMIN_WEB_AUTH_E2E_PASSED', 'WECHAT_CLOUD_DEPLOYED', 'WECHAT_DB_ADMINONLY_CONFIRMED',
  'WECHAT_PRIVACY_GUIDE_CONFIGURED', 'WECHAT_TWO_ACCOUNT_E2E_PASSED',
  'WECHAT_REAL_DEVICE_MATRIX_PASSED', 'WECHAT_HEALTH_TODO_TEMPLATE_CONFIGURED',
  'WECHAT_REMINDER_TRIGGER_DEPLOYED', 'WECHAT_REMINDER_REAL_DEVICE_PASSED',
]
const paymentEvidence = [
  'WECHAT_VIRTUAL_PAYMENT_PRODUCTS_PUBLISHED', 'WECHAT_VIRTUAL_PAYMENT_CLOUD_CONFIGURED',
  'WECHAT_VIRTUAL_PAYMENT_CALLBACK_CONFIRMED', 'WECHAT_VIRTUAL_PAYMENT_RECONCILIATION_CONFIRMED',
  'WECHAT_VIRTUAL_PAYMENT_ANDROID_REAL_CHARGE_PASSED', 'WECHAT_VIRTUAL_PAYMENT_REFUND_POLICY_CONFIRMED',
  'WECHAT_VIRTUAL_PAYMENT_REFUND_E2E_PASSED',
]

function runGate(paymentValue) {
  const env = { ...process.env, VITE_CLOUDBASE_ENV_ID: envId, VITE_CLOUDBASE_PUBLISHABLE_KEY: 'test-key' }
  for (const key of existingEvidence) env[key] = 'true'
  for (const key of paymentEvidence) env[key] = paymentValue
  return spawnSync(process.execPath, ['scripts/check-release-readiness.cjs', '--production'], {
    cwd: root, env, encoding: 'utf8',
  })
}

test('production gate rejects missing payment acceptance evidence', () => {
  assert.ok(envId)
  const result = runGate('false')
  assert.notEqual(result.status, 0)
  for (const key of paymentEvidence) assert.match(result.stderr, new RegExp(`${key}=true is required`))
})

test('production gate accepts completed payment attestations', () => {
  assert.ok(envId)
  const result = runGate('true')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Production release readiness check passed/)
})
