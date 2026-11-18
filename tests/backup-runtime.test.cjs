'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');


function fakeIndexedDB(options = {}) {
  const records = new Map();

  const clone = value =>
    value && typeof value === 'object'
      ? { ...value }
      : value;

  const db = {
    stores: new Map(),

    objectStoreNames: {
      contains: name => db.stores.has(name)
    },

    createObjectStore(name) {
      db.stores.set(name, records);
      return {};
    },

    transaction(name, mode = 'readonly') {
      const data = db.stores.get(name);

      if (!data) {
        throw new Error('Missing object store: ' + name);
      }

      const writable = mode === 'readwrite';
      const working = new Map(
        [...data.entries()].map(([key, value]) => [
          key,
          clone(value)
        ])
      );

      const queue = [];

      let aborted = false;
      let completed = false;
      let pumpScheduled = false;
      let finishScheduled = false;

      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,

        abort() {
          if (aborted || completed) return;

          aborted = true;
          queue.length = 0;

          queueMicrotask(() => {
            tx.onabort?.();
          });
        },

        objectStore() {
          return {
            getAll() {
              const request = {};

              queue.push(() => {
                request.result = [...working.values()].map(clone);
                request.onsuccess?.();
              });

              schedulePump();
              return request;
            },

            get(key) {
              const request = {};

              queue.push(() => {
                request.result = clone(working.get(key));

if (options.corruptReadback && request.result) {
  request.result.checksum = 'corrupted-readback';
}
                request.onsuccess?.();
              });

              schedulePump();
              return request;
            },

            put(value) {
              if (!writable) {
                throw new Error('Transaction is readonly');
              }

              const request = {};

              queue.push(() => {
                if (!value || value.id == null) {
                  throw new Error('Missing snapshot key');
                }

                working.set(value.id, clone(value));
                request.result = value.id;
                request.onsuccess?.();
              });

              schedulePump();
              return request;
            },

            delete(key) {
              if (!writable) {
                throw new Error('Transaction is readonly');
              }

              const request = {};

              queue.push(() => {
                working.delete(key);
                request.result = undefined;
                request.onsuccess?.();
              });

              schedulePump();
              return request;
            }
          };
        }
      };

      function schedulePump() {
        if (pumpScheduled || aborted || completed) return;

        pumpScheduled = true;

        queueMicrotask(() => {
          pumpScheduled = false;

          if (aborted || completed) return;

          const operation = queue.shift();

          if (operation) {
            try {
              operation();
            } catch (error) {
              tx.error = error;
              tx.abort();
              return;
            }

            schedulePump();
            return;
          }

          scheduleFinish();
        });
      }

      function scheduleFinish() {
        if (finishScheduled || aborted || completed) return;

        finishScheduled = true;

        queueMicrotask(() => {
          finishScheduled = false;

          if (aborted || completed) return;

          if (queue.length) {
            schedulePump();
            return;
          }

          if (writable) {
            data.clear();

            for (const [key, value] of working) {
              data.set(key, clone(value));
            }
          }

          completed = true;
          tx.oncomplete?.();
        });
      }

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


test('backupStore retains ten valid snapshots without pruning corrupt or legacy records', async () => {
  const start = html.indexOf("const BACKUP_DB='enjazi-data-protection'");
  const end = html.indexOf('async function restoreBackupRecord', start);

  assert.ok(start >= 0 && end > start);

  const source = html.slice(start, end) +
    '\n;({ backupStore, backupList, backupHash })';

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

  for (let version = 1; version <= 11; version++) {
    const raw = JSON.stringify({ version });

    const record = {
      id: `valid-${version}`,
      createdAt: version,
      schema: 1,
      raw,
      checksum: helpers.backupHash(raw)
    };

    if (version !== 11) {
      record.source = 'automatic';
    }

    fake.records.set(record.id, record);
  }

  const malformedRaw = '{';

  fake.records.set('corrupt-json', {
    id: 'corrupt-json',
    createdAt: 100,
    schema: 1,
    raw: malformedRaw,
    checksum: helpers.backupHash(malformedRaw),
    source: 'automatic'
  });

  fake.records.set('corrupt-checksum', {
    id: 'corrupt-checksum',
    createdAt: 101,
    schema: 1,
    raw: '{"version":99}',
    checksum: 'wrong-checksum',
    source: 'automatic'
  });

  await helpers.backupStore(JSON.stringify({ version: 12 }));

  const rows = await helpers.backupList();

  const validRows = rows.filter(record => {
    try {
      return record.schema === 1 &&
        record.checksum === helpers.backupHash(record.raw) &&
        !JSON.parse(record.raw).invalid;
    } catch (e) {
      return false;
    }
  });

  assert.equal(validRows.length, 10);

  assert.ok(
    validRows.some(record => record.id === 'valid-11'),
    'legacy snapshots without source should remain valid'
  );

  assert.ok(
    validRows.some(record => JSON.parse(record.raw).version === 12)
  );

  assert.ok(!fake.records.has('valid-1'));
  assert.ok(!fake.records.has('valid-2'));

  assert.ok(
    fake.records.has('corrupt-json'),
    'corrupt JSON snapshots must not be automatically deleted'
  );

  assert.ok(
    fake.records.has('corrupt-checksum'),
    'snapshots with invalid checksums must not be automatically deleted'
  );
});


test('fake IndexedDB readwrite transactions roll back on abort', async () => {
  const fake = fakeIndexedDB();

  const db = await new Promise((resolve, reject) => {
    const request = fake.api.open();

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshots');
    };

    request.onsuccess = () => resolve(request.result);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');

    tx.oncomplete = () => {
      reject(new Error('Aborted transaction must not complete'));
    };

    tx.onabort = resolve;

    tx.objectStore('snapshots').put({
      id: 'temporary',
      raw: 'test-data'
    }).onsuccess = () => {
      tx.abort();
    };
  });

  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  assert.deepEqual(rows, []);
});
test('fake IndexedDB rolls back writes when readback verification fails', async () => {
  const fake = fakeIndexedDB({
    corruptReadback: true
  });

  const existing = {
    id: 'existing',
    raw: '{"version":1}',
    checksum: 'valid-checksum'
  };

  fake.records.set(existing.id, existing);

  const db = await new Promise((resolve, reject) => {
    const request = fake.api.open();

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshots');
    };

    request.onsuccess = () => resolve(request.result);
  });

  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const store = tx.objectStore('snapshots');

    tx.oncomplete = () => {
      reject(new Error('Failed readback must abort the transaction'));
    };

    tx.onabort = resolve;

    store.put({
      id: 'new-snapshot',
      raw: '{"version":2}',
      checksum: 'expected-checksum'
    }).onsuccess = () => {
      const request = store.get('new-snapshot');

      request.onsuccess = () => {
        if (
          !request.result ||
          request.result.checksum !== 'expected-checksum'
        ) {
          tx.abort();
        }
      };
    };
  });

  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'existing');
  assert.equal(rows[0].checksum, 'valid-checksum');
});
test('backupStore aborts and preserves existing snapshots when production readback verification fails', async () => {
  const start = html.indexOf("const BACKUP_DB='enjazi-data-protection'");
  const end = html.indexOf('async function restoreBackupRecord', start);

  assert.ok(start >= 0 && end > start);

  const source = html.slice(start, end) +
    '\n;({ backupStore, backupList })';

  const fake = fakeIndexedDB({
    corruptReadback: true
  });

  const existing = {
    id: 'existing-snapshot',
    createdAt: 1,
    schema: 1,
    raw: '{"version":1}',
    checksum: 'existing-checksum',
    source: 'automatic'
  };

  fake.records.set(existing.id, existing);

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

  await assert.rejects(
    helpers.backupStore('{"version":2}'),
    /readback verification failed/i
  );

  const rows = await helpers.backupList();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'existing-snapshot');
  assert.equal(rows[0].raw, '{"version":1}');
  assert.equal(rows[0].checksum, 'existing-checksum');
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
    K: 'pt2',
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

test('primary save failure preserves the previous state and skips backup', async () => {
  let backupCalled = false;

  const harness = createSaveHarness(async () => {
    backupCalled = true;
    return true;
  });

  harness.context.localStorage.setItem = () => {
    throw new Error('Simulated primary storage failure');
  };

  const result = await harness.save(false);

  assert.equal(result, false);
  assert.equal(backupCalled, false);
  assert.equal(harness.getStored(), harness.oldRaw);
  assert.equal(
    harness.context.S.tasks[0].id,
    'old',
    'in-memory state must return to the last verified state'
  );
  assert.equal(harness.context.SAVE_FAILED, true);
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


test('backup snapshots preserve their source labels', async () => {
  const start = html.indexOf("const BACKUP_DB='enjazi-data-protection'");
  const end = html.indexOf('async function restoreBackupRecord', start);
  assert.ok(start >= 0 && end > start);

  const source = html.slice(start, end) +
    '\n;({ backupStore, backupList })';

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

  await helpers.backupStore(
    JSON.stringify({ version: 1 }),
    'pre-import'
  );

  await helpers.backupStore(
    JSON.stringify({ version: 2 }),
    'pre-restore'
  );

  const rows = await helpers.backupList();

  assert.equal(rows.length, 2);
  assert.ok(rows.some(x => x.source === 'pre-import'));
  assert.ok(rows.some(x => x.source === 'pre-restore'));
});


