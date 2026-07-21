const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function expectStyle(relativePath, pattern) {
  assert.match(read(relativePath), pattern, relativePath)
}

test('all responsive button groups stay inside their containers', () => {
  const appStyles = read('miniprogram/app.wxss')

  assert.doesNotMatch(appStyles, /\.page\s+\*/)
  assert.match(appStyles, /\.page view,[\s\S]*\.page picker\s*{[\s\S]*min-width:\s*0/)
  assert.match(appStyles, /\.grid-2\s*{[\s\S]*minmax\(0,\s*1fr\)/)

  expectStyle(
    'miniprogram/pages/illness/detail.wxss',
    /\.action-grid\s*{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  )
  expectStyle(
    'miniprogram/pages/illness/detail.wxss',
    /\.action-grid \.primary-btn,[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/,
  )
  expectStyle(
    'miniprogram/pages/illness/detail.wxss',
    /\.event-type-options\s*{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  )
  expectStyle(
    'miniprogram/pages/illness/form.wxss',
    /\.date-time-grid\s*{[\s\S]*minmax\(0,\s*1\.4fr\)\s+minmax\(0,\s*1fr\)/,
  )
  expectStyle(
    'miniprogram/pages/medication/form.wxss',
    /\.date-time-grid\s*{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  )
  expectStyle(
    'miniprogram/pages/reminders/index.wxss',
    /\.todo-actions\s*{[\s\S]*flex-wrap:\s*wrap/,
  )
  expectStyle(
    'miniprogram/pages/medication/index.wxss',
    /\.card-actions\s*{[\s\S]*flex-wrap:\s*wrap/,
  )
  expectStyle(
    'miniprogram/pages/illness/index.wxss',
    /\.card-actions\s*{[\s\S]*flex-wrap:\s*nowrap/,
  )
  expectStyle(
    'miniprogram/pages/illness/index.wxss',
    /\.card-actions \.append-btn,[\s\S]*?flex:\s*1\s+1\s+0[\s\S]*?font-size:\s*20rpx[\s\S]*?white-space:\s*nowrap/,
  )
  expectStyle(
    'miniprogram/pages/family/switch.wxss',
    /\.create-actions\s*{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  )
  expectStyle(
    'miniprogram/pages/dashboard/index.wxss',
    /\.starter-grid\s*{[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  )
  expectStyle(
    'miniprogram/pages/membership/index.wxss',
    /\.comparison-row\s*{[\s\S]*minmax\(0,\s*1\.12fr\)/,
  )
  expectStyle(
    'miniprogram/pages/profile/index.wxss',
    /\.benefit-strip\s*{[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  )
})
