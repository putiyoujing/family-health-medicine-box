const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = process.cwd()
const failures = []
const productionMode = process.argv.includes('--production')

const securityResult = spawnSync(process.execPath, ['scripts/check-security-readiness.cjs'], {
  cwd: root,
  encoding: 'utf8',
})
if (securityResult.status !== 0) {
  process.stdout.write(securityResult.stdout || '')
  process.stderr.write(securityResult.stderr || '')
  process.exit(securityResult.status || 1)
}

const projectConfig = readJson('project.config.json')
if (!projectConfig.appid || projectConfig.appid === 'touristappid') {
  failures.push('project.config.json appid is still touristappid or empty')
}

const appSource = fs.readFileSync(path.join(root, 'miniprogram/app.js'), 'utf8')
const envMatch = appSource.match(/const\s+ENV_ID\s*=\s*['"]([^'"]*)['"]/)
if (productionMode && (!envMatch || !envMatch[1])) {
  failures.push('miniprogram/app.js ENV_ID is empty')
}

if (/useDemoData:\s*true/.test(appSource)) {
  failures.push('miniprogram/app.js globalData.useDemoData is true')
}

if (productionMode) {
  const constantsSource = fs.readFileSync(path.join(root, 'miniprogram/utils/constants.js'), 'utf8')
  const templateMatch = constantsSource.match(/HEALTH_TODO_TEMPLATE_ID\s*=\s*['"]([^'"]*)['"]/)
  if (!templateMatch || !templateMatch[1]) {
    failures.push('miniprogram/utils/constants.js HEALTH_TODO_TEMPLATE_ID is empty')
  }

  const adminEnvId = readEnvironmentValue('VITE_CLOUDBASE_ENV_ID')
  if (!adminEnvId || /your-|example/i.test(adminEnvId)) {
    failures.push('VITE_CLOUDBASE_ENV_ID must be configured for the production admin Web app')
  } else if (envMatch && envMatch[1] && adminEnvId !== envMatch[1]) {
    failures.push('VITE_CLOUDBASE_ENV_ID must match the mini program production ENV_ID')
  }

  const adminPublishableKey = readEnvironmentValue('VITE_CLOUDBASE_PUBLISHABLE_KEY')
  if (!adminPublishableKey || /configure-|your-|example/i.test(adminPublishableKey)) {
    failures.push('VITE_CLOUDBASE_PUBLISHABLE_KEY must be configured for CloudBase Web Auth')
  }

  const releaseAttestations = {
    ADMIN_WEB_AUTH_E2E_PASSED: 'CloudBase Web Auth owner login, unauthorized rejection, and real-data Event Function access passed',
    WECHAT_CLOUD_DEPLOYED: 'all five cloud functions and required collections are deployed',
    WECHAT_DB_ADMINONLY_CONFIRMED: 'every sensitive collection is confirmed ADMINONLY in the production environment',
    WECHAT_PRIVACY_GUIDE_CONFIGURED: 'the WeChat privacy protection guide declares every used privacy API',
    WECHAT_TWO_ACCOUNT_E2E_PASSED: 'two-account family sharing and cross-family isolation E2E tests passed',
    WECHAT_REAL_DEVICE_MATRIX_PASSED: 'iOS and Android real-device regression passed',
    WECHAT_HEALTH_TODO_TEMPLATE_CONFIGURED: 'the health todo template and field mapping are configured',
    WECHAT_REMINDER_TRIGGER_DEPLOYED: 'the reminderDispatcher timer trigger is uploaded and active',
    WECHAT_REMINDER_REAL_DEVICE_PASSED: 'subscription authorization and delivery passed on a real WeChat device',
  }
  for (const [key, description] of Object.entries(releaseAttestations)) {
    if (readEnvironmentValue(key).toLowerCase() !== 'true') {
      failures.push(`${key}=true is required after ${description}`)
    }
  }
}

if (failures.length) {
  console.error('Release readiness check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

if (securityResult.stdout) {
  process.stdout.write(securityResult.stdout)
}
console.log(
  productionMode
    ? 'Production release readiness check passed'
    : 'Static release readiness check passed (use --production to validate deployment configuration)',
)

function readJson(relativeFile) {
  return JSON.parse(fs.readFileSync(path.join(root, relativeFile), 'utf8'))
}

function readEnvironmentValue(key) {
  if (process.env[key]) {
    return process.env[key].trim()
  }
  for (const relativeFile of ['.env.production.local', '.env.production', '.env.local', '.env']) {
    const file = path.join(root, relativeFile)
    if (!fs.existsSync(file)) {
      continue
    }
    const source = fs.readFileSync(file, 'utf8')
    const match = source.match(new RegExp(`^${key}=(.+)$`, 'm'))
    if (match && match[1].trim()) {
      return match[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return ''
}
