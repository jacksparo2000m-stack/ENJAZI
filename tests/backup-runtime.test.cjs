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

test('import preserves the current raw data when IndexedDB pre-import backup fails', async () => {
  const start = html.indexOf("$('#imp').addEventListener('change'");
  const end = html.indexOf("document.addEventListener('keydown'", start);

  assert.ok(start >= 0 && end > start, 'import handler should exist');

  const source = html.slice(start, end);

  const oldRaw = JSON.stringify({
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'old-group', n: 'Old', it: [] }]
  });

  const imported = {
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'new-group', n: 'New', it: [] }]
  };

  const values = new Map([['pt2', oldRaw]]);
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };

    const input = {
    files: [{ size: 100 }],
    value: '',
    addEventListener(event, handler) {
      this.handler = handler;
    }
  };
  
  let reader;
  let backupArgs;

  class FakeFileReader {
    constructor() {
      reader = this;
      this.result = JSON.stringify(imported);
    }
    readAsText() {}
  }

  const context = {
    $: () => input,
    FileReader: FakeFileReader,
    localStorage,
    K: 'pt2',
    S: JSON.parse(oldRaw),
    RECOVERY: false,
    SAVE_FAILED: false,
    LAST_GOOD_RAW: oldRaw,
    BOOT_RAW: oldRaw,
    BOOT_DATA: JSON.parse(oldRaw),
    BOOT_ERROR: '',
    BOOT_READ_FAILED: false,
    vld: () => '',
    mig() {},
    T: (ar, en) => ar,
    toast() {},
    confirm: () => true,
    console,
    JSON,
    Promise,
    Date,
    clearTimeout() {},
    save: { t: null },
    enqueueSaveOperation: work => Promise.resolve().then(work),
    backupStore: async (...args) => {
      backupArgs = args;
      throw new Error('Simulated IndexedDB backup failure');
    },
    render() {},
    LN: null
  };

    vm.runInNewContext(source, context);

  input.handler({ target: input });
  await reader.onload();
  assert.equal(backupArgs[0], oldRaw);
  assert.equal(backupArgs[1], 'pre-import');

  const saved = JSON.parse(localStorage.getItem('pt2'));   assert.equal(saved.lang, imported.lang);   assert.deepEqual(saved.tasks, imported.tasks);   assert.deepEqual(saved.groups, imported.groups);

  const preservedKey = [...values.keys()].find(
    key => key.startsWith('pt2_preimport_')
  );

  assert.ok(preservedKey, 'raw pre-import backup key should exist');
  assert.equal(localStorage.getItem(preservedKey), oldRaw);
});


test('completed linked tasks preserve and display their descriptions in subject progress', () => {
  const start = html.indexOf('const logDescription=l=>');
  const end = html.indexOf('const nd=', start);

  assert.ok(start >= 0 && end > start, 'linked task logging helpers should exist');

  const source = html.slice(start, end) +
    '\n;({ logDescription, lkd })';

  const task = {
    id: 'task-1',
    t: 'ذاكر مادة البرمجة',
    n: 'مذاكرة المحاضرة الثانية وحل التدريبات',
    lk: 'group-1:item-1'
  };

  const item = {
    id: 'item-1',
    n: 'البرمجة',
    ls: []
  };

  const context = {
    S: {
      tasks: [task],
      groups: [{
        id: 'group-1',
        n: 'مواد الكلية',
        it: [item]
      }]
    },
    Date
  };

  const helpers = vm.runInNewContext(source, context);

  helpers.lkd(task, 1);

  assert.equal(item.ls.length, 1);
  assert.equal(item.ls[0].n, task.t);
  assert.equal(
    item.ls[0].description,
    task.n,
    'completed task description must be saved in the subject log'
  );

  assert.equal(
    helpers.logDescription(item.ls[0]),
    task.n,
    'subject progress must display the saved description'
  );

  context.S.tasks = [];

  assert.equal(
    helpers.logDescription(item.ls[0]),
    task.n,
    'saved description must remain available without the original task'
  );

  const legacyTask = {
    id: 'legacy-task',
    n: 'وصف مهمة قديمة'
  };

  context.S.tasks = [legacyTask];

  assert.equal(
    helpers.logDescription({
      id: 'tlegacy-task',
      n: 'مهمة قديمة'
    }),
    legacyTask.n,
    'legacy logs should fall back to the original task description'
  );

  const trackStart = html.indexOf('function track(){');
  const trackEnd = html.indexOf('const seg=', trackStart);
  const trackSource = html.slice(trackStart, trackEnd);

  assert.ok(
    trackSource.includes("${logDescription(l)?`<p>${E(logDescription(l))}</p>`:''}"),
    'subject progress view must render the description below the title'
  );
});


