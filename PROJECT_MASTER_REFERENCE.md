# ENJAZI — Project Master Reference

> This is the persistent handover document for the ENJAZI project. Read it before proposing code changes, tests, releases, or product decisions. Update it after every completed task, verified milestone, changed decision, or release. Keep facts separate from pending work. Never treat an unverified claim as completed.

## 1. Repository and working rules

- Repository: `jacksparo2000m-stack/ENJAZI`
- Active working branch: `fix/primary-storage-before-backup`
- Main application: `index.html`
- Backup runtime tests: `tests/backup-runtime.test.cjs`
-  Source regression tests: `tests/source-regression.test.cjs`
- Android workflow: `.github/workflows/android.yml`


Latest branch snapshot checked while preparing this reference:
Branch: `fix/primary-storage-before-backup`

index.html blob SHA:
`c1f3d10cf576b608c907ecc481719b4a7c815a77`

tests/backup-runtime.test.cjs blob SHA:
`9793aaf775b74b0c32de36c944945264cfb5ab6e`

tests/source-regression.test.cjs blob SHA:
`57d2fd367e6ece8fdf0f4ea98f601f288f78d1e5`



Latest verified release: v1.271
Workflow run: #271
Run ID: 45014638475
Commit: bad13c74bd5988ab9790dac650c6f3da9361ac3b
Branch: fix/primary-storage-before-backup
Workflow conclusion: success
Automated test suite: 79 passed, 0 failed
npm run check: success
Android build: success
APK identity and signing verification: success
Packaged web assets verification: success
Artifact upload: success
GitHub Release publication: success

Release URL:
https://github.com/jacksparo2000m-stack/ENJAZI/releases/tag/v1.271

Workflow URL:
https://github.com/jacksparo2000m-stack/ENJAZI/actions/runs/45014638475

APK URL:
https://github.com/jacksparo2000m-stack/ENJAZI/releases/download/v1.271/enjazi.apk


### Import review — implementation and automated verification completed

Verified import behavior:
- If the IndexedDB pre-import snapshot fails, import continues only after raw localStorage preservation succeeds.
- If raw pre-import preservation fails, import aborts before replacing current data.
- If imported data write/readback verification fails, the previous raw data is restored and verified.
- In-memory application state is not committed until imported data has been written and verified.

Automated tests cover these failure scenarios.
GitHub Actions runs #173 and #174 succeeded.
Release v1.174 was published successfully.

Important: Import, restore, migration, recovery, and read-only diagnostics reviews are complete and verified. See the Phase 1 review status below.

Ordinary-save review:
- Primary storage failure preserves the previous stored data.
- Failed primary save skips backup creation.
- Previous in-memory state is restored.
- Automated test passed in workflow run #163.

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

## 4. Current status — backupStore audit

Status: IMPLEMENTATION AND AUTOMATED TESTS VERIFIED.

Verified in the live repository:
1. Candidate raw JSON and schema are validated before storage.
2. Snapshot writes use an IndexedDB readwrite transaction.
3. Stored snapshots are read back and checked for ID, raw content,
   checksum, schema, and source.
4. Pruning occurs only after successful readback verification.
5. Write/readback failure aborts the transaction and preserves
   previously valid snapshots.
6. Retention keeps the newest 10 valid snapshots across all sources.
7. Corrupt snapshots are excluded from retention and are not
   automatically deleted.
8. Legacy snapshots without a source field remain valid.
9. Duplicate raw content does not consume an additional retention slot.
10. Snapshot IDs use a sequence component plus a random component.

Automated verification:
- Workflow run #160 succeeded.
- 45 tests passed; 0 failed.
- The new retention test passed.
- APK identity, signing, and packaged web assets verified.
- Release v1.160 published successfully.

Completed Phase 1 reviews:
- backupStore audit and retention behavior.
- Ordinary-save backup behavior.
- Import preservation, verification, and rollback behavior.
- Restore preservation, verification, and rollback behavior.
- Migration backup, write verification, and rollback behavior.
- Recovery Reset preservation, backup, verification, and rollback behavior.
- Recovery Start backup-before-write and verification behavior.
- Storage diagnostics read-only behavior at the record level.

Recovery review verification:
- Recovery Reset preserves the previous raw data before creating fresh state.
- Failed fresh-state writes attempt rollback and verify the previous data.
- Failed rollback preserves the separate raw recovery copy.
- Recovery Start creates a backup before writing the initial state.
- Failed backup prevents the initial state from being written.
- Failed storage writes do not commit fresh in-memory state.
- Automated recovery regression tests passed in workflows #199 and #201.

