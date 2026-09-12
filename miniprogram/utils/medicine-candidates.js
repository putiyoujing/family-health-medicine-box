function buildMedicineCandidates(value) {
  return String(value || '')
    .split(/\n+|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text, index) => {
      const normalized = text.replace(/^\s*\d+[.、)）]\s*/, '')
      const nameMatch = normalized.match(/^([^（(\s]+)/)
      const name = nameMatch ? nameMatch[1] : normalized
      const specification = normalized.slice(name.length).replace(/^[：:，,\s]+/, '').trim()
      return {
        id: String(index),
        text: normalized,
        name,
        specification,
        action: 'pending',
        actionText: '待确认',
      }
    })
}

module.exports = {
  buildMedicineCandidates,
}