test('import aborts before replacing current data when raw pre-import preservation fails', async () => {
  const start = html.indexOf("$('#imp').addEventListener('change'");
  const end = html.indexOf("document.addEventListener('keydown'", start);

  assert.ok(start >= 0 && end > start, 'import handler should exist');

  const source = html.slice(start, end);

  const oldRaw = JSON.stringify({
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'old-group', n: 'Old', it: [] }]
  });

  const imported = {
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'new-group', n: 'New', it: [] }]
  };

  const values = new Map([['pt2', oldRaw]]);
  let rawBackupAttempted = false;
  let importedWriteAttempted = false;
  let reader;

  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key.startsWith('pt2_preimport_')) {
        rawBackupAttempted = true;
        throw new Error('Simulated raw preservation failure');
      }

      if (key === 'pt2') {
        importedWriteAttempted = true;
      }

      values.set(key, String(value));
    }
  };

  const input = {
    files: [{ size: 100 }],
    value: '',
    addEventListener(event, handler) {
      this.handler = handler;
    }
  };

  class FakeFileReader {
    constructor() {
      reader = this;
      this.result = JSON.stringify(imported);
    }
    readAsText() {}
  }

  const context = {
    $: () => input,
    FileReader: FakeFileReader,
    localStorage,
    K: 'pt2',
    S: JSON.parse(oldRaw),
    RECOVERY: false,
    SAVE_FAILED: false,
    LAST_GOOD_RAW: oldRaw,
    BOOT_RAW: oldRaw,
    BOOT_DATA: JSON.parse(oldRaw),
    BOOT_ERROR: '',
    BOOT_READ_FAILED: false,
    vld: () => '',
    mig() {},
    T: (ar, en) => ar,
    toast() {},
    confirm: () => true,
    console,
    JSON,
    Promise,
    Date,
    clearTimeout() {},
    save: { t: null },
    enqueueSaveOperation: work => Promise.resolve().then(work),
    backupStore: async () => {
      throw new Error('Simulated IndexedDB backup failure');
    },
    render() {},
    LN: null
  };

  vm.runInNewContext(source, context);

  input.handler({ target: input });
  await reader.onload();

  assert.equal(rawBackupAttempted, true);
  assert.equal(importedWriteAttempted, false);
  assert.equal(
    localStorage.getItem('pt2'),
    oldRaw,
    'current data must remain unchanged when raw preservation fails'
  );
});


