const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const miniprogramRoot = path.join(root, 'miniprogram')
const appConfigPath = path.join(miniprogramRoot, 'app.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const appConfig = readJson(appConfigPath)
const missing = []
const badJson = []

for (const page of appConfig.pages || []) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    const file = path.join(miniprogramRoot, `${page}.${ext}`)
    if (!fs.existsSync(file)) {
      missing.push(path.relative(root, file))
    }
  }
}

for (const item of appConfig.tabBar?.list || []) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    const value = item[key]
    const file = value ? path.join(miniprogramRoot, value) : ''
    if (!value || !fs.existsSync(file)) {
      missing.push(path.relative(root, file || path.join(miniprogramRoot, String(value || key))))
    }
  }
}

const jsonFiles = []
function walkJson(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkJson(file)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(file)
    }
  }
}

walkJson(miniprogramRoot)
for (const file of ['project.config.json', 'project.private.config.json']) {
  const fullPath = path.join(root, file)
  if (fs.existsSync(fullPath)) {
    jsonFiles.push(fullPath)
  }
}

for (const file of jsonFiles) {
  try {
    readJson(file)
  } catch (error) {
    badJson.push(`${path.relative(root, file)}: ${error.message}`)
  }
}

if (missing.length || badJson.length) {
  if (missing.length) {
    console.error('Missing miniprogram files:')
    for (const file of missing) {
      console.error(`- ${file}`)
    }
  }

  if (badJson.length) {
    console.error('Invalid miniprogram JSON:')
    for (const item of badJson) {
      console.error(`- ${item}`)
    }
  }

  process.exit(1)
}

console.log(
  `Miniprogram config check passed: ${(appConfig.pages || []).length} pages, ${
    appConfig.tabBar?.list?.length || 0
  } tabBar items, ${jsonFiles.length} JSON files`,
)
