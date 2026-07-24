const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'adminApi', 'index.js'), 'utf8')

test('admin audit records concrete targets and marks sensitive family access', () => {
  const auditSource = functionSource(source, 'async function logAdminAccess', 'function safeAuditValue')

  for (const field of ['userId', 'feedbackId', 'familyId', 'couponId', 'codeId', 'batchId', 'orderId']) {
    assert.match(auditSource, new RegExp(`payload\\.${field}`), `audit target should include ${field}`)
  }
  assert.match(auditSource, /sensitiveAccess:\s*action === 'getFamilyDetail' && Boolean\(payload\.includeSensitive\)/)
  assert.doesNotMatch(auditSource, /allergyHistory|medicalHistory|operatorNote|code\s*:/)
})

function functionSource(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `missing source block: ${startMarker}`)
  return text.slice(start, end)
}
