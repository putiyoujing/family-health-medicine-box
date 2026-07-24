const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('shared page layout uses compact, consistent content gutters and vertical rhythm', () => {
  const appStyles = read('miniprogram/app.wxss')

  assert.match(appStyles, /\.page\s*{[\s\S]*padding:\s*28rpx\s+32rpx\s+132rpx/)
  assert.match(appStyles, /\.page-title\s*{[\s\S]*margin:\s*16rpx\s+0\s+24rpx/)
  assert.match(appStyles, /\.section\s*{[\s\S]*margin-bottom:\s*24rpx[\s\S]*padding:\s*28rpx/)
  assert.match(appStyles, /\.card-list\s*{[\s\S]*gap:\s*24rpx/)
})

test('full-width page modules and form action bars align to the shared gutter', () => {
  const dashboardStyles = read('miniprogram/pages/dashboard/index.wxss')

  assert.match(dashboardStyles, /\.default-home\s*{[\s\S]*padding:\s*8rpx\s+0\s+132rpx/)
  assert.match(dashboardStyles, /\.default-primary,[\s\S]*?\.default-secondary\s*{[\s\S]*width:\s*100%/)

  for (const page of ['illness/form', 'medicines/form', 'medication/form']) {
    assert.match(
      read(`miniprogram/pages/${page}.wxss`),
      /\.save-bar\s*{[\s\S]*padding:\s*22rpx\s+32rpx\s+calc\(22rpx \+ env\(safe-area-inset-bottom\)\)/,
      page,
    )
  }
})
