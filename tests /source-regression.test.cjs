const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const native = fs.readFileSync(path.join(root, 'src/native.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('inline application JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  assert.doesNotThrow(() => new Function(scripts[1][1]));
});

test('missing primary storage enters recovery instead of creating an empty state', () => {
  assert.match(html, /if\(BOOT_RAW===null\)\{BOOT_ERROR=.*?RECOVERY=true;return\}/s);
  assert.match(html, /data-recovery="start"/);
  assert.match(html, /BOOT_READ_FAILED=true/);
  assert.match(html, /a==='start'&&BOOT_RAW===null&&!BOOT_READ_FAILED/);
});

test('legacy tasks receive arrays required by the editor', () => {
  assert.match(html, /if\(!Array\.isArray\(x\.sub\)\)x\.sub=\[\]/);
  assert.match(html, /if\(!Array\.isArray\(x\.fr\)\)x\.fr=\[\]/);
});

test('backup import requires both task and section arrays', () => {
  assert.match(html, /!AR\(o\.tasks\)\|\|!AR\(o\.groups\)/);
});

test('backup import preserves current raw data before replacement', () => {
  const backupAt = html.indexOf("const backupKey=K+'_preimport_'+Date.now()");
  const replaceAt = html.indexOf('localStorage.setItem(K,payload)', backupAt);
  assert.ok(backupAt >= 0 && replaceAt > backupAt);
  assert.match(html.slice(backupAt, replaceAt), /localStorage\.getItem\(backupKey\)!==currentRaw/);
});

test('recurring task generation is deduplicated', () => {
  assert.match(html, /!S\.tasks\.some\(a=>a\.rf===x\.id\)/);
});

test('monthly and yearly recurrence clamps to the target month end', () => {
  const start = html.indexOf('const nd=(d,r)=>');
  const end = html.indexOf('const pr=', start);
  assert.ok(start >= 0 && end > start);
  const fn = html.slice(start, end).replace(/;$/, '');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nd = vm.runInNewContext(fn + '; nd', { iso });
  assert.equal(nd('2025-01-31', 'm'), '2025-02-28');
  assert.equal(nd('2024-01-31', 'm'), '2024-02-29');
  assert.equal(nd('2024-02-29', 'y'), '2025-02-28');
  assert.equal(nd('2025-12-31', 'm'), '2026-01-31');
});

test('native notification bridge does not treat missing storage as empty tasks', () => {
  assert.match(native, /if \(raw === null\) return null/);
  assert.match(native, /Array\.isArray\(state\.tasks\).*?Array\.isArray\(state\.groups\)/s);
});

test('service worker does not use the app shell as fallback for arbitrary requests', () => {
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /manifest\.json', 'icon-192\.png', 'icon-512\.png/);
  assert.doesNotMatch(sw, /caches\.match\(e\.request\)\.then\(r=>r\|\|caches\.match\('index\.html'\)\)/);
});

test('native plugin rejects malformed sync calls instead of clearing notices', () => {
  const plugin = fs.readFileSync(path.join(root, 'native/android/PersistentTasksPlugin.java'), 'utf8');
  assert.match(plugin, /if \(notifications == null\)[\s\S]*?refusing to clear saved notices/);
  assert.match(plugin, /if \(ids == null\)[\s\S]*?Missing notification IDs/);
});