Diagnostics review verification:
- Diagnostics reads the primary localStorage data without changing it.
- Audit and backup records are read using readonly IndexedDB transactions.
- No user records or backup snapshots are inserted, updated, or deleted by the diagnostics record-reading operations.
- Important caveat: opening IndexedDB may create the database or object stores if they do not already exist. Therefore, diagnostics are read-only at the record level, but not guaranteed to be completely side-effect-free at database-open level.
- Automated diagnostics regression test passed in workflow #202.
- Full test suite in workflow #202 attempt 2: 68 passed, 0 failed.

Phase 1 review status:
All eight planned reviews have been implemented, reviewed, and verified through automated tests.


## 5. Product roadmap — all agreed goals

Work in this order unless the user explicitly changes priorities.

### Phase 1 — Data integrity and protection (COMPLETED / VERIFIED)
- Backup storage audit and safe retention behavior completed.
- Import, restore, migration, recovery, and ordinary-save backup paths reviewed and verified.
- Storage diagnostics record-reading behavior reviewed and verified.
- Automated regression tests passed: 68 passed, 0 failed in workflow #202 attempt 2.
- Existing user data protection requirements reviewed across all eight planned areas.

  
### Phase 2 — Materials and achievement history

Status: COMPLETED / VERIFIED.

Implemented in `index.html`:
- Added group rename handler (`eg`).
- Added subject rename handler (`ei`).
- Both handlers modify only the display name and preserve stable IDs and existing associations.
- Both reject names longer than 300 characters.
- Added rename buttons to the group and subject detail views.

Source regression coverage added in `tests/source-regression.test.cjs`:
- Group rename preserves identity and contents.
- Subject rename preserves identity and links.
- Rename handlers do not call `unlinkItems`.
- Cancelled and unchanged names are ignored.
- Names longer than 300 characters are rejected.
- Rename buttons are associated with the correct IDs.

Verification:
- GitHub Actions run #219 succeeded.
- Full automated test suite: 70 passed, 0 failed.
- npm run check succeeded.
- Android native build succeeded.
- APK identity/signing and packaged web assets verified.
- Release v1.219 published successfully.
  
Phase 3 — Confirmed product improvements

Status: IN PROGRESS — requirements confirmed; implementation and verification are tracked individually.

The following six improvements are confirmed and must remain tracked until implementation and verification are complete.

Improvement 1 — Priority 1 task persistent notifications

Status: IMPLEMENTATION IN PROGRESS.

- Applies to priority 1 tasks only.
- Before the scheduled due date/time, no persistent notification should appear.
- At the due date/time, show a persistent notification.
- Keep it visible until the task is completed, deleted, or its due date/time changes.
- When due date/time changes, remove the old notification and schedule the new due time.
- Avoid duplicate notifications when reopening the app.
- Support scheduling while the app is closed and restoring pending schedules after device reboot.
- Preserve existing priority 2/3 behavior and recurrence/reminder behavior.
- Do not promise exact-minute delivery without confirming Android OS permissions and scheduling behavior.

Improvement 2 — Expandable notification details

Status: CONFIRMED / IMPLEMENTATION AND DEVICE VERIFICATION PENDING.

- Allow task notifications to expand in the Android notification shade.
- Show useful task details without requiring the app to open.
- Tapping a notification should open the app and, where supported, the relevant task.
- Preserve existing notification actions and priority 2/3 behavior.
- Verify actual behavior on the supported Android device and versions.

Improvement 3 — Recently opened memo sorting

Status: CONFIRMED / NOT IMPLEMENTED.

- Sort memos by last-opened time, newest first.
- Opening a memo updates its last-opened timestamp.
- Preserve memo IDs, content, and existing associations.
- Inspect the actual memo model and rendering before implementation.

Improvement 4 — Separate subject-linked tasks section

Status: CONFIRMED / NOT IMPLEMENTED.

- Add a separate section for tasks linked to study subjects.
- Group tasks by their associated subject.
- Display both completed and incomplete linked tasks with their completion status.
- Use existing task records and subject associations as the source of truth.
- Prefer a derived view; do not duplicate task records.
- Preserve the existing manually managed study-progress table and achievement history ("ls").
- Do not alter task-subject associations ("subjectId" / "lk") merely to display this section.

Improvement 5 — Smart notebook ENJAZI Notes

Status: CONFIRMED / DETAILED SPECIFICATION MUST BE REVIEWED BEFORE IMPLEMENTATION.

