const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('dashboard quick actions keep all three buttons inside the content width', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.wxss'), 'utf8')
  const quickActions = template.match(/<view class="quick-grid"[^>]*>([\s\S]*?)<\/view>/)

  assert.ok(quickActions)
  assert.equal((quickActions[1].match(/<button/g) || []).length, 3)
  assert.match(styles, /\.quick-grid\s*{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(styles, /\.quick-grid \.ghost-btn\s*{[\s\S]*min-width:\s*0/)
  assert.match(styles, /\.quick-grid \.ghost-btn\s*{[\s\S]*width:\s*100%/)
  assert.doesNotMatch(template, /ai-float|goAssistant|AI问记录/)
})

test('default dashboard starter actions have distinct icons without the redundant footnote', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/pages/dashboard/index.wxss'), 'utf8')

  assert.match(template, /class="camera-icon"/)
  assert.match(template, /class="note-icon"/)
  assert.match(template, /class="box-icon"/)
  assert.match(styles, /\.camera-icon\s*{/)
  assert.match(styles, /\.note-icon\s*{/)
  assert.match(styles, /\.box-icon\s*{/)
  assert.doesNotMatch(template, /所有记录先保存在你自己的小程序空间/)
  assert.doesNotMatch(styles, /\.default-footnote\s*{/)
})
