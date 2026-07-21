const api = require('../../services/api')
const { formatDateTime, memberName, medicineName } = require('../../utils/format')
const { ensureLoginReady, ensureMedicationReady } = require('../../utils/operation-guards')

Page({
  data: {
    loading: true,
    family: null,
    members: [],
    medicines: [],
    illnessRecords: [],
    logs: [],
    filteredLogs: [],
    query: '',
    memberFilterOptions: [{ _id: '', name: '全部成员' }],
    memberFilterIndex: 0,
    selectedMemberFilterName: '全部成员',
    canEdit: false,
  },

  onShow() {
    const app = typeof getApp === 'function' ? getApp() : null
    const globalData = app && app.globalData ? app.globalData : {}
    const forceRefresh = !!globalData.medicationListNeedsRefresh
    globalData.medicationListNeedsRefresh = false
    if (this.homeLoaded && api.isHomeCacheFresh() && !forceRefresh) {
      return
    }
    this.load({ silent: this.homeLoaded, force: forceRefresh })
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
      const [home, history] = await Promise.all([api.getHome({ force: !!options.force }), api.listMedicationHistory()])
      const members = home.members || []
      const medicines = home.medicines || []
      const illnessRecords = home.illnessRecords || []
      const logs = (history.logs || [])
        .map((item) => ({
          ...item,
          isVoided: !!item.deletedAt,
          statusText: item.deletedAt ? '已作废 · 已恢复库存' : '',
          stockText: item.deletedAt ? '已作废' : `库存 -${item.doseQuantity}${item.doseUnit || ''}`,
          memberName: item.memberNameSnapshot || memberName(members, item.memberId),
          medicineName: item.medicineNameSnapshot || medicineName(medicines, item.medicineId),
          illnessName: buildLogIllnessName(illnessRecords, members, item.illnessRecordId),
          timeText: formatDateTime(item.takenAt),
        }))
        .sort((left, right) => Number(left.isVoided) - Number(right.isVoided) || toTime(right.takenAt) - toTime(left.takenAt))
      const memberFilterOptions = [{ _id: '', name: '全部成员' }, ...members]
      const memberFilterIndex = Math.min(this.data.memberFilterIndex, memberFilterOptions.length - 1)
      this.setData({
        loading: false,
        family: home.family,
        members,
        medicines,
        illnessRecords,
        logs,
        memberFilterOptions,
        memberFilterIndex,
        selectedMemberFilterName: memberFilterOptions[memberFilterIndex].name,
        canEdit: !home.family || ['owner', 'admin', 'member'].includes(home.family.role),
      })
      this.homeLoaded = true
      this.applyFilters()
    } catch (error) {
      if (options.silent) {
        console.warn('medication refresh failed', error)
        return
      }
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  createMedication() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '当前为只读权限', icon: 'none' })
      return
    }
    if (!ensureMedicationReady(getHomeSnapshot(this.data))) {
      return
    }
    wx.navigateTo({ url: '/pages/medication/form' })
  },

  editMedication(event) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '当前为只读权限', icon: 'none' })
      return
    }
    const id = event.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/medication/form?id=${id}` })
    }
  },

  async voidMedication(event) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '当前为只读权限', icon: 'none' })
      return
    }
    const id = event.currentTarget.dataset.id
    const record = this.data.logs.find((item) => item._id === id)
    if (!record) {
      return
    }
    const confirmed = await confirm(
      `作废后将恢复 ${record.doseQuantity}${record.doseUnit || ''} 库存；记录会保留在历史中并标注为已作废。确认继续？`,
      '作废这条用药记录？',
    )
    if (!confirmed) {
      return
    }
    try {
      await api.deleteMedication(id)
      wx.showToast({ title: '已作废并恢复库存' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '作废失败', icon: 'none' })
    }
  },

  onSearch(event) {
    this.setData({ query: event.detail.value })
    this.applyFilters()
  },

  onMemberFilterChange(event) {
    const memberFilterIndex = Number(event.detail.value)
    const selected = this.data.memberFilterOptions[memberFilterIndex]
    this.setData({
      memberFilterIndex,
      selectedMemberFilterName: selected ? selected.name : '全部成员',
    })
    this.applyFilters()
  },

  clearFilters() {
    this.setData({ query: '', memberFilterIndex: 0, selectedMemberFilterName: '全部成员' })
    this.applyFilters()
  },

  applyFilters() {
    const keyword = String(this.data.query || '').trim().toLowerCase()
    const selectedMember = this.data.memberFilterOptions[this.data.memberFilterIndex]
    const memberId = selectedMember ? selectedMember._id : ''
    const filteredLogs = this.data.logs.filter((item) => {
      if (memberId && item.memberId !== memberId) {
        return false
      }
      if (!keyword) {
        return true
      }
      return [item.medicineName, item.memberName, item.illnessName, item.reaction, item.note]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
    })
    this.setData({ filteredLogs })
  },
})

function buildLogIllnessName(illnessRecords, members, illnessRecordId) {
  if (!illnessRecordId) {
    return '未关联病程'
  }
  const illness = illnessRecords.find((item) => item._id === illnessRecordId)
  if (!illness) {
    return '关联病程已归档或删除'
  }
  const content = illness.summary
    || (illness.symptoms || []).join('、')
    || illness.symptomDescription
    || '未命名病程'
  return `${memberName(members, illness.memberId)} · ${content}`
}

function getHomeSnapshot(data) {
  return {
    currentFamilyId: data.family && data.family._id,
    family: data.family,
    members: data.members || [],
    medicines: data.medicines || [],
  }
}

function toTime(value) {
  const time = new Date(value || '').getTime()
  return Number.isNaN(time) ? 0 : time
}

function confirm(content, title) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: '确认作废',
      confirmColor: '#b23434',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}
