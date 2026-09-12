const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}(`)
  const next = source.indexOf('\nasync function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('new membership code generation and redemption do not touch coupons', () => {
  const adminApi = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const localAdminApi = fs.readFileSync(path.join(root, 'scripts/local-admin-api.ts'), 'utf8')
  const paymentApi = fs.readFileSync(path.join(root, 'cloudfunctions/paymentApi/index.js'), 'utf8')

  for (const source of [adminApi, localAdminApi]) {
    const batchGeneration = functionBody(source, 'batchGenerateCouponCodes')
    assert.doesNotMatch(batchGeneration, /couponId|coupons/)
  }

  const redemption = functionBody(paymentApi, 'redeemMembershipCode')
  assert.doesNotMatch(redemption, /couponId|collection\('coupons'\)/)
  assert.match(redemption, /collection\('coupon_code_batches'\)/)
})

test('disabling a coupon reads its document without an undefined helper', () => {
  const adminApi = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const disableCoupon = functionBody(adminApi, 'disableCoupon')

  assert.doesNotMatch(disableCoupon, /safeGetDoc/)
  assert.match(disableCoupon, /collection\('coupons'\)\.doc\(couponId\)\.get\(\)/)
})

test('coupon page has its own generator instead of the membership-code generator', () => {
  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  assert.match(app, /function CouponGenerator/)
  assert.match(app, /title="生成优惠券码"/)
  assert.match(app, /const showCouponGenerator = type === 'coupons'/)
  assert.match(app, /const showMembershipCodeGenerator = type === 'couponBatches' \|\| type === 'couponCodes'/)
  assert.match(app, /redeemPlanId: 'yearly_pro'/)
  assert.match(app, /value="unlimited_pro">畅享版/)
})
