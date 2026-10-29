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

test('coupon and membership-code generators are independent and refresh restores the active page', () => {
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  assert.match(source, /function CouponGenerator/)
  assert.match(source, /生成优惠券码/)
  assert.match(source, /只写入“优惠券表”/)
  assert.match(source, /人工批量生成会员兑换码/)
  assert.match(source, /只写入“兑换码批次表”和“会员兑换码表”/)
  assert.match(source, /安心版（年度）/)
  assert.match(source, /安心版（月度）/)
  assert.match(source, /畅享版/)
  assert.match(source, /兑换套餐/)
  assert.match(source, /有效天数/)
  assert.match(source, /useState<PageId>\(getInitialActivePage\)/)
  assert.match(source, /window\.sessionStorage\.setItem\(ADMIN_ACTIVE_PAGE_STORAGE_KEY, activePage\)/)
})

test('admin APIs cap normal list pages at 100 rows', () => {
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')
  const localSource = fs.readFileSync(path.join(root, 'scripts/local-admin-api.ts'), 'utf8')

  assert.match(cloudSource, /normalizePageSize\(payload\.limit\)/)
  assert.match(localSource, /normalizePageSize\(payload\.limit\)/)
})

test('every admin data table exposes search and the cloud list applies it before pagination', () => {
  const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const api = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')

  assert.match(ui, /<ListSearchToolbar type=\{type\}/)
  assert.match(ui, /keyword: filters\.keyword\.trim\(\)/)
  assert.match(api, /if \(keyword\) \{[\s\S]*?allRows\(collection, query\)/)
  assert.match(api, /rows\.filter\(\(row\) => matchesKeyword\(row, keyword\)\)/)
  assert.match(api, /list: rows\.slice\(skip, skip \+ limit\)/)
})

test('search input changes do not let a stale dashboard refresh overwrite table results', () => {
  const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  assert.match(ui, /const refreshedPageRef = useRef<PageId \| null>\(null\)/)
  assert.match(ui, /if \(refreshedPageRef\.current === activePage\) return/)
  assert.match(ui, /refreshedPageRef\.current = activePage/)
})

test('overview stat cards open their corresponding data tables', () => {
  const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  for (const [label, page] of [
    ['用户', 'users'], ['家庭', 'families'], ['会员家庭', 'subscriptions'],
    ['交易订单', 'orders'], ['药品', 'medicines'], ['健康记录', 'illness'],
  ]) {
    assert.match(ui, new RegExp(`label="${label}"[^\\n]+onClick=\\{\\(\\) => onOpenPage\\('${page}'\\)\\}`))
  }
  assert.match(ui, /<button className="stat-card" type="button" onClick=\{onClick\}/)
})

test('order and refund tables show the payer, lifecycle, and confirmed refund balance', () => {
  const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const api = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')

  for (const field of ['payerUserId', 'payerNickname', 'createdAt', 'paidAt', 'refundRequestedAt', 'refundedAt', 'refundOrderId', 'refundReason', 'refundedBy', 'remainingAmount']) {
    assert.match(ui, new RegExp(field))
  }
  assert.match(api, /case 'listRefunds':/)
  assert.match(api, /payload\.refundOnly\) query\.refundOrderId = _\.exists\(true\)/)
  assert.match(api, /row\.refundStatus === 'refunded' \? Number\(row\.refundAmount \|\| 0\) : 0/)
  assert.match(api, /payerUserId: user\?\.publicUserId/)
})

test('admin records resolve associated users without showing raw WeChat identities', () => {
  const ui = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const api = fs.readFileSync(path.join(root, 'cloudfunctions/adminApi/index.js'), 'utf8')

  for (const collection of ['families', 'subscriptions', 'ai_usage_logs', 'medicines', 'illness_records', 'medication_logs', 'attachments', 'coupons']) {
    assert.match(api, new RegExp(`'${collection}'`))
  }
  assert.match(api, /associatedUserId: user\?\.publicUserId/)
  assert.match(api, /associatedUserNickname: user\?\.nickname/)
  assert.match(api, /delete safe\[key\]/)
  assert.match(ui, /关联用户ID/)
  assert.match(ui, /关联用户昵称/)
  assert.doesNotMatch(ui, /label: '创建者'[^\n]*ownerOpenid/)
})
