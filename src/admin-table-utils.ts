export const TABLE_PAGE_SIZE_OPTIONS = [20, 50, 100] as const
export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 20

export function normalizeTablePageSize(value: unknown): TablePageSize {
  const size = Number(value)
  return TABLE_PAGE_SIZE_OPTIONS.includes(size as TablePageSize)
    ? (size as TablePageSize)
    : DEFAULT_TABLE_PAGE_SIZE
}

export function getTablePageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(total, 0) / Math.max(pageSize, 1)))
}

export function clampTablePage(page: number, total: number, pageSize: number) {
  const normalizedPage = Number.isFinite(page) ? Math.floor(page) : 1
  return Math.min(Math.max(normalizedPage, 1), getTablePageCount(total, pageSize))
}

export function tablePageToSkip(page: number, pageSize: number) {
  return (Math.max(Math.floor(page), 1) - 1) * Math.max(Math.floor(pageSize), 1)
}

export function formatAdminDateTime(value: unknown) {
  if (!value) return '未记录'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const dateValue = getDateValue(value)
  const date = dateValue === null ? null : new Date(dateValue)
  if (!date || Number.isNaN(date.getTime())) return '未记录'

  const parts = new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

function getDateValue(value: unknown): string | number | Date | null {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') return value
  if (typeof value !== 'object' || value === null || !('$date' in value)) return null
  const dateValue = value.$date
  return typeof dateValue === 'string' || typeof dateValue === 'number' ? dateValue : null
}
