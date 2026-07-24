const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('cross-account pages force a silent refresh when shown again', () => {
  for (const relativePath of [
    'miniprogram/pages/profile/index.js',
    'miniprogram/pages/family/index.js',
    'miniprogram/pages/illness/index.js',
    'miniprogram/pages/medicines/index.js',
  ]) {
    assert.match(read(relativePath), /getHome\(\{ force: (true|Boolean\(options\.force\)) \}\)/, relativePath)
  }
  assert.match(read('miniprogram/pages/illness/index.json'), /"enablePullDownRefresh": true/)
})

test('family member limit and account labels are explicit before submitting', () => {
  const source = read('miniprogram/pages/family/index.js')
  assert.match(source, /members\.length >= this\.data\.memberLimit/)
  assert.match(source, /兑换会员后可添加至 10 位/)
  assert.match(source, /isCurrentAccount \? '本人' : '已关联微信'/)
})

test('visit record uses date and time pickers and medication events have a clear label', () => {
  const source = read('miniprogram/pages/illness/detail.js')
  const template = read('miniprogram/pages/illness/detail.wxml')
  assert.match(source, /medication: '用药记录'/)
  assert.match(source, /onRecordedDateChange/)
  assert.match(source, /onRecordedTimeChange/)
  assert.match(template, /<picker mode="date" value="\{\{eventForm\.recordedDate\}\}"/)
  assert.match(template, /<picker mode="time" value="\{\{eventForm\.recordedTime\}\}"/)
})

test('membership guide renders immediately and record lists explain completion', () => {
  const membershipSource = read('miniprogram/pages/membership/index.js')
  assert.match(membershipSource, /membershipPurchaseGuide: DEFAULT_MEMBERSHIP_PURCHASE_GUIDE/)
  assert.doesNotMatch(membershipSource, /plans: decoratePlans\(DEFAULT_PLANS\)/)
  assert.match(membershipSource, /Promise\.allSettled/)
  for (const relativePath of [
    'miniprogram/pages/illness/index.wxml',
    'miniprogram/pages/medicines/index.wxml',
    'miniprogram/pages/medication/index.wxml',
    'miniprogram/pages/reminders/index.wxml',
  ]) {
    assert.match(read(relativePath), /到底了哦/, relativePath)
  }
  assert.match(read('miniprogram/pages/reminders/index.wxml'), /失败原因：\{\{item\.deliveryError\}\}/)
})
