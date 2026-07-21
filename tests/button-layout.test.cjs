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

test('paired confirm actions use equal width and height', () => {
  expectStyle(
    'miniprogram/pages/family/switch.wxss',
    /\.create-actions\s*\{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\.create-actions button\s*\{[\s\S]*height:\s*82rpx/,
  )
  expectStyle(
    'miniprogram/pages/family/index.wxss',
    /\.modal-actions\s*\{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\.modal-actions button\s*\{[\s\S]*height:\s*82rpx/,
  )

  const template = read('miniprogram/pages/reminders/index.wxml')
  assert.match(template, /class="form-actions \{\{form\._id \? 'is-editing' : ''\}\}"/)
  expectStyle(
    'miniprogram/pages/reminders/index.wxss',
    /\.cancel-edit-btn\s*\{[\s\S]*height:\s*92rpx[\s\S]*\.form-actions\.is-editing\s*\{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)/,
  )
})

test('existing multi-action pages retain equal-sized action grids', () => {
  expectStyle(
    'miniprogram/pages/dashboard/index.wxss',
    /\.quick-grid \.ghost-btn\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*82rpx/,
  )
  expectStyle(
    'miniprogram/pages/illness/detail.wxss',
    /\.completion-actions\s*\{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\.completion-actions button\s*\{[\s\S]*width:\s*100%/,
  )
  expectStyle(
    'miniprogram/pages/medicines/form.wxss',
    /\.prescription-save-bar\s*\{[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\.prescription-save-bar \.save-btn\s*\{[\s\S]*height:\s*88rpx/,
  )
})
