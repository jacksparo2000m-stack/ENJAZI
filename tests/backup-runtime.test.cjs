'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function fakeIndexedDB() {
  const records = new Map();
  const db = {
    stores: new Map(),
    objectStoreNames: { contains: name => db.stores.has(name) },
    createObjectStore(name) { db.stores.set(name, records); return {}; },
    transaction(name) {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      const data = db.stores.get(name);
      if (!data) throw new Error('Missing object store: ' + name);
      tx.objectStore = () => ({
        getAll() {
          const request = {};
          queueMicrotask(() => {
            request.result = [...data.values()].map(value => ({ ...value }));
            request.onsuccess?.();
            queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
        put(value) { data.set(value.id, { ...value }); },
        delete(id) { data.delete(id); }
      });
      return tx;
    }
  };
  const api = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  return { api, records };
}

test('IndexedDB snapshot store retains the newest ten distinct valid versions', async () => {
  const start = html.indexOf("const BACKUP_DB='enjazi-data-protection'");
  const end = html.indexOf('async function restoreBackupRecord', start);
  assert.ok(start >= 0 && end > start, 'backup helper source should be present');
  const source = html.slice(start, end) + '\n;({ backupStore, backupList, backupHash })';
  const fake = fakeIndexedDB();
  const context = {
    window: { indexedDB: fake.api },
    indexedDB: fake.api,
    vld: () => '',
    console,
    Date,
    Math,
    Promise,
    JSON,
    String,
    Number,
    Object,
    Array,
    Error,
    setTimeout,
    clearTimeout
  };
  const helpers = vm.runInNewContext(source, context);

  for (let version = 0; version < 12; version++) {
    await helpers.backupStore(JSON.stringify({ version }));
  }

  const rows = await helpers.backupList();
  assert.equal(rows.length, 10);
  assert.equal(JSON.parse(rows[0].raw).version, 11);
  assert.equal(JSON.parse(rows[9].raw).version, 2);

  await helpers.backupStore(JSON.stringify({ version: 11 }));
  const afterDuplicate = await helpers.backupList();
  assert.equal(afterDuplicate.length, 10, 'duplicate snapshots should not consume a slot');
  assert.equal(JSON.parse(afterDuplicate[9].raw).version, 2, 'a duplicate must not prune the oldest distinct snapshot');
  assert.equal(helpers.backupHash('abc'), helpers.backupHash('abc'));
  assert.notEqual(helpers.backupHash('abc'), helpers.backupHash('abd'));
});

test('save-operation queue executes mutations, imports, and restores in strict order', async () => {
  const source = `let saveQueue=Promise.resolve();const enqueueSaveOperation=work=>{const result=saveQueue.then(work,work);saveQueue=result.then(()=>{},()=>{});return result};({enqueueSaveOperation})`;
  const { enqueueSaveOperation } = vm.runInNewContext(source, { Promise });
  const order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = enqueueSaveOperation(async () => { order.push('save-start'); await gate; order.push('save-end'); });
  const second = enqueueSaveOperation(async () => { order.push('import'); });
  const third = enqueueSaveOperation(async () => { order.push('restore'); });
  await Promise.resolve();
  assert.deepEqual(order, ['save-start']);
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(order, ['save-start', 'save-end', 'import', 'restore']);
});

function createSaveHarness(backupStore) {
  const oldRaw = JSON.stringify({
    lang: 'ar',
    tasks: [{ id: 'old' }],
    groups: []
  });

  const values = new Map([['pt2', oldRaw]]);
  const localStorage = {
    setItem(key, value) {
      values.set(key, String(value));
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    }
  };

  const context = {
    S: {
      lang: 'ar',
      tasks: [{ id: 'new' }],
      groups: []
    },
    LAST_GOOD_RAW: oldRaw,
    RECOVERY: false,
    SAVE_FAILED: false,
    localStorage,
    backupStore,
    enqueueSaveOperation: work => Promise.resolve().then(work),
    toast() {},
    T: (ar, en) => ar,
    console,
    clearTimeout() {},
    setTimeout() { return 1; },
    window: {},
    sched() {}
  };

  const start = html.indexOf('const save=');
  const end = html.indexOf(',T=', start);

  assert.ok(start >= 0 && end > start, 'save function should exist');

  const save = vm.runInNewContext(
    html.slice(start, end) + '\n;save',
    context
  );

  return {
    save,
    context,
    oldRaw,
    getStored: () => localStorage.getItem('pt2')
  };
}

test('primary storage is verified before backup starts', async () => {
  let announceBackup;
  let releaseBackup;

  const backupStarted = new Promise(resolve => {
    announceBackup = resolve;
  });

  const backupGate = new Promise(resolve => {
    releaseBackup = resolve;
  });

  const harness = createSaveHarness(async raw => {
    announceBackup(raw);
    await backupGate;
    return true;
  });

  const saving = harness.save(false);

  const backupRaw = await backupStarted;

  assert.equal(backupRaw, harness.oldRaw);
  assert.equal(
    JSON.parse(harness.getStored()).tasks[0].id,
    'new',
    'new task must be stored before backup is awaited'
  );

  releaseBackup();

  assert.equal(await saving, true);
});

test('backup failure does not undo a verified primary save', async () => {
  const harness = createSaveHarness(async () => {
    throw new Error('Simulated backup failure');
  });

  const result = await harness.save(false);

  assert.equal(result, true);
  assert.equal(
    JSON.parse(harness.getStored()).tasks[0].id,
    'new'
  );
  assert.equal(harness.context.SAVE_FAILED, false);
});

