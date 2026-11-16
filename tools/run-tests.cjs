
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory()) {
  console.error('Test directory is missing: tests/');
  process.exit(1);
}

const files = fs.readdirSync(testsDir)
  .filter(name => name.endsWith('.test.cjs'))
  .sort()
  .map(name => path.join(testsDir, name));

if (files.length === 0) {
  console.error('No test files found in tests/ (*.test.cjs). Refusing a false-green test run.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  console.error('Could not start the Node.js test runner:', result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
