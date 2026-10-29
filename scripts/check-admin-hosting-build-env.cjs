const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const required = [
  'VITE_CLOUDBASE_ENV_ID',
  'VITE_CLOUDBASE_REGION',
  'VITE_CLOUDBASE_PUBLISHABLE_KEY',
]
const missing = required.filter((key) => {
  const value = readEnvironmentValue(key)
  return !value || /configure-|your-|example/i.test(value)
})

if (missing.length) {
  console.error(`Hosting build configuration is incomplete: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('Hosting build configuration verified')

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
