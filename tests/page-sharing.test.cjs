const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
const homePath = '/pages/dashboard/index'

test('every registered page exposes app sharing', () => {
  for (const page of appConfig.pages) {
    const source = fs.readFileSync(path.join(root, 'miniprogram', `${page}.js`), 'utf8')
    assert.match(source, /onShareAppMessage\s*\(/, `${page} is missing onShareAppMessage`)
  }
})

test('default page sharing points to the dashboard home', () => {
  const share = loadCjsModule(path.join(root, 'miniprogram/utils/share.js'))
  const config = share.getDefaultShareConfig()
  assert.equal(config.title, '家人健康记')
  assert.equal(config.path, homePath)
})

test('family invitation sharing keeps its invitation route', () => {
  const source = fs.readFileSync(path.join(root, 'miniprogram/pages/family/invite.js'), 'utf8')
  assert.match(source, /path:\s*invite\s*\?\s*invite\.path\s*:\s*'\/pages\/dashboard\/index'/)
})
