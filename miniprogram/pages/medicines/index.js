const api = require('../../services/api')
const { daysUntil, memberName } = require('../../utils/format')
const { ensureLoginReady } = require('../../utils/operation-guards')
const { formatMedicineStockSummary } = require('../../utils/medicine-stock')

const DEFAULT_TAG_OPTIONS = ['儿童用药', '老人父母', '常规用药', '退烧', '感冒咳嗽', '鼻腔护理', '肠胃', '过敏', '外用', '常备', '处方药', '低库存关注']

Page({
  data: {
    loading: true,
    family: null,
    members: [],
    medicines: [],
    filteredMedicines: [],
    categoryFilters: [],
    tagFilters: [],
    memberFilters: [],
    query: '',
    showFilters: false,
    activeFilterLabel: '筛选',
    activeFilterText: '',
    selectedCategory: '',
    selectedTag: '',
    selectedMemberId: '',
  },

  onShow() {
    const app = getApp()
    const globalData = app.globalData || {}
    this.pendingAction = {
      camera: !!globalData.openMedicineCamera,
      create: !!globalData.openMedicineForm,
      focusId: globalData.focusMedicineId || '',
      focusReason: globalData.focusMedicineReason || '',
    }
    globalData.openMedicineCamera = false
    globalData.openMedicineForm = false
    globalData.focusMedicineId = ''
    globalData.focusMedicineReason = ''
    if (this.homeLoaded && api.isHomeCacheFresh()) {
      this.load({ silent: true })
      return
    }
    this.load({ silent: this.homeLoaded })
  },

  async load(options = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        this.setData({ loading: false })
        return
      }
      const home = await api.getHome()
      const members = home.members || []
      const expiryReminderDays = normalizeExpiryReminderDays(home.user && home.user.expiryReminderDays)
      const medicines = (home.medicines || []).map((item) => {
        const expireDays = daysUntil(item.expireDate)
        const expireStatus = !item.expireDate ? '' : expireDays < 0 ? 'expired' : expireDays <= expiryReminderDays ? 'expiring' : ''
        return {
        ...item,
        expireWarn: !!expireStatus,
        expireStatus,
        expireLabel: expireStatus === 'expired' ? `已过期 ${item.expireDate}` : expireStatus === 'expiring' ? `快过期 ${item.expireDate}` : item.expireDate || '未填有效期',
        tagList: normalizeTags(item.tags || item.tagsText),
        memberName: item.memberId ? memberName(members, item.memberId) : '全家通用',
        stockSummary: formatMedicineStockSummary(item),
        }
      })
      const filterState = buildFilterState(medicines, members, this.data)
      this.setData({
        loading: false,
        family: home.family,
        members,
        medicines,
        ...filterState,
        filteredMedicines: this.filterMedicines(medicines, {
          query: this.data.query,
          selectedCategory: this.data.selectedCategory,
          selectedTag: this.data.selectedTag,
          selectedMemberId: this.data.selectedMemberId,
        }),
      })
      this.homeLoaded = true
      this.openPendingAction(medicines)
    } catch (error) {
      if (options.silent) {
        console.warn('medicines refresh failed', error)
        return
      }
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  openPendingAction(medicines) {
    const action = this.pendingAction || {}
    this.pendingAction = null
    if (action.focusId) {
      if (!medicines.some((item) => item._id === action.focusId)) {
        wx.showToast({ title: '未找到这个药品', icon: 'none' })
        return
      }
      const reason = action.focusReason ? `&reason=${encodeURIComponent(action.focusReason)}` : ''
      wx.navigateTo({ url: `/pages/medicines/form?id=${action.focusId}${reason}` })
      return
    }
    if (action.camera || action.create) {
      wx.navigateTo({ url: `/pages/medicines/form${action.camera ? '?camera=1' : ''}` })
    }
  },

  filterMedicines(medicines, filters = {}) {
    const keyword = String(filters.query || '').trim().toLowerCase()
    return medicines.filter((item) => {
      const matchKeyword =
        !keyword ||
        [item.name, item.category, item.location, item.indicationsText, item.instructionText, item.note, item.memberName, ...(item.tagList || [])]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      const matchCategory = !filters.selectedCategory || item.category === filters.selectedCategory
      const matchTag = !filters.selectedTag || (item.tagList || []).includes(filters.selectedTag)
      const matchMember =
        !filters.selectedMemberId ||
        (filters.selectedMemberId === '__shared__' ? !item.memberId : item.memberId === filters.selectedMemberId)
      return matchKeyword && matchCategory && matchTag && matchMember
    })
  },

  refreshFiltered(partial = {}) {
    const next = {
      query: this.data.query,
      selectedCategory: this.data.selectedCategory,
      selectedTag: this.data.selectedTag,
      selectedMemberId: this.data.selectedMemberId,
      ...partial,
    }
    const filterState = buildFilterState(this.data.medicines, this.data.members, next)
    this.setData({
      ...next,
      ...filterState,
      filteredMedicines: this.filterMedicines(this.data.medicines, next),
    })
  },

  onSearch(event) {
    this.refreshFiltered({ query: event.detail.value })
  },

  toggleFilters() {
    this.setData({ showFilters: !this.data.showFilters })
  },

  selectCategory(event) {
    this.refreshFiltered({ selectedCategory: event.currentTarget.dataset.value || '' })
  },

  selectTag(event) {
    this.refreshFiltered({ selectedTag: event.currentTarget.dataset.value || '' })
  },

  selectMemberFilter(event) {
    this.refreshFiltered({ selectedMemberId: event.currentTarget.dataset.value || '' })
  },

  clearFilters() {
    this.refreshFiltered({
      query: '',
      selectedCategory: '',
      selectedTag: '',
      selectedMemberId: '',
      showFilters: false,
    })
  },

  createMedicine() {
    wx.navigateTo({ url: '/pages/medicines/form' })
  },

  editMedicine(event) {
    const id = event.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/medicines/form?id=${id}` })
    }
  },

  useMedicine(event) {
    const id = event.currentTarget.dataset.id
    const medicine = this.data.medicines.find((item) => item._id === id)
    if (!medicine) return
    const memberId = medicine.memberId ? `&memberId=${medicine.memberId}` : ''
    wx.navigateTo({ url: `/pages/medication/form?medicineId=${id}${memberId}` })
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirm('确认删除这个药品记录？')
    if (!confirmed) {
      return
    }
    try {
      await api.deleteMedicine(id)
      wx.showToast({ title: '已删除' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },
})

function confirm(content, title = '确认操作') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}

function normalizeTags(value) {
  const tags = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  return Array.from(new Set(tags))
}

function normalizeExpiryReminderDays(value) {
  const days = Number(value)
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 60
}

function buildFilterState(medicines, members, selected) {
  const categories = Array.from(new Set(medicines.map((item) => item.category).filter(Boolean)))
  const tags = Array.from(new Set([...DEFAULT_TAG_OPTIONS, ...medicines.flatMap((item) => item.tagList || []).filter(Boolean)]))
  const memberFilters = [
    { label: '全部成员', value: '', active: !selected.selectedMemberId },
    { label: '全家通用', value: '__shared__', active: selected.selectedMemberId === '__shared__' },
    ...members.map((item) => ({
      label: item.name,
      value: item._id,
      active: selected.selectedMemberId === item._id,
    })),
  ]
  const categoryFilters = [
    { label: '全部分类', value: '', active: !selected.selectedCategory },
    ...categories.map((item) => ({ label: item, value: item, active: selected.selectedCategory === item })),
  ]
  const tagFilters = [
    { label: '全部标签', value: '', active: !selected.selectedTag },
    ...tags.map((item) => ({ label: item, value: item, active: selected.selectedTag === item })),
  ]
  const activeParts = []
  const selectedMember = memberFilters.find((item) => item.value === selected.selectedMemberId && item.value)
  const selectedCategory = categoryFilters.find((item) => item.value === selected.selectedCategory && item.value)
  const selectedTag = tagFilters.find((item) => item.value === selected.selectedTag && item.value)
  if (selectedMember) activeParts.push(selectedMember.label)
  if (selectedCategory) activeParts.push(selectedCategory.label)
  if (selectedTag) activeParts.push(selectedTag.label)
  return {
    categoryFilters,
    tagFilters,
    memberFilters,
    activeFilterLabel: activeParts.length ? `筛选 ${activeParts.length}` : '筛选',
    activeFilterText: activeParts.length ? `已筛选：${activeParts.join(' / ')}` : '',
  }
}
