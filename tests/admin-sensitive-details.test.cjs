const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('admin family details hide internal identifiers and reveal health fields only after confirmation', () => {
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const localSource = fs.readFileSync(path.join(root, 'scripts/local-admin-api.ts'), 'utf8')
  const cloudFamilyDetail = functionSource(cloudSource, 'async function getFamilyDetail', 'async function updateFeedback')
  const localFamilyDetail = functionSource(localSource, 'function getFamilyDetail', 'async function updateFeedback')

  assert.doesNotMatch(cloudFamilyDetail, /\bopenid\s*:\s*(?:user|role)/i)
  assert.doesNotMatch(localFamilyDetail, /\bopenid\s*:\s*(?:user|role)/i)
  assert.match(cloudFamilyDetail, /canRevealSensitive:\s*admin\.role === 'owner'/)
  assert.match(localFamilyDetail, /canRevealSensitive:\s*true/)
  assert.doesNotMatch(appSource, /key:\s*'openid'/i)
  assert.match(appSource, /window\.confirm\([^)]*敏感健康字段/)
  assert.match(appSource, /includeSensitive:\s*true/)
  assert.match(appSource, /allergyHistory/)
  assert.match(appSource, /medicalHistory/)
})

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing ${startMarker}`)
  assert.notEqual(end, -1, `missing ${endMarker}`)
  return source.slice(start, end)
}
