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
    // Deleting a subject also unlinks its notes without deleting them.
  assert.match(html, /S\.tasks\.forEach\(x=>\{[\s\S]*?\}\);\s*S\.notes\.forEach\(n=>\{\s*if\(n\.subjectId&&ids\.has\(n\.subjectId\)\)n\.subjectId='';\s*\}\);/);

  assert.match(html, /di:\(\)=>\{[\s\S]*?unlinkItems\(P\.g,\[item\]\);[\s\S]*?G\.it=G\.it\.filter\(a=>a\.id!==P\.i\);/);

  assert.match(html, /dg:i=>\{[\s\S]*?unlinkItems\(i,g\.it\);[\s\S]*?S\.groups=S\.groups\.filter\(a=>a\.id!==i\);/);
});

test('group rename changes only the display name and preserves its identity and contents', () => {
  assert.match(html, /eg:i=>\{[\s\S]*?const G=S\.groups\.find\(a=>a\.id===i\);[\s\S]*?G\.n=n;[\s\S]*?up\(\);[\s\S]*?\}/);

  const renameStart = html.indexOf('eg:i=>{');
  const renameEnd = html.indexOf('ai:i=>', renameStart);
  assert.ok(renameStart >= 0 && renameEnd > renameStart);

  const renameHandler = html.slice(renameStart, renameEnd);

  assert.match(renameHandler, /G\.n=n/);
  assert.doesNotMatch(renameHandler, /G\.id\s*=/);
  assert.doesNotMatch(renameHandler, /unlinkItems\s*\(/);
    assert.match(renameHandler, /if\(!n\)return/);
  assert.match(renameHandler, /if\(n===G\.n\)return/);
  assert.match(renameHandler, /if\(n\.length>300\)/);

  assert.match(html, /data-a="eg" data-i="\$\{G\.id\}"/);
});


test('subject rename changes only its display name and preserves its identity and links', () => {
  assert.match(html, /ei:i=>\{[\s\S]*?const G=S\.groups\.find\(a=>a\.id===P\.g\);[\s\S]*?const I=G&&G\.it\.find\(a=>a\.id===i\);[\s\S]*?I\.n=n;[\s\S]*?up\(\);[\s\S]*?\}/);

  const renameStart = html.indexOf('ei:i=>{');
  const renameEnd = html.indexOf('di:()=>', renameStart);
  assert.ok(renameStart >= 0 && renameEnd > renameStart);

  const renameHandler = html.slice(renameStart, renameEnd);

  assert.match(renameHandler, /I\.n=n/);
  assert.doesNotMatch(renameHandler, /I\.id\s*=/);
  assert.doesNotMatch(renameHandler, /unlinkItems\s*\(/);
  assert.match(renameHandler, /if\(!n\)return/);
  assert.match(renameHandler, /if\(n===I\.n\)return/);
  assert.match(renameHandler, /if\(n\.length>300\)/);

  assert.match(html, /data-a="ei" data-i="\$\{I\.id\}"/);
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
  assert.match(html, /if\(Object\.prototype\.hasOwnProperty\.call\(o,'notes'\)&&!AR\(o\.notes\)\)/);
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

test('notepad save calculates projected limits correctly for create and edit', () => {
  assert.match(html, /const index=S\.notes\.findIndex\(n=>n\.id===ND\.id\)/);
  assert.match(html, /const currentTotal=S\.notes\.reduce\(\(a,n\)=>a\+n\.content\.length,0\)/);
  assert.match(html, /const projectedCount=S\.notes\.length\+\(index<0\?1:0\)/);
  assert.match(html, /const projectedTotal=currentTotal-\(index<0\?0:S\.notes\[index\]\.content\.length\)\+content\.length/);
  assert.match(html, /projectedCount>50000\|\|projectedTotal>500000/);
});

test('notepad deletion requires confirmation and saves safely', () => {
  assert.match(html, /data-a="ndel"/);
  assert.match(html, /ndel:async\(\)=>/);
  assert.match(html, /if\(!confirm\(T\(/);
  assert.match(html, /S\.notes\.find\(n=>n\.id===ND\.id\)/);
  assert.match(html, /S\.notes\.findIndex\(n=>n\.id===ND\.id\)/);
  assert.match(html, /S\.notes\.splice\(index,1\)/);
  assert.match(html, /const ok=await save\(false\)/);
  assert.match(html, /if\(ok\)\{[\s\S]*ND=null;[\s\S]*render\(\)/);
});

test('notepad cards open existing notes for editing', () => {
  assert.match(html, /function editNoteSheet\(id\)/);
  assert.match(html, /const note=S\.notes\.find\(n=>n\.id===id\)/);
  assert.match(html, /ND=\{\.\.\.note\}/);
  assert.match(html, /data-a="ne" data-i="\$\{E\(n\.id\)\}"/);
  assert.match(html, /ne:i=>editNoteSheet\(i\)/);
  assert.match(html, /else S\.notes\[index\]=note/);
});
test('notepad navigation renders the notes page and escapes note titles', () => {
  const start = html.indexOf('function notesListView(){');
  const end = html.indexOf('function render()', start);

  assert.ok(start >= 0 && end > start);

  const view = html.slice(start, end);

  // The notes page reads the existing notes collection.
  assert.match(view, /const notes=S\.notes\|\|\[\]/);

  // Note titles are escaped before being rendered.
  assert.match(view, /E\(n\.title\)/);

  // The notes page has Arabic and English labels.
  assert.match(view, /T\('المفكرة','Notepad'\)/);

  // Rendering and navigation both recognize the notes page.
  assert.match(html, /v==='notes'\?notesView\(\)/);
  assert.match(html, /\['notes','📝',T\('المفكرة','Notepad'\)\]/);
  assert.match(html, /nv:i=>\{v=i;render\(\)\}/);
});

test('notepad search filters note titles and content while typing', () => {
  assert.match(html, /let noteQuery='';/);
  assert.match(html, /function notesListView\(\)/);
  assert.match(html, /noteQuery\.trim\(\)\.toLowerCase\(\)/);
  assert.match(html, /n\.title\+' '\+\(n\.content\|\|''\)/);
  assert.match(html, /\.includes\(q\)/);
  assert.match(html, /id="noteSearch"/);
  assert.match(html, /e\.target\.id==='noteSearch'[\s\S]*?noteQuery=e\.target\.value[\s\S]*?notesListView\(\)/);
});


test('notepad filters notes by selected subject', () => {
  assert.match(html, /let noteSubjectFilter='';/);
  assert.match(html, /id="noteSubjectFilter"/);
  assert.match(html, /S\.groups\.flatMap\(g=>g\.it\)/);
  assert.match(html, /const subjectNotes=noteSubjectFilter[\s\S]*?allNotes\.filter\(n=>n\.subjectId===noteSubjectFilter\)/);
  assert.match(html, /subjectNotes\.filter\(n=>\(n\.title\+' '\+\(n\.content\|\|''\)\)\.toLowerCase\(\)\.includes\(q\)\)/);
  assert.match(html, /e\.target\.id==='noteSubjectFilter'[\s\S]*?noteSubjectFilter=e\.target\.value[\s\S]*?notesListView\(\)/);
});

test('notepad create and edit forms support subject association', () => {
  const createStart = html.indexOf('function openNoteSheet(){');
  const editStart = html.indexOf('function editNoteSheet(id){');
  const listStart = html.indexOf('function notesListView(){');

  assert.ok(createStart >= 0 && editStart > createStart);
  assert.ok(listStart > editStart);

  const createForm = html.slice(createStart, editStart);
  const editForm = html.slice(editStart, listStart);

  // Create form supports optional subject selection.
  assert.match(createForm, /id="noteSubject"/);
  assert.match(createForm, /S\.groups\.flatMap\(g=>g\.it\)/);

  // Edit form restores the currently selected subject.
  assert.match(editForm, /id="noteSubject"/);
  assert.match(editForm, /ND\.subjectId===i\.id\?'selected':''/);

  // Save handler persists the selected subject ID.
  assert.match(html, /const subjectId=\$\('#noteSubject'\)\.value/);
  assert.match(html, /const note=\{\.\.\.ND,title,content,subjectId,updatedAt:Date\.now\(\)\}/);
});


test('notepad create and cancel handlers preserve safe save behavior', () => {
  // New note button opens the note form.
  assert.match(html, /nn: *\(\)=>openNoteSheet\(\)/);

  // Cancel closes the form without saving.
  assert.match(html, /nclose: *\(\)=>\{ND=null;\$\('#sh'\)\.hidden=1\}/);

  // Saving validates the title and content limits.
  assert.match(html, /if\(!title\)return toast/);
  assert.match(html, /title\.length>500\|\|content\.length>100000/);

  // Saving respects the total notes limits.
  assert.match(html, /projectedCount>50000\|\|projectedTotal>500000/);
  assert.match(html, /S\.notes\.push\(note\)/);

  // The form closes only after confirmed save success.
  assert.match(html, /const ok=await save\(\)/);
  assert.match(html, /if\(ok\)\{[\s\S]*ND=null;[\s\S]*render\(\)/);
});

test('backup import requires both task and section arrays', () => {
  assert.match(html, /!AR\(o\.tasks\)\|\|!AR\(o\.groups\)/);
});

test('backup export and import preserve notes and their subject links', () => {
  const exportStart = html.indexOf('ex:async()=>');
  const importStart = html.indexOf("$('#imp').addEventListener");
  const importEnd = html.indexOf('r.readAsText(fl);', importStart);

  assert.ok(exportStart >= 0);
  assert.ok(importStart >= 0 && importEnd > importStart);

  const exportHandler = html.slice(exportStart, importStart);
  const importHandler = html.slice(importStart, importEnd);

  // Export serializes the complete application state.
  assert.match(exportHandler, /JSON\.stringify\(S,null,2\)/);

  // Import validates the file before changing the current state.
  assert.match(importHandler, /const er=vld\(o\)/);

  // Import clones the complete imported object, including notes.
  assert.match(importHandler, /const imported=JSON\.parse\(JSON\.stringify\(o\)\)/);
  assert.match(importHandler, /Object\.assign\([\s\S]*?imported\)/);

  // Migration and validation happen before persistence.
  const migrateAt = importHandler.indexOf('mig(next)');
  const validateAt = importHandler.indexOf('const postError=vld(next)');
  const saveAt = importHandler.indexOf('const payload=JSON.stringify(next)');

  assert.ok(migrateAt >= 0);
  assert.ok(validateAt > migrateAt);
  assert.ok(saveAt > validateAt);

  // The complete imported state is saved and verified.
  assert.match(importHandler, /localStorage\.setItem\(K,payload\)/);
  assert.match(importHandler, /localStorage\.getItem\(K\)!==payload/);
});


test('backup restore validates snapshot and preserves current state before replacement', () => {
  const start = html.indexOf('async function restoreBackupRecord(record)');
  const end = html.indexOf('const enqueueSaveOperation=', start);
  assert.ok(start >= 0 && end > start);

  const restore = html.slice(start, end);

  assert.match(restore, /record\.checksum!==backupHash\(record\.raw\)/);
  assert.match(restore, /const data=JSON\.parse\(record\.raw\);\s*const invalid=vld\(data\)/);
assert.match(restore, /mig\(next\);\s*const postError=vld\(next\)/);

  const preserveAt = restore.indexOf("const rawKey=K+'_pre_restore_'+Date.now()");
  const replaceAt = restore.indexOf('localStorage.setItem(K,payload)');

  assert.ok(preserveAt >= 0 && replaceAt > preserveAt);
  assert.match(restore.slice(preserveAt, replaceAt), /localStorage\.getItem\(rawKey\)!==currentRaw/);

  const verifyAt = restore.indexOf('localStorage.getItem(K)!==payload');
  const commitAt = restore.indexOf('LAST_GOOD_RAW=payload;');
const stateCommitAt = restore.indexOf('S=next', commitAt);

assert.ok(verifyAt >= 0 && commitAt > verifyAt);
assert.ok(stateCommitAt > commitAt);
  
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


test('persistent task notifications are ongoing and low importance', () => {
  const persistent = fs.readFileSync(
    path.join(root, 'native/android/PersistentTaskNotifications.java'),
    'utf8'
  );

  assert.match(persistent, /NotificationManager\.IMPORTANCE_LOW/);
  assert.match(persistent, /\.setOngoing\(true\)/);
  assert.match(persistent, /\.setAutoCancel\(false\)/);
  assert.match(persistent, /\.setOnlyAlertOnce\(true\)/);
});

test('persistent notifications are saved before updating the notification shade', () => {
  const persistent = fs.readFileSync(
    path.join(root, 'native/android/PersistentTaskNotifications.java'),
    'utf8'
  );

  const saveAt = persistent.indexOf(
    'prefs.edit().putString(KEY, safe.toString()).commit()'
  );
  const cancelAt = persistent.indexOf('manager.cancel(oldId)');
  const showAt = persistent.indexOf('show(context, item.optInt("id")');

  assert.ok(saveAt >= 0, 'Persistent notifications must be saved');
  assert.ok(cancelAt > saveAt, 'Old notifications must be cancelled after saving');
  assert.ok(showAt > saveAt, 'New notifications must be shown after saving');
});

test('persistent task notifications are restored after reboot and app replacement', () => {
  const receiver = fs.readFileSync(
    path.join(root, 'native/android/PersistentTaskRestoreReceiver.java'),
    'utf8'
  );
  const persistent = fs.readFileSync(
    path.join(root, 'native/android/PersistentTaskNotifications.java'),
    'utf8'
  );

  assert.match(receiver, /Intent\.ACTION_BOOT_COMPLETED/);
  assert.match(receiver, /Intent\.ACTION_MY_PACKAGE_REPLACED/);
  assert.match(receiver, /PersistentTaskNotifications\.restore\(context\)/);
  assert.match(persistent, /static void restore\(Context context\)/);
});

test('native persistent notifications include only active medium and high priority tasks', () => {
  assert.match(
    native,
    /\.filter\(task => task && !task\.x && Number\(task\.p\) >= 2\)/
  );
  assert.match(native, /await PersistentTasks\.sync\(\{ notifications \}\)/);
});

test('Android scheduler does not create duplicate legacy pinned task notifications', () => {
  const start = html.indexOf('async function sched()');
  const end = html.indexOf('async function initN()', start);
  assert.ok(start >= 0 && end > start);

  const scheduler = html.slice(start, end);

  // Native PersistentTasks is the only owner of persistent Android task notices.
  assert.doesNotMatch(scheduler, /channelId:'pin'/);
  assert.doesNotMatch(scheduler, /x\.pin&&x\.p>=2/);
  assert.doesNotMatch(scheduler, /want\.add\(/);

  // Existing timed reminders and snoozed reminders must remain intact.
  assert.match(scheduler, /channelId:'rem'/);
  assert.match(scheduler, /x\.sn>now/);

  // Retire the old legacy pin ID list after collecting it for cleanup.
  assert.match(scheduler, /gone=new Set\(S\.pin\|\|\[\]\)/);
  assert.match(scheduler, /S\.pin=\[\]/);
});

test('native persistent task sync remains independent of the optional pin checkbox', () => {
  assert.match(
    native,
    /\.filter\(task => task && !task\.x && Number\(task\.p\) >= 2\)/
  );
  assert.doesNotMatch(native, /task\.pin/);
  assert.match(native, /await PersistentTasks\.sync\(\{ notifications \}\)/);
});


test('UI refresh and web reminder polling use separate timers', () => {
  const start = html.indexOf('let tickRunning=');
  const end = html.indexOf('bootReady.then(', start);

  assert.ok(start >= 0 && end > start);

  const timerCode = html.slice(start, end);
  const timers = [
    ...timerCode.matchAll(/setInterval\(\(\)=>\{([\s\S]*?)\},20000\)/g)
  ].map(match => match[1]);

  assert.equal(timers.length, 2);

  // Reminder polling must not run on Android when native notifications exist.
  assert.match(timers[0], /if\(!CAP\|\|!LN\)tick\(\)/);

  // UI refresh must remain independent from reminder polling.
  assert.doesNotMatch(timers[1], /\btick\(\)/);
  assert.match(timers[1], /clock\(\)/);
  assert.match(timers[1], /lst\(\)/);

  // Preserve the existing background UI refresh guard.
  assert.match(timers[1], /CAP&&LN&&document\.hidden/);
});

test('storage diagnostics only reads app data and backup records', () => {
  const start = html.indexOf('diag:async()=>{');
  const end = html.indexOf('persist:async()=>', start);

  assert.ok(start >= 0 && end > start);

  const diagnostics = html.slice(start, end);

  // Diagnostics must not directly modify primary app storage.
  assert.match(diagnostics, /localStorage\.getItem\(K\)/);
  assert.doesNotMatch(
    diagnostics,
    /localStorage\.(?:setItem|removeItem|clear)\s*\(/
  );

  // Diagnostics may only inspect audit and backup records.
  assert.match(diagnostics, /await auditList\(\)/);
  assert.match(diagnostics, /await backupList\(\)/);
  assert.doesNotMatch(
    diagnostics,
    /\b(?:auditRecord|auditCapture|backupStore|restoreBackupRecord)\s*\(/
  );

  // Both record-list operations must use readonly transactions.
  const auditStart = html.indexOf('async function auditList()');
  const auditEnd = html.indexOf('function auditCapture(', auditStart);
  assert.ok(auditStart >= 0 && auditEnd > auditStart);

  const auditReader = html.slice(auditStart, auditEnd);
  assert.match(auditReader, /transaction\(AUDIT_STORE,'readonly'\)/);

  const backupStart = html.indexOf('async function backupList()');
  const backupEnd = html.indexOf('async function restoreBackupRecord(', backupStart);
  assert.ok(backupStart >= 0 && backupEnd > backupStart);

  const backupReader = html.slice(backupStart, backupEnd);
  assert.match(backupReader, /transaction\(BACKUP_STORE,'readonly'\)/);
});

test('native notification installer copies and registers the priority-one receiver', () => {
  const installer = fs.readFileSync(
    path.join(root, 'tools/install_native_notifications.py'),
    'utf8'
  );

  // Copy the new receiver into the generated Android project.
  assert.match(installer, /"PriorityOneTaskReceiver\.java"/);
  assert.match(installer, /"PriorityOneTaskScheduler\.java"/);

  // Register both receivers independently.
  assert.match(installer, /if "PersistentTaskRestoreReceiver" not in xml:/);
  assert.match(installer, /if "PriorityOneTaskReceiver" not in xml:/);

  // Save the manifest outside the conditional registration blocks.
  assert.match(
    installer,
    /^manifest\.write_text\(xml, encoding="utf-8"\)$/m
  );

  // Verify both receivers after writing the manifest.
  assert.match(installer, /if "PersistentTaskRestoreReceiver" not in final_manifest:/);
  assert.match(installer, /if "PriorityOneTaskReceiver" not in final_manifest:/);
});


test('priority one tasks are filtered and synchronized separately', () => {
  assert.match(
    native,
    /Number\(task\.p\) === 1/
  );
  assert.match(native, /!task\.x/);
  assert.match(   native,   /const taskId = task\.id == null \? '' : String\(task\.id\)\.trim\(\)/ ); assert.match(native, /!taskId/);
  assert.match(native, /task\.d/);
  assert.match(native, /task\.tm \|\| '23:59'/);
  assert.match(native, /notificationId\('p1' \+ task\.id\)/);
  assert.match(native, /await PersistentTasks\.syncPriorityOne\(\{/);
  assert.match(native, /tasks: priorityOneTasks/);
});

test('priority one plugin rejects missing task arrays and delegates scheduling', () => {
  const plugin = fs.readFileSync(
    path.join(root, 'native/android/PersistentTasksPlugin.java'),
    'utf8'
  );

  assert.match(plugin, /syncPriorityOne\(PluginCall call\)/);
  assert.match(plugin, /if \(tasks == null\)/);
  assert.match(plugin, /PriorityOneTaskScheduler\.sync\(getContext\(\), tasks\)/);
});

test('priority one receiver delegates due alarms to the scheduler', () => {
  const receiver = fs.readFileSync(
    path.join(root, 'native/android/PriorityOneTaskReceiver.java'),
    'utf8'
  );

  assert.match(receiver, /ACTION_TASK_DUE/);
  assert.match(receiver, /PriorityOneTaskScheduler\.onAlarm\(context, intent\)/);
});

test('priority one schedules are restored after reboot and app replacement', () => {
  const receiver = fs.readFileSync(
    path.join(root, 'native/android/PersistentTaskRestoreReceiver.java'),
    'utf8'
  );

  assert.match(receiver, /Intent\.ACTION_BOOT_COMPLETED/);
  assert.match(receiver, /Intent\.ACTION_MY_PACKAGE_REPLACED/);
  assert.match(receiver, /PriorityOneTaskScheduler\.restore\(context\)/);
});

test('priority one scheduler ignores stale alarms and supports inexact fallback', () => {
  const scheduler = fs.readFileSync(
    path.join(root, 'native/android/PriorityOneTaskScheduler.java'),
    'utf8'
  );

  assert.match(scheduler, /current\.optLong\("dueAt", -1\) != dueAt/);
  assert.match(scheduler, /current\.optInt\("notificationId"\) != notificationId/);
  assert.match(scheduler, /manager\.setExactAndAllowWhileIdle/);
  assert.match(scheduler, /manager\.setAndAllowWhileIdle/);
  assert.match(scheduler, /PersistentTaskNotifications\.show/);
});

test('priority one scheduler identifies alarms by task and due time and preserves previous alarms during rollback', () => {
  const scheduler = fs.readFileSync(
    path.join(root, 'native/android/PriorityOneTaskScheduler.java'),
    'utf8'
  );

  assert.match(
    scheduler,
    /"enjazi:\/\/priority-one\/"\s*\+\s*Uri\.encode\(taskId\)\s*\+\s*"\/"\s*\+\s*dueAt/
  );

  assert.match(
    scheduler,
    /private static void cancelAlarm\(\s*Context context,\s*String taskId,\s*int notificationId,\s*long dueAt/
  );

  assert.match(
    scheduler,
    /alarmIntent\(\s*context,\s*taskId,\s*notificationId,\s*"",\s*"",\s*dueAt\s*\)/
  );

  assert.match(
    scheduler,
    /!existedBefore\s*&&\s*!schedule\(context,\s*item\)/
  );

  assert.equal(
    (scheduler.match(/if \(!existedBefore\)/g) || []).length,
    2
  );
});


test('priority one rescheduling cancels the old notification before showing newly due tasks', () => {
  const scheduler = fs.readFileSync(
    path.join(root, 'native/android/PriorityOneTaskScheduler.java'),
    'utf8'
  );

  const cleanupStart = scheduler.indexOf(
    '// Remove obsolete alarms and notifications after successful commit.'
  );

  const showStart = scheduler.indexOf(
    '// Show notifications for tasks that are already due.'
  );

  assert.ok(cleanupStart >= 0);
  assert.ok(showStart > cleanupStart);

  const cleanup = scheduler.slice(cleanupStart, showStart);

  // A changed due time must cancel the old visible notification.
  assert.match(
    cleanup,
    /if\s*\(removed\s*\|\|\s*dueChanged\s*\|\|\s*notificationChanged\)/
  );

  // The old alarm must be cancelled using its original due time.
  assert.match(
    cleanup,
    /cancelAlarm\(\s*context,\s*taskId,\s*old\.optInt\("notificationId",\s*-1\),\s*old\.optLong\("dueAt",\s*-1\)\s*\)/
  );

  // The notification cancellation must happen before the new due notices are shown.
  assert.match(
    cleanup,
    /NotificationManagerCompat\.from\(context\)\.cancel\(\s*old\.optInt\("notificationId",\s*-1\)\s*\)/
  );

  assert.ok(
    showStart > cleanupStart,
    'Newly due notifications must be processed after obsolete notifications are cancelled'
  );

  // Newly due tasks must still be displayed.
  assert.match(
    scheduler.slice(showStart),
    /PersistentTaskNotifications\.show/
  );
});
