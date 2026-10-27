const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('membership and coupon pages use the navigation title and keep the first screen focused on a useful action', () => {
  const membership = read('miniprogram/pages/membership/index.wxml')
  const coupons = read('miniprogram/pages/coupons/index.wxml')

  assert.doesNotMatch(membership, /会员权益|个人中心/)
  assert.match(membership, /class="family-context"[\s\S]*切换家庭/)
  assert.doesNotMatch(coupons, /券名称、金额、适用套餐和有效期均来自后台配置/)
  assert.doesNotMatch(coupons, /<view class="page-title">我的优惠券<\/view>/)
})

test('coupon tabs show only their own items and a user-facing empty state', async () => {
  let definition
  loadCjsModule(path.join(root, 'miniprogram/pages/coupons/index.js'), {
    stubs: {
      '../../services/api': { listCouponsForUser: async () => ({ coupons: [{ code: 'A', statusGroup: 'active' }, { code: 'B', statusGroup: 'used' }] }) },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: { Page(value) { definition = value }, wx: { showToast() {} } },
  })
  const page = createPageInstance(definition)
  await page.load()
  assert.deepEqual(page.data.visibleCoupons.map((coupon) => coupon.code), ['A'])
  page.switchTab({ currentTarget: { dataset: { tab: 'expired' } } })
  assert.deepEqual(page.data.visibleCoupons, [])
  assert.equal(page.data.emptyStateText, '没有已过期的优惠券')
})

test('visible product copy does not expose implementation-only status details', () => {
  const pages = fs.readdirSync(path.join(root, 'miniprogram/pages'), { recursive: true })
    .filter((file) => String(file).endsWith('.wxml'))
  const visibleCopy = pages.map((file) => fs.readFileSync(path.join(root, 'miniprogram/pages', file), 'utf8')).join('\n')

  assert.doesNotMatch(visibleCopy, /后台配置|当前环境尚未填写|当前版本未连接|后台客服|后台整理/)
})
