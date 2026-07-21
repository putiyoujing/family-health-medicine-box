const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const ignoredDirs = new Set(['.git', 'dist', 'node_modules'])
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name))
      }
      continue
    }

    if (entry.isFile() && /\.(?:cjs|js|mjs)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name))
    }
  }
}

walk(root)

const failures = []
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    failures.push({
      file: path.relative(root, file),
      output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    })
  }
}

if (failures.length) {
  console.error('JS syntax check failed:')
  for (const failure of failures) {
    console.error(`\n${failure.file}`)
    console.error(failure.output)
  }
  process.exit(1)
}

console.log(`JS syntax check passed for ${files.length} files`)
