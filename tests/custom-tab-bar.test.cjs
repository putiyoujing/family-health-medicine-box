const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('custom tab bar switches both text and icon state for all five tabs', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'miniprogram/custom-tab-bar/index.wxss'), 'utf8')
  let definition
  let switchedUrl = ''

  loadCjsModule(path.join(root, 'miniprogram/custom-tab-bar/index.js'), {
    globals: {
      Component(value) {
        definition = value
      },
      getCurrentPages: () => [{ route: 'pages/medicines/index' }],
      wx: {
        switchTab({ url }) {
          switchedUrl = url
        },
      },
    },
  })

  assert.equal(appConfig.tabBar.custom, true)
  assert.match(styles, /\.tab-bar\s*{[^}]*z-index:\s*100;/)
  assert.match(template, /class="auth-mask"[\s\S]+wx:if="{{authMaskVisible}}"/)
  assert.match(styles, /\.auth-mask\s*{[^}]*position:\s*absolute;[^}]*z-index:\s*2;[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.5\);/)
  assert.equal(definition.data.authMaskVisible, false)
  assert.equal(definition.data.list.length, 5)
  assert.match(template, /selected === index \? item\.selectedIconPath : item\.iconPath/)

  definition.data.list.forEach((item) => {
    assert.notEqual(item.iconPath, item.selectedIconPath)
    assert.equal(fs.existsSync(path.join(root, 'miniprogram', item.iconPath.replace(/^\//, ''))), true)
    assert.equal(fs.existsSync(path.join(root, 'miniprogram', item.selectedIconPath.replace(/^\//, ''))), true)
  })

  const component = {
    data: { ...definition.data },
    setData(update) {
      this.data = { ...this.data, ...update }
    },
    ...definition.methods,
  }

  component.syncSelected()
  assert.equal(component.data.selected, 2)

  component.switchTab({ currentTarget: { dataset: { index: 4, path: '/pages/profile/index' } } })
  assert.equal(component.data.selected, 2)
  assert.equal(switchedUrl, '/pages/profile/index')
})

test('each tab page confirms its own selected state when shown', () => {
  const pages = [
    ['pages/dashboard/index.js', 0],
    ['pages/illness/index.js', 1],
    ['pages/medicines/index.js', 2],
    ['pages/medication/index.js', 3],
    ['pages/profile/index.js', 4],
  ]

  pages.forEach(([relativePath, selected]) => {
    const source = fs.readFileSync(path.join(root, 'miniprogram', relativePath), 'utf8')
    assert.match(source, new RegExp(`syncTabBar\\(this,\\s*${selected}\\)`))
  })
})
