const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadCjsModule(entryFile, options = {}) {
  const cache = options.cache || new Map()
  const stubs = options.stubs || {}
  const globals = options.globals || {}
  const file = resolveModuleFile(entryFile)

  if (cache.has(file)) {
    return cache.get(file).exports
  }

  if (path.extname(file) === '.json') {
    const jsonModule = { exports: JSON.parse(fs.readFileSync(file, 'utf8')) }
    cache.set(file, jsonModule)
    return jsonModule.exports
  }

  const module = { exports: {} }
  cache.set(file, module)

  function localRequire(request) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return typeof stubs[request] === 'function' && stubs[request].__stubFactory
        ? stubs[request](file)
        : stubs[request]
    }
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const target = path.isAbsolute(request) ? request : path.resolve(path.dirname(file), request)
      return loadCjsModule(target, { cache, stubs, globals })
    }
    return require(request)
  }

  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    clearInterval,
    clearTimeout,
    console,
    exports: module.exports,
    global: null,
    module,
    process,
    queueMicrotask,
    require: localRequire,
    setInterval,
    setTimeout,
    __dirname: path.dirname(file),
    __filename: file,
    ...globals,
  }
  sandbox.global = sandbox

  const context = vm.createContext(sandbox)
  const source = fs.readFileSync(file, 'utf8')
  const wrapper = vm.runInContext(
    `(function (exports, require, module, __filename, __dirname) {\n${source}\n})`,
    context,
    { filename: file },
  )
  wrapper(module.exports, localRequire, module, file, path.dirname(file))
  return module.exports
}

function resolveModuleFile(input) {
  const candidates = [input, `${input}.js`, `${input}.cjs`, `${input}.json`, path.join(input, 'index.js')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.resolve(candidate)
    }
  }
  throw new Error(`Cannot resolve CommonJS module: ${input}`)
}

function createPageInstance(page, initialData = {}) {
  const instance = {
    ...page,
    data: clone({ ...(page.data || {}), ...initialData }),
    setData(patch) {
      for (const [key, value] of Object.entries(patch || {})) {
        setByPath(this.data, key, value)
      }
    },
  }
  return instance
}

function setByPath(target, key, value) {
  const parts = String(key).split('.')
  let current = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part]
  }
  current[parts[parts.length - 1]] = value
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

module.exports = {
  createPageInstance,
  loadCjsModule,
}
