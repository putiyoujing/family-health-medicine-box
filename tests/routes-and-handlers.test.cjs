const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const miniprogramRoot = path.join(root, 'miniprogram')
const appConfig = JSON.parse(fs.readFileSync(path.join(miniprogramRoot, 'app.json'), 'utf8'))

test('every WXML event points to a function on its Page definition', () => {
  const failures = []
  let checkedHandlers = 0
  for (const pagePath of appConfig.pages) {
    const jsFile = path.join(miniprogramRoot, `${pagePath}.js`)
    const wxmlFile = path.join(miniprogramRoot, `${pagePath}.wxml`)
    let definition
    loadCjsModule(jsFile, {
      globals: {
        Page(page) {
          definition = page
        },
        getApp: () => ({ globalData: {} }),
        wx: createWxStub(),
      },
    })
    assert.ok(definition, `${pagePath}.js must register a Page`)

    const wxml = fs.readFileSync(wxmlFile, 'utf8')
    const handlers = new Set()
    const eventPattern = /\b(?:bind|catch):?[a-zA-Z][\w-]*\s*=\s*["']([A-Za-z_$][\w$]*)["']/g
    for (const match of wxml.matchAll(eventPattern)) {
      handlers.add(match[1])
    }
    for (const handler of handlers) {
      checkedHandlers += 1
      if (typeof definition[handler] !== 'function') {
        failures.push(`${pagePath}.wxml references missing handler ${handler}`)
      }
    }
  }
  assert.ok(checkedHandlers >= 50, `expected broad event coverage, only found ${checkedHandlers} handlers`)
  assert.deepEqual(failures, [])
})

test('all literal page routes exist and switchTab only targets tab pages', () => {
  const pages = new Set(appConfig.pages.map((page) => `/${page}`))
  const tabPages = new Set((appConfig.tabBar?.list || []).map((item) => `/${item.pagePath}`))
  const failures = []
  let checkedRoutes = 0

  for (const pagePath of appConfig.pages) {
    const jsFile = path.join(miniprogramRoot, `${pagePath}.js`)
    const source = fs.readFileSync(jsFile, 'utf8')
    const routePattern = /\b(navigateTo|redirectTo|reLaunch|switchTab)\s*\(\s*\{\s*url\s*:\s*([`"'])(\/pages\/[^`"']+)\2/g
    for (const match of source.matchAll(routePattern)) {
      checkedRoutes += 1
      const method = match[1]
      const route = match[3].split('?')[0]
      if (!pages.has(route)) {
        failures.push(`${pagePath}.js routes to an unregistered page: ${route}`)
      }
      if (method === 'switchTab' && !tabPages.has(route)) {
        failures.push(`${pagePath}.js switchTab target is not a tab page: ${route}`)
      }
      if (method === 'navigateTo' && tabPages.has(route)) {
        failures.push(`${pagePath}.js navigateTo cannot open tab page: ${route}`)
      }
    }
  }
  assert.ok(checkedRoutes >= 20, `expected broad route coverage, only found ${checkedRoutes} routes`)
  assert.deepEqual(failures, [])
})

function createWxStub() {
  const noop = () => {}
  return new Proxy(
    {
      cloud: {
        async callFunction() {
          return { result: { ok: true, data: {} } }
        },
      },
    },
    {
      get(target, key) {
        return key in target ? target[key] : noop
      },
    },
  )
}
