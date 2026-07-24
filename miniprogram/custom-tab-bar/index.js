const TAB_ITEMS = [
  {
    pagePath: '/pages/dashboard/index',
    text: '首页',
    iconPath: '/assets/tabbar/home-default.png',
    selectedIconPath: '/assets/tabbar/home-active.png',
  },
  {
    pagePath: '/pages/illness/index',
    text: '病程',
    iconPath: '/assets/tabbar/health-default.png',
    selectedIconPath: '/assets/tabbar/health-active.png',
  },
  {
    pagePath: '/pages/medicines/index',
    text: '药箱',
    iconPath: '/assets/tabbar/box-default.png',
    selectedIconPath: '/assets/tabbar/box-active.png',
  },
  {
    pagePath: '/pages/medication/index',
    text: '用药',
    iconPath: '/assets/tabbar/medication-default.png',
    selectedIconPath: '/assets/tabbar/medication-active.png',
  },
  {
    pagePath: '/pages/profile/index',
    text: '我的',
    iconPath: '/assets/tabbar/user-default.png',
    selectedIconPath: '/assets/tabbar/user-active.png',
  },
]

Component({
  data: {
    selected: 0,
    authMaskVisible: false,
    list: TAB_ITEMS,
  },

  lifetimes: {
    attached() {
      this.syncSelected()
    },
  },

  pageLifetimes: {
    show() {
      this.syncSelected()
    },
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentPath = currentPage ? `/${currentPage.route}` : ''
      const selected = this.data.list.findIndex((item) => item.pagePath === currentPath)

      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected })
      }
    },

    switchTab(event) {
      const selected = Number(event.currentTarget.dataset.index)
      const pagePath = event.currentTarget.dataset.path
      if (!Number.isInteger(selected) || !pagePath) {
        return
      }

      wx.switchTab({
        url: pagePath,
        fail: () => this.syncSelected(),
      })
    },

    noop() {},
  },
})