- Support multiple pages and organized notebooks.
- Allow notes to be linked to subjects, projects, tasks, and reminders.
- Support converting selected note content into tasks.
- Coordinate note state with linked tasks.
- Provide rich text formatting, lists, colors, favorites, pinning, tags, templates, and search.
- Support archive, trash, restore, sharing, export, and import.
- Provide reliable autosave.
- Retrieve and review the original detailed user requirements before implementation; do not assume this summary covers every expected behavior.

Improvement 6 — In-app and Android system Back navigation

Status: CONFIRMED / NOT IMPLEMENTED.

Expected behavior:

1. From a nested section, Back returns to the previous screen or exits the current section.
2. From a details screen, Back returns to the screen or list that opened it.
3. Only from the home screen should Back invoke the app's defined exit behavior.
4. Review both the in-app Back control and Android system Back.
5. Preserve consistent navigation and avoid accidental loss of unsaved edits.

Data safety:

- Navigation changes must not modify, delete, or reset user data.

Implementation and verification policy

- Work on one focused change at a time.
- Inspect the actual repository files before proposing edits.
- Add regression tests for each implemented behavior.
- Fetch and verify every edited file after the user's commit.
- Do not mark an improvement complete until its relevant automated tests and GitHub Actions checks pass.
- Distinguish automated source verification from actual Android device testing.
- Preserve user data; never request clearing app data or risky storage experiments.
- Update this master reference after every completed improvement and verified milestone.

## 6. Release and test discipline

- The Android workflow runs project checks (including `npm run check` / `npm test`) and builds/verifies the APK.
- Verify the exact workflow run, job conclusion, and release tag before reporting success.
- Preserve the existing signing identity and application identity.
- Never ask the user to clear app storage to resolve a development issue.
- After each release, ask only for a safe, relevant confirmation (e.g. app opens and existing subjects remain); do not ask the user to create artificial tasks just to satisfy diagnostics.

## 7. Change log

2026-11-19 — Migration review verified and v1.191 released

### 2026-11-19 — Restore automated tests and v1.180 release

- Added automated tests for restoreBackupRecord.
- Covered successful restore, failed restore with verified rollback,
  failed rollback, and raw preservation failure.
- Updated source regression assertions to support the multiline restore function.
- GitHub Actions run #180 succeeded.
- APK build, identity, signing, packaged assets, and release publication verified.
- Release v1.180 published successfully.
- Restore implementation review is still in progress.
- Migration, recovery, and read-only diagnostics remain pending.
- Phase 1 Data Protection remains open.


### 2026-11-19 — Import review verified and v1.174 released

- Completed the import preservation and verification review.
- Confirmed import aborts when raw pre-import preservation fails.
- Confirmed imported data is read back and verified before in-memory state is committed.
- Confirmed rollback restores and verifies the previous raw data when imported data verification fails.
- Added automated coverage for the failure scenarios.
- GitHub Actions runs #173 and #174 succeeded.
- Release v1.174 published successfully.
- Updated the latest branch snapshot and release details.
- Phase 1 remains open: restore, migration, recovery, and read-only diagnostics still require review.

  
### 2026-11-18 — backupStore audit verified
- Verified backupStore validation, IndexedDB transaction handling,
  readback verification, atomic pruning, and 10-valid-snapshot retention.
- Confirmed corrupt snapshots are not automatically deleted and
  legacy snapshots remain supported.
- GitHub Actions run #160 succeeded.
- Automated tests: 45 passed, 0 failed.
- APK identity, signing, and packaged web assets verified.
- Release v1.160 published successfully.
- Updated Sections 1 and 4 with verified repository and release status.
- Phase 1 remains open: ordinary save, import, restore, migration,
  recovery, and read-only diagnostics still require review.



### 2026-11-18 — Achievement log description feature verified

Problem:
- Completing a task linked to a subject displayed only the task title in the subject achievement log.
- The task description was not preserved in the achievement log.

Implementation in `index.html`:
- `lkd()` now saves the task description in the subject log entry.
- `logDescription()` reads the saved description and supports legacy entries by falling back to the original task description when available.
- `track()` displays the description under the achievement title.
- `vld()` validates the optional description with a maximum length of 10,000 characters.

Automated test coverage added in `tests/backup-runtime.test.cjs`:
- Verifies that completing a task stores its description in the subject log.
- Verifies that the saved description remains available after the original task is removed.
- Verifies legacy fallback to the original task description.
- Verifies that the achievement log view contains description-rendering markup.

