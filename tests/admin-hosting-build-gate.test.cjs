const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const gate = path.join(root, 'scripts/check-admin-hosting-build-env.cjs')

test('hosting build gate rejects missing public CloudBase configuration', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hosting-build-gate-'))
  const result = spawnSync(process.execPath, [gate], {
    cwd: temp,
    encoding: 'utf8',
    env: {},
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /VITE_CLOUDBASE_ENV_ID/)
  assert.match(result.stderr, /VITE_CLOUDBASE_PUBLISHABLE_KEY/)
})

test('hosting build gate accepts complete public CloudBase configuration', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hosting-build-gate-'))
  const result = spawnSync(process.execPath, [gate], {
    cwd: temp,
    encoding: 'utf8',
    env: {
      VITE_CLOUDBASE_ENV_ID: 'family-health-prod-d9csm29f27d75',
      VITE_CLOUDBASE_REGION: 'ap-shanghai',
      VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-key-for-test',
    },
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /Hosting build configuration verified/)
})
