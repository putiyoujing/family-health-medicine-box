const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('membership UI keeps redemption without plan prices or external purchase guidance', () => {
  const template = read('miniprogram/pages/membership/index.wxml')
  const script = read('miniprogram/pages/membership/index.js')
  const profile = read('miniprogram/pages/profile/index.wxml')
  const appConfig = JSON.parse(read('miniprogram/app.json'))

  assert.match(template, /兑换会员/)
  assert.match(template, /输入会员兑换码/)
  assert.doesNotMatch(template, /会员套餐|月度会员|年度会员|plan-list|plan-price|¥/)
  assert.doesNotMatch(script, /小红书|店铺|购买兑换码/)
  assert.match(script, /请输入已有会员兑换码完成权益激活/)
  assert.match(profile, /兑换会员/)
  assert.doesNotMatch(profile, /升级会员/)
  assert.equal(appConfig.pages.includes('pages/payment/checkout'), false)
  assert.equal(appConfig.pages.includes('pages/coupon/index'), false)
})

test('feedback submissions no longer collect or persist contact details', () => {
  const template = read('miniprogram/pages/feedback/index.wxml')
  const script = read('miniprogram/pages/feedback/index.js')
  const legal = read('miniprogram/pages/legal/index.wxml')
  const healthApi = read('cloudfunctions/healthApi/index.js')
  const saveFeedbackSource = healthApi.match(/async function saveFeedback[\s\S]*?\n}\n\nasync function saveMedication/)?.[0] || ''

  assert.doesNotMatch(template, /联系方式|微信号|手机号|邮箱|data-field="contact"/)
  assert.doesNotMatch(script, /\bcontact\b/)
  assert.doesNotMatch(legal, /可选联系方式/)
  assert.doesNotMatch(saveFeedbackSource, /\bcontact\b|payload\.contact/)
})

test('membership guide defaults and admin wording are channel neutral', () => {
  const sources = [
    read('cloudfunctions/adminApi/index.js'),
    read('cloudfunctions/paymentApi/index.js'),
    read('miniprogram/services/demo-data.js'),
    read('scripts/local-admin-api.ts'),
    read('src/App.tsx'),
  ]

  for (const source of sources) {
    assert.match(source, /请输入已有会员兑换码完成权益激活/)
    assert.doesNotMatch(source, /可通过小红书搜索账号|店铺购买兑换码/)
  }
})
