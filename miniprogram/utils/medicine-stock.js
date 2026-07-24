function hasPackageConversion(medicine = {}) {
  return Number(medicine.packageSize) > 0 && !!medicine.packageUnit && !!medicine.unit
}

function formatQuantity(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return String(Number(number.toFixed(6)))
}

function formatMedicineStock(medicine = {}, quantity = medicine.remainingQuantity) {
  const unit = medicine.unit || ''
  const amount = Number(quantity || 0)
  if (!hasPackageConversion(medicine) || !Number.isFinite(amount) || amount < 0) {
    return `${formatQuantity(amount)}${unit}`
  }

  const packageSize = Number(medicine.packageSize)
  const packageCount = Math.floor((amount + 0.000001) / packageSize)
  const looseQuantity = Number((amount - packageCount * packageSize).toFixed(6))
  const parts = []
  if (packageCount) parts.push(`${packageCount}${medicine.packageUnit}`)
  if (looseQuantity || !parts.length) parts.push(`${formatQuantity(looseQuantity)}${unit}`)
  return parts.join('+')
}

function formatMedicineStockSummary(medicine = {}) {
  return `剩余 ${formatMedicineStock(medicine, medicine.remainingQuantity)} / 共 ${formatMedicineStock(medicine, medicine.totalQuantity)}`
}

module.exports = { formatMedicineStock, formatMedicineStockSummary, hasPackageConversion }