test('import rolls back to the previous raw data when imported data verification fails', async () => {
  const start = html.indexOf("$('#imp').addEventListener('change'");
  const end = html.indexOf("document.addEventListener('keydown'", start);

  assert.ok(start >= 0 && end > start, 'import handler should exist');

  const oldRaw = JSON.stringify({
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'old-group', n: 'Old', it: [] }]
  });

  const imported = {
    lang: 'ar',
    tasks: [],
    groups: [{ id: 'new-group', n: 'New', it: [] }]
  };

  const values = new Map([['pt2', oldRaw]]);
  let importedWriteAttempted = false;
  let rollbackAttempted = false;
  let reader;

  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key === 'pt2' && String(value) !== oldRaw) {
        importedWriteAttempted = true;
        values.set(key, 'corrupted-imported-data');
        return;
      }

      if (key === 'pt2' && importedWriteAttempted) {
        rollbackAttempted = true;
      }

      values.set(key, String(value));
    }
  };

  const input = {
    files: [{ size: 100 }],
    value: '',
    addEventListener(event, handler) {
      this.handler = handler;
    }
  };

  class FakeFileReader {
    constructor() {
      reader = this;
      this.result = JSON.stringify(imported);
    }
    readAsText() {}
  }

  const context = {
    $: () => input,
    FileReader: FakeFileReader,
    localStorage,
    K: 'pt2',
    S: JSON.parse(oldRaw),
    RECOVERY: false,
    SAVE_FAILED: false,
    LAST_GOOD_RAW: oldRaw,
    BOOT_RAW: oldRaw,
    BOOT_DATA: JSON.parse(oldRaw),
    BOOT_ERROR: '',
    BOOT_READ_FAILED: false,
    vld: () => '',
    mig() {},
    T: (ar, en) => ar,
    toast() {},
    confirm: () => true,
    console,
    JSON,
    Promise,
    Date,
    clearTimeout() {},
    save: { t: null },
    enqueueSaveOperation: work => Promise.resolve().then(work),
    backupStore: async () => {
      throw new Error('Simulated IndexedDB backup failure');
    },
    render() {},
    LN: null
  };

  vm.runInNewContext(
    html.slice(start, end),
    context
  );

  input.handler({ target: input });
  await reader.onload();

  assert.equal(importedWriteAttempted, true);
  assert.equal(rollbackAttempted, true);
  assert.equal(
    localStorage.getItem('pt2'),
    oldRaw,
    'previous data must be restored after imported data verification fails'
  );
});


