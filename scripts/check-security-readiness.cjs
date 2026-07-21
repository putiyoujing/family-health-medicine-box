const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const failures = []
let checks = 0

checkProjectIdentity()
checkProductionDefaults()
checkClientMockPaymentSurface()
checkCloudMockPaymentGuard()
checkAttachmentOwnershipGuard()
checkAdminCredentialExposure()
checkTrackedEnvironmentFiles()
checkPrivacySurface()

if (failures.length) {
  console.error('Security/readiness check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Security/readiness check passed (${checks} safeguards)`)

function checkProjectIdentity() {
  const project = readJson('project.config.json')
  assert(
    Boolean(project.appid && project.appid !== 'touristappid'),
    'project.config.json must use a non-tourist appid',
  )
}

function checkProductionDefaults() {
  const source = read('miniprogram/app.js')
  assert(/\buseDemoData\s*:\s*false\b/.test(source), 'miniprogram/app.js must default useDemoData to false')
  assert(!/\buseDemoData\s*:\s*true\b/.test(source), 'miniprogram/app.js must not enable demo data by default')
}

function checkClientMockPaymentSurface() {
  const files = walk(path.join(root, 'miniprogram')).filter(
    (file) => /\.js$/.test(file) && normalize(file) !== 'miniprogram/services/demo-data.js',
  )
  const exposed = files
    .filter((file) => /\bmockPaymentSuccess\b/.test(fs.readFileSync(file, 'utf8')))
    .map(normalize)
  assert(
    exposed.length === 0,
    `production miniprogram code must not expose mockPaymentSuccess${exposed.length ? ` (${exposed.join(', ')})` : ''}`,
  )
}

function checkCloudMockPaymentGuard() {
  const source = read('cloudfunctions/paymentApi/index.js')
  if (!/\bmockPaymentSuccess\b/.test(source)) {
    checks += 1
    return
  }

  const mockBody = extractFunctionBody(source, 'mockPaymentSuccess')
  const guardBody = extractFunctionBody(source, 'assertMockPaymentEnabled')
  const guardCall = mockBody.indexOf('assertMockPaymentEnabled(')
  const firstDatabaseUse = mockBody.search(/\bdb\s*\.\s*collection\s*\(/)
  assert(guardCall >= 0, 'mockPaymentSuccess must call assertMockPaymentEnabled')
  assert(
    firstDatabaseUse < 0 || guardCall < firstDatabaseUse,
    'mockPaymentSuccess must check its environment guard before any database access',
  )
  assert(/ALLOW_MOCK_PAYMENT/.test(guardBody), 'mock payment guard must require ALLOW_MOCK_PAYMENT opt-in')
  assert(/NODE_ENV/.test(guardBody), 'mock payment guard must restrict NODE_ENV')
  const allowList = guardBody.match(/allowedEnvironments\s*=\s*\[([^\]]*)\]/)
  assert(Boolean(allowList), 'mock payment guard must use an explicit environment allow-list')
  assert(!/production/i.test((allowList && allowList[1]) || ''), 'mock payment environment allow-list must exclude production')
}

function checkAttachmentOwnershipGuard() {
  const source = read('cloudfunctions/healthApi/index.js')
  const body = extractFunctionBody(source, 'confirmAiParseResult')
  const ownershipCheck = body.search(/assertFamilyRecords?\s*\(\s*['"]attachments['"]/)
  const attachmentWrite = body.search(/collection\s*\(\s*['"]attachments['"]\s*\)/)
  assert(ownershipCheck >= 0, 'confirmAiParseResult must validate attachment records against the current family')
  assert(
    attachmentWrite < 0 || ownershipCheck < attachmentWrite,
    'confirmAiParseResult must validate attachment ownership before updating attachments',
  )
}

function checkAdminCredentialExposure() {
  const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.[cm]?[jt]sx?$/.test(file))
  const viteSecretReferences = []
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8')
    if (/\bVITE_[A-Z0-9_]*(?:TOKEN|SECRET)\b/.test(source)) {
      viteSecretReferences.push(normalize(file))
    }
  }
  assert(
    viteSecretReferences.length === 0,
    `client source must not reference VITE_*TOKEN or VITE_*SECRET${
      viteSecretReferences.length ? ` (${viteSecretReferences.join(', ')})` : ''
    }`,
  )

  const adminApiSource = read('cloudfunctions/adminApi/index.js')
  assert(
    !/\b(?:ADMIN_WEB_TOKEN|VITE_ADMIN_API_TOKEN|adminToken)\b/.test(adminApiSource),
    'adminApi must not accept a shared admin token as an authentication bypass',
  )

  const distRoot = path.join(root, 'dist')
  if (fs.existsSync(distRoot)) {
    const bundleLeaks = walk(distRoot)
      .filter((file) => /\.js$/.test(file))
      .filter((file) => /VITE_ADMIN_API_TOKEN|adminToken|local-dev-token/.test(fs.readFileSync(file, 'utf8')))
      .map(normalize)
    assert(
      bundleLeaks.length === 0,
      `production bundle contains a development/shared admin credential path${
        bundleLeaks.length ? ` (${bundleLeaks.join(', ')})` : ''
      }`,
    )
  } else {
    checks += 1
  }
}

function checkTrackedEnvironmentFiles() {
  const gitDir = path.join(root, '.git')
  if (!fs.existsSync(gitDir)) {
    checks += 1
    return
  }
  const { execFileSync } = require('node:child_process')
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  const sensitiveEnvFiles = tracked.filter((file) => {
    const name = path.basename(file)
    return name === '.env' || (name.startsWith('.env.') && name !== '.env.example')
  })
  assert(
    sensitiveEnvFiles.length === 0,
    `local environment files must not be tracked${sensitiveEnvFiles.length ? ` (${sensitiveEnvFiles.join(', ')})` : ''}`,
  )
}

function checkPrivacySurface() {
  const app = readJson('miniprogram/app.json')
  assert(app.__usePrivacyCheck__ === true, 'miniprogram must enable privacy authorization checks')
  assert(
    (app.pages || []).includes('pages/legal/index'),
    'miniprogram must register its privacy, terms, and medical safety page',
  )
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert(
      fs.existsSync(path.join(root, `miniprogram/pages/legal/index.${extension}`)),
      `missing legal page file index.${extension}`,
    )
  }
}

function assert(condition, message) {
  checks += 1
  if (!condition) {
    failures.push(message)
  }
}

function read(relativeFile) {
  return fs.readFileSync(path.join(root, relativeFile), 'utf8')
}

function readJson(relativeFile) {
  return JSON.parse(read(relativeFile))
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(file))
    } else if (entry.isFile()) {
      files.push(file)
    }
  }
  return files
}

function normalize(file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function extractFunctionBody(source, functionName) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\([^)]*\\)\\s*\\{`)
  const match = pattern.exec(source)
  if (!match) {
    failures.push(`missing function ${functionName}`)
    return ''
  }
  const openingBrace = source.indexOf('{', match.index)
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(openingBrace + 1, index)
      }
    }
  }
  failures.push(`could not parse function ${functionName}`)
  return ''
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
