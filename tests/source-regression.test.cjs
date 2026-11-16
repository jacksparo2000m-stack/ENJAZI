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
  assert.match(html, /if\s*\(\s*BOOT_RAW\s*===\s*null\s*\)\s*\{\s*BOOT_ERROR\s*=.*?RECOVERY\s*=\s*true\s*;\s*return\s*;?\s*\}/s);
  assert.match(html, /data-recovery="start"/);
  assert.match(html, /BOOT_READ_FAILED=true/);
  assert.match(html, /a==='start'&&BOOT_RAW===null&&!BOOT_READ_FAILED/);
});

test('legacy tasks receive arrays required by the editor', () => {
  assert.match(html, /if\(!Array\.isArray\(x\.sub\)\)x\.sub=\[\]/);
  assert.match(html, /if\(!Array\.isArray\(x\.fr\)\)x\.fr=\[\]/);
});

test('task subject association is independent from legacy lecture link', () => {
  assert.match(html, /if\(has\(x\.lk\)&&!text\(x\.lk,600\)\)/);
  assert.match(html, /if\(has\(x\.subjectId\)&&x\.subjectId!==''&&!text\(x\.subjectId,256\)\)/);
  assert.match(html, /if\(x\.subjectId&&!subjectIds\.has\(x\.subjectId\)\)/);
  assert.match(html, /if\(!x\.lk\)continue;/);
});

test('subject deletion unlinks associated tasks without deleting them', () => {
  assert.match(html, /const unlinkItems=\(groupId,items\)=>\{[\s\S]*?if\(x\.lk&&keys\.has\(x\.lk\)\)x\.lk='';[\s\S]*?if\(x\.subjectId&&ids\.has\(x\.subjectId\)\)x\.subjectId='';[\s\S]*?\};/);

  assert.match(html, /di:\(\)=>\{[\s\S]*?unlinkItems\(P\.g,\[item\]\);[\s\S]*?G\.it=G\.it\.filter\(a=>a\.id!==P\.i\);/);

  assert.match(html, /dg:i=>\{[\s\S]*?unlinkItems\(i,g\.it\);[\s\S]*?S\.groups=S\.groups\.filter\(a=>a\.id!==i\);/);
});

test('task editor and task list support subject association', () => {
  assert.match(html, /D\.subjectId=su\?su\.value:''/);
  assert.match(html, /!f\.subjectId\|\|x\.subjectId===f\.subjectId/);
  assert.match(html, /id="subjectFilter"/);
  assert.match(html, /id="fsu"/);
});



test('legacy states initialize notes without losing existing collections', () => {
  assert.match(html, /const DEFAULT_STATE=\(\)=>\(\{[^}]*notes:\[\]/);
  assert.match(html, /if\(!Object\.prototype\.hasOwnProperty\.call\(s,'notes'\)\)s\.notes=\[\]/);
});

test('migration rejects invalid notes collections instead of resetting them', () => {
  assert.match(html, /else if\(!Array\.isArray\(s\.notes\)\)throw new Error\('Invalid notes collection'\)/);
});

test('notes are validated with stable IDs and optional subject links', () => {
  assert.match(html, /if\(has\(o\.notes\)&&!AR\(o\.notes\)\)/);
  assert.match(html, /if\(\(o\.notes\|\|\[\]\)\.length>MAX_NOTES\)/);
  assert.match(html, /for\(const \[i,n\] of \(o\.notes\|\|\[\]\)\.entries\(\)/);
  assert.match(html, /!addId\(n\.id\)/);
  assert.match(html, /!text\(n\.title,500\)\|\|!n\.title\.trim\(\)/);
  assert.match(html, /MAX_NOTE_LENGTH=100000/);
  assert.match(html, /!text\(n\.content,MAX_NOTE_LENGTH\)/);
  assert.match(html, /stamp\(n\.createdAt\)/);
  assert.match(html, /stamp\(n\.updatedAt\)/);
  assert.match(html, /n\.subjectId&&!subjectIds\.has\(n\.subjectId\)/);
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

test('successful backup import exits recovery mode', () => {
  const commit = html.indexOf('S=next;LAST_GOOD_RAW=payload;BOOT_RAW=payload;BOOT_DATA=next');
  assert.ok(commit >= 0);
  const tail = html.slice(commit, commit + 240);
  assert.match(tail, /RECOVERY=false;BOOT_ERROR='';BOOT_READ_FAILED=false/);
});

test('fresh reset verifies both recovery backup and fresh state before switching', () => {
  const start = html.indexOf("if(a==='reset'&&BOOT_RAW!==null)");
  const end = html.indexOf("if(RECOVERY)return", start);
  assert.ok(start >= 0 && end > start);
  const reset = html.slice(start, end);
  assert.match(reset, /localStorage\.getItem\(backupKey\)!==BOOT_RAW/);
  assert.match(reset, /localStorage\.getItem\(K\)!==freshRaw/);
  assert.match(reset, /BOOT_DATA=fresh/);
});

test('data migration verifies the persisted value before accepting it', () => {
  assert.match(html, /localStorage\.setItem\(K,migrated\)\s*;\s*if\s*\(\s*localStorage\.getItem\(K\)\s*!==\s*migrated\s*\)\s*throw\s+new Error\('Migration storage verification failed'\)\s*;?/);
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