Verification:
- GitHub Actions run #169 succeeded.
- Release v1.169 was published successfully.
- Exact automated test count was not independently verified.

Important status distinction:
- This achievement-log feature is a separate product improvement.
- It does NOT mean Phase 1 Data Protection is complete.
- Import, restore, migration, recovery, and read-only diagnostics still require their planned reviews and verification.


  ### 2026-11-20 — Phase 1 Data Protection completed and v1.202 verified

- Completed all eight planned Phase 1 reviews.
- Verified Recovery Reset, Recovery Start, and storage diagnostics.
- Full automated test suite: 68 passed, 0 failed.
- GitHub Actions run #202 attempt 2 succeeded.
- APK build, identity/signing, packaged assets, and release publication verified.
- Release v1.202 published successfully.
- Phase 1 — Data integrity and protection: COMPLETED / VERIFIED.
- Next planned milestone: Phase 2 — Materials and achievement history.


  2026-11-20 — New Product Improvements Roadmap
  In-app Back Navigation — CONFIRMED / NOT IMPLEMENTED

User requirement:
Fix the Back behavior so navigating backward inside ENJAZI does not unexpectedly exit the application.

Expected behavior:

1. From a nested section, Back returns to the previous screen or exits the current section.
2. From a details screen, Back returns to the list or screen that opened it.
3. Only from the home screen should Back invoke the app's defined exit behavior.
4. Review both the in-app Back button and Android system Back navigation.
5. Keep navigation behavior consistent across screens and avoid breaking existing navigation flows.

Status: AGREED REQUIREMENT — IMPLEMENTATION NOT STARTED.

Verification: Test nested sections, details screens, home screen, Android system Back, and the in-app Back control.

Data safety: Navigation changes must not modify, delete, or reset user data.

Status: AGREED REQUIREMENTS — IMPLEMENTATION NOT STARTED.

The following four improvements were requested by the user and must be tracked until implementation and verification are complete.

Improvement 1 — Priority 1 task persistent notifications

Scope:

- Applies to priority 1 tasks only.
- Priority 2 and priority 3 notification behavior must remain unchanged.

Agreed lifecycle:

- No persistent notification should appear in the Android notification shade before the task's scheduled due date and time.
- When the due date and time arrive, show a persistent notification.
- Keep the notification visible until the task is completed, deleted, or its due date/time is changed.
- When the due date/time changes, immediately remove the old notification and schedule the task for its new due time.
- Do not show the notification before the new due time.
- Avoid duplicate notifications when the app is reopened.
- Scheduling must work while the app is closed.
- Pending schedules must be restored after device reboot.

Technical investigation required:

- Inspect the existing Capacitor Local Notifications integration and native Android persistent-notification implementation.
- Inspect Android manifest, permissions, target SDK, receivers, and boot restoration.
- Evaluate Android AlarmManager scheduling and exact-alarm restrictions before selecting the implementation.
- Do not promise exact-minute delivery until Android permissions and OS behavior have been verified.

Improvement 2 — Expandable notification details

Goal:

- Allow the user to expand a task notification directly from the Android notification shade.
- Display useful task details without requiring the app to open.
- Tapping the notification should open the app.
- Preserve existing notification actions and priority 2/3 behavior.
- Actual appearance and behavior must be verified on the supported Android versions and device.

Improvement 3 — Recently opened memo sorting

Goal:

- Sort memos by last-opened time, newest first.
- Opening a memo updates its last-opened timestamp.
- Example: opening Database Systems moves it to the top; opening Data Structures afterward moves Data Structures to the top.
- Preserve memo IDs, content, and existing associations.
- Inspect the current memo data model and rendering before implementation.

Improvement 4 — Separate subject-linked tasks section

Goal:

- Add a separate section in the task area for tasks linked to study subjects.
- Group tasks by their associated subject.
- Display both completed and incomplete linked tasks, with their completion status.
- Use existing task records and subject associations as the source of truth.
- Prefer a derived view; do not duplicate task records or create a second independent task database.
- Do not alter the existing ENJAZI achievement/lecture history ("ls") or task-subject associations ("subjectId" / "lk") merely to display this section.
- Preserve the existing manually managed study-progress table.

Implementation and verification policy

- Implement one focused change at a time.
- Inspect the actual repository files before editing.
- Add regression tests for each behavior.
- Fetch and verify every edited file after the user's edit.
- Do not mark an improvement complete until its tests and relevant GitHub Actions checks pass.
- Update this master reference after every completed improvement and verified milestone.
- Preserve user data and never request clearing app data or risky storage experiments.
