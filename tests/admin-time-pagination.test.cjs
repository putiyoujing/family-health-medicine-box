const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

test('admin time formatter converts UTC timestamps to Asia/Shanghai', async () => {
  const utils = await import(pathToFileURL(path.join(root, 'src/admin-table-utils.ts')).href)

  assert.equal(utils.formatAdminDateTime('2026-07-24T05:15:00.000Z'), '2026-07-24 13:15')
  assert.equal(utils.formatAdminDateTime('2026-07-24'), '2026-07-24')
  assert.equal(utils.formatAdminDateTime(''), '未记录')
})

test('admin pagination helpers support 20, 50, 100 rows and bounded jump pages', async () => {
  const utils = await import(pathToFileURL(path.join(root, 'src/admin-table-utils.ts')).href)

  assert.deepEqual(utils.TABLE_PAGE_SIZE_OPTIONS, [20, 50, 100])
  assert.equal(utils.DEFAULT_TABLE_PAGE_SIZE, 20)
  assert.equal(utils.getTablePageCount(0, 20), 1)
  assert.equal(utils.getTablePageCount(101, 50), 3)
  assert.equal(utils.clampTablePage(0, 101, 50), 1)
  assert.equal(utils.clampTablePage(9, 101, 50), 3)
  assert.equal(utils.tablePageToSkip(3, 50), 100)
})

test('admin table UI sends the selected page size and exposes complete page controls', () => {
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  assert.match(source, /limit:\s*pageSize/)
  assert.match(source, /每页/)
  assert.match(source, /上一页/)
  assert.match(source, /下一页/)
  assert.match(source, /跳转/)
  assert.match(source, /TABLE_PAGE_SIZE_OPTIONS\.map/)
})

test('admin APIs cap normal list pages at 100 rows', () => {
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const localSource = fs.readFileSync(path.join(root, 'scripts/local-admin-api.ts'), 'utf8')

  assert.match(cloudSource, /normalizePageSize\(payload\.limit\)/)
  assert.match(localSource, /normalizePageSize\(payload\.limit\)/)
})