test('restoreBackupRecord preserves data and commits state only after verified storage writes', async t => {
  const start = html.indexOf('async function restoreBackupRecord(record){');
  const end = html.indexOf('\nconst enqueueSaveOperation=work=>', start);

  assert.ok(start >= 0 && end > start, 'restore function should exist');

  const source = html.slice(start, end) + '\n;restoreBackupRecord';

  const oldData = {
    version: 1,
    tasks: [],
    groups: [{ id: 'old', n: 'Old', it: [] }]
  };

  const restoredData = {
    version: 2,
    tasks: [],
    groups: [{ id: 'new', n: 'New', it: [] }]
  };

  const oldRaw = JSON.stringify(oldData);
const restoredRaw = JSON.stringify(restoredData);
const corruptCurrentRaw = 'corrupted-current-data';

  async function runScenario(mode) {
    const initialRaw =
  mode === 'no-previous-data'
    ? null
    : mode === 'invalid-current-data'
      ? corruptCurrentRaw
      : oldRaw;

const values = new Map(
  initialRaw === null ? [] : [['pt2', initialRaw]]
);
    let renderCount = 0;
    let toastCount = 0;

    const localStorage = {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },

      setItem(key, value) {
        value = String(value);

        if (
          mode === 'preservation-failure' &&
          key.startsWith('pt2_pre_restore_')
        ) {
          throw new Error('Simulated raw preservation failure');
        }

        if (key === 'pt2' && value === restoredRaw) {
          if (mode !== 'success') {
            values.set(key, 'corrupted-restored-data');
            return;
          }
        }

        if (
          key === 'pt2' &&
          value === oldRaw &&
          mode === 'rollback-failure'
        ) {
          throw new Error('Simulated rollback failure');
        }

        values.set(key, value);
      }
    };

    const context = {
      localStorage,
      K: 'pt2',
      LAST_GOOD_RAW: mode === 'no-previous-data' ? null : oldRaw,
      S: oldData,
      BOOT_RAW: oldRaw,
      BOOT_DATA: oldData,
      RECOVERY: false,
      SAVE_FAILED: false,
      BOOT_ERROR: '',
      BOOT_READ_FAILED: false,

      backupHash: raw => 'hash:' + raw,
      vld: () => '',
      mig() {},
      enqueueSaveOperation: work => Promise.resolve().then(work),
      backupStore: async () => true,

      render() {
        renderCount++;
      },

      toast() {
        toastCount++;
      },

      T: (ar, en) => ar,
      JSON,
      Date,
      Promise,
      Error,
      console
    };

    const restore = vm.runInNewContext(source, context);

    const record = {
      raw: restoredRaw,
      checksum: 'hash:' + restoredRaw
    };

    let error = null;

    try {
      await restore(record);
    } catch (e) {
      error = e;
    }

    return {
      values,
      context,
      error,
      renderCount,
      toastCount
    };
  }

  await t.test('successful restore commits only after verification', async () => {
    const result = await runScenario('success');

    assert.equal(result.error, null);
    assert.equal(result.values.get('pt2'), restoredRaw);
    assert.equal(result.context.LAST_GOOD_RAW, restoredRaw);
    assert.equal(result.context.S.groups[0].id, 'new');
    assert.equal(result.context.BOOT_RAW, restoredRaw);
    assert.equal(result.renderCount, 1);
    assert.equal(result.toastCount, 1);
  });

  await t.test('failed restore rolls back and verifies previous data', async () => {
    const result = await runScenario('rollback-success');

    assert.ok(result.error);
    assert.match(result.error.message, /Restore failed/);
    assert.equal(result.values.get('pt2'), oldRaw);
    assert.equal(result.context.LAST_GOOD_RAW, oldRaw);
    assert.equal(result.context.S.groups[0].id, 'old');
    assert.equal(result.renderCount, 0);
    assert.equal(result.toastCount, 0);
  });

  await t.test('failed restore and failed rollback report both failures', async () => {
    const result = await runScenario('rollback-failure');

    assert.ok(result.error);
    assert.match(result.error.message, /could not be verified/);
    assert.match(result.error.message, /Simulated rollback failure/);

    const rawKey = [...result.values.keys()].find(
      key => key.startsWith('pt2_pre_restore_')
    );

    assert.ok(rawKey, 'raw pre-restore copy should remain available');
    assert.equal(result.values.get(rawKey), oldRaw);
    assert.equal(result.context.S.groups[0].id, 'old');
    assert.equal(result.renderCount, 0);
    assert.equal(result.toastCount, 0);
  });

  await t.test('raw preservation failure aborts before primary mutation', async () => {
    const result = await runScenario('preservation-failure');

    assert.ok(result.error);
    assert.match(result.error.message, /Pre-restore raw backup verification failed|Simulated raw preservation failure/);
    assert.equal(result.values.get('pt2'), oldRaw);
    assert.equal(result.context.S.groups[0].id, 'old');
    assert.equal(result.renderCount, 0);
    assert.equal(result.toastCount, 0);
  });
  
  await t.test('failed restore without previous data reports that no rollback was available', async () => {
    const result = await runScenario('no-previous-data');

    assert.ok(result.error);
    assert.match(
      result.error.message,
      /No previous data was available to roll back to/
    );

    assert.equal(
      result.context.LAST_GOOD_RAW,
      null
    );

    assert.equal(
      result.context.S.groups[0].id,
      'old',
      'in-memory state must not be committed after failed restore'
    );

    assert.equal(result.renderCount, 0);
    assert.equal(result.toastCount, 0);
  });
    await t.test('failed restore does not replace a valid last-good value with corrupt primary bytes', async () => {
    const result = await runScenario('invalid-current-data');

    assert.ok(result.error);

    assert.equal(
      result.values.get('pt2'),
      corruptCurrentRaw
    );

    assert.equal(
      result.context.LAST_GOOD_RAW,
      oldRaw,
      'a corrupt primary value must not replace the known-good raw value'
    );

    const rawKey = [...result.values.keys()].find(
      key => key.startsWith('pt2_pre_restore_')
    );

    assert.ok(rawKey);
    assert.equal(result.values.get(rawKey), corruptCurrentRaw);

    assert.equal(result.context.S.groups[0].id, 'old');
    assert.equal(result.renderCount, 0);
    assert.equal(result.toastCount, 0);
  });

});


