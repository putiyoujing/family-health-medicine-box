const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('family page starts with the current-family content instead of duplicating its navigation title', () => {
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/family/index.wxml'), 'utf8')

  assert.doesNotMatch(template, /<view class="page-title">/)
  assert.match(template, /^<view class="page family-page">\s*<view class="section family-summary-card"/, 'current family should be the first content block')
})
