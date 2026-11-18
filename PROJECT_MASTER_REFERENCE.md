# ENJAZI — Project Master Reference

> This is the persistent handover document for the ENJAZI project. Read it before proposing code changes, tests, releases, or product decisions. Update it after every completed task, verified milestone, changed decision, or release. Keep facts separate from pending work. Never treat an unverified claim as completed.

## 1. Repository and working rules

- Repository: `jacksparo2000m-stack/ENJAZI`
- Active working branch: `fix/primary-storage-before-backup`
- Main application: `index.html`
- Backup runtime tests: `tests/backup-runtime.test.cjs`
- Android workflow: `.github/workflows/android.yml`
- Latest branch snapshot checked while preparing this reference:
  - `index.html` blob SHA: `3a7eedb41e936183ce8976b8df2c3cfcb5bdd831`
  - `tests/backup-runtime.test.cjs` blob SHA: `b03ca9ba1a021b032b65c26b19ba5f7a40a607d5`
- Latest verified release in the current handover context: `v1.146`, workflow run #146 completed successfully. Verify GitHub Actions and Releases before claiming any newer release exists.

### Collaboration rules

1. The user edits files through GitHub on an Android device and reports when the edit is complete. Give exact file paths and unique anchor text; make one focused change at a time.
2. After the user says an edit is complete, fetch the actual branch file again and inspect the result before proposing another change.
3. Run or inspect automated tests and GitHub Actions before claiming success. Never claim a build, test, or release succeeded without checking.
4. Do not make direct repository edits unless the user explicitly asks you to do so.
5. Never ask the user to uninstall the app, clear app data, reset storage, or perform risky restore/import/reset experiments on real data. Install updates over the existing app only.
6. Explain in simple Egyptian Arabic, step by step. Explain risks before any operation that could affect data.
7. If context is missing, read this document and inspect the repository; do not guess.

## 2. User's actual app data and device-test context

- The user currently has **one subject group containing two subjects** in the Materials section.
- The user has intentionally created **zero tasks**. Therefore diagnostics reporting `saved tasks: 0` and `in-memory tasks: 0` is expected, not evidence of data loss.
- Never interpret old test audit entries or old snapshots containing one test task as the user's current data.
- The user installed `v1.146` over the existing app and confirmed their two subjects remained present.
- Latest diagnostic report in the handover context:
  - localStorage available; primary JSON valid.
  - one saved group.
  - IndexedDB readable with 10 snapshots; all 10 passed checksum, JSON, and schema validation.
  - `save failed: false`; `boot recovery: false`.
  - `storage persistence granted: false`. Android runtime did not grant the extra persistence request; this does **not** mean localStorage/IndexedDB saving failed.
- The user has an external JSON backup. Preserve this safety practice.

## 3. Data protection architecture and agreed policy

- Primary storage: localStorage.
- Backup database: IndexedDB database `enjazi-data-protection`, object store `snapshots`.
- Snapshot records include an ID, creation time, schema, raw JSON, checksum, and source label.
- `backupStore(raw, source='automatic')` validates data and stores snapshots.
- `backupList()` lists snapshots.
- Restore validates checksum and schema, preserves current state before restoring, then verifies the restored write.
- Save writes and verifies localStorage first; failure to create a backup must not invalidate a successful primary save.
- Import validates incoming JSON/schema and preserves current state before replacement.
- Diagnostics should read and report state; they must not mutate user data.

### Retention policy — agreed

Keep **at most 10 valid snapshots total across all sources**, not 10 per source. Sources:
- `automatic`
- `pre-import`
- `pre-restore`
- `recovery`
- `migration`

Do not delete legacy localStorage preservation keys such as `_preimport_` or `_pre_restore_` until a separate safe cleanup design proves that a valid matching IndexedDB snapshot exists and is readable.

### Source labels — implemented in the working-branch context

Allowed source values: `automatic`, `pre-import`, `pre-restore`, `recovery`, `migration`.

Known call-site intent:
- ordinary save / initial boot snapshot: `automatic`
- before import: `pre-import`
- before restore: `pre-restore`
- reset recovery snapshot: `recovery`
- migration snapshot: `migration`

Older snapshots may not have a source field. Do not falsely infer their historical source; present them as legacy/unspecified or use a clearly documented display fallback.

Known design consideration: duplicate suppression may skip creating a new record when identical raw data already exists, retaining the earlier record's source. Do not change this without deciding whether source should represent the original snapshot or multiple reasons/sources.

## 4. Immediate active task

**Review and strengthen `backupStore` and its automated tests. No implementation change for this task has yet been verified.**

Acceptance goals to inspect against the actual code:
1. Validate candidate raw JSON and schema before storage.
2. Write the snapshot using an IndexedDB transaction.
3. Read the stored record back and verify raw content, checksum, schema, and source.
4. Only after successful verification, prune old records so no more than the newest 10 valid snapshots remain.
5. Ensure failed write/readback/verification cannot delete previously valid snapshots. Prefer atomic write + readback + pruning in one transaction where IndexedDB semantics permit it.
6. Define and test duplicate-raw behavior, including a store that already contains more than 10 records.
7. Test ordering and unique IDs; timestamps alone may not be unique.

These are acceptance goals, not claims that the current code already meets them. Inspect the complete current `backupStore`, `backupList`, transaction helpers, and related tests before suggesting edits. Check whether the test IndexedDB mock accurately models transaction completion, abort, and rollback; improve the mock if necessary.

## 5. Product roadmap — all agreed goals

Work in this order unless the user explicitly changes priorities.

### Phase 1 — Data integrity and protection (current)
- Complete backup storage audit and safe retention behavior.
- Verify import, restore, migration, recovery, and ordinary-save backup paths.
- Keep diagnostics read-only.
- Protect existing user data throughout.

### Phase 2 — Materials and achievement history
- Rename an entire subject group.
- Rename an individual subject.
- Verify references and associated tasks/history remain correct.

### Phase 3 — Android system Back behavior
- Support the device/system back action as well as the in-app back control.
- Handle pages, dialogs, and navigation correctly.
- Avoid accidental app exit or loss of unsaved edits.

### Phase 4 — Notes / notebook redesign
- Provide a spacious writing experience similar in convenience to the native notes app on Huawei Y7.
- Add suitable writing and editing conveniences.
- Keep the interface practical on the user's Android device.

### Phase 5 — Tasks and productivity
- Improve task management and organization.
- Develop persistent notifications/reminders: the user's goal is for pending-task notifications to remain visible in the Android notification shade until the task is completed or deleted, subject to Android OS notification behavior and permissions.
- Improve the daily workflow without compromising reliability.

### Phase 6 — Final quality and stable release
- Run full automated checks and targeted regression tests.
- Verify Android package identity/signing and packaged web assets.
- Verify install-over-existing-app behavior and data preservation.
- Publish only after checks pass.

## 6. Release and test discipline

- The Android workflow runs project checks (including `npm run check` / `npm test`) and builds/verifies the APK.
- Verify the exact workflow run, job conclusion, and release tag before reporting success.
- Preserve the existing signing identity and application identity.
- Never ask the user to clear app storage to resolve a development issue.
- After each release, ask only for a safe, relevant confirmation (e.g. app opens and existing subjects remain); do not ask the user to create artificial tasks just to satisfy diagnostics.

## 7. Change log

### 2026-11-18 — Reference document prepared
- Prepared this master handover reference for the `fix/primary-storage-before-backup` branch.
- Captured known architecture, user-data facts, backup policy, active task, and agreed roadmap.
- The `backupStore` readback/atomic-pruning review remains pending and must be verified against the live repository before implementation.
