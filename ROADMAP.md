ENJAZI — Product Roadmap

Project: ENJAZI (إنجازي)
Repository: "jacksparo2000m-stack/ENJAZI"
Branch: "fix/primary-storage-before-backup"
Last updated: 2026-11-28
Latest verified release: v1.356
Latest verified workflow: #356
Status: Active Development — Documentation Review
---

1. Product Vision

ENJAZI is intended to become a dependable daily companion for organizing university study, tasks, notes, progress, and reminders.

The main goal is to deliver a usable application as quickly as possible without sacrificing data safety or stability.

Development priorities:

1. Reliability and data protection.
2. A unified subject system.
3. Task management connected to subjects.
4. A rich-text notepad connected to subjects.
5. A combined subject workspace.
6. Reliable notifications.
7. Final testing and release.

---

2. Current Verified Project Baseline

2.1 Application architecture

- Android application built with Capacitor.
- Main interface and application logic are primarily in "index.html".
- Native bridge code exists in "src/native.js".
- GitHub Actions is used to build the Android APK.
- Automated source regression tests exist.

2.2 Existing progress system

The application already has a progress structure:

- Sections are represented by "groups".
- Subjects/projects are represented by "groups[].it".
- Each subject/project can contain lecture records.
- Progress is calculated from completed lecture records.

Important: The existing subject/project structure should be reused as the canonical subject system. Do not create a duplicate subject catalogue.

2.3 Existing task system

The task editor already supports:

- Task title and description.
- Date and time.
- Reminders.
- Repeat settings.
- Priority.
- Categories.
- Subtasks.
- A legacy progress-item association stored in "task.lk".

The legacy "task.lk" behavior can synchronize task completion with lecture records.

Important: Do not silently repurpose or break "task.lk". A new independent subject association should be introduced for ordinary task-to-subject linking.

2.4 Existing storage system

- Primary application state is stored in localStorage under "pt2".
- IndexedDB stores up to 10 validated protection snapshots.
- Backup export/import functionality exists.
- Storage diagnostics are available in the application.

2.5 Latest verified persistence fix

Commit:

"7081b8ab9b9de8ab8c3d4eb28669dd865c4a51d5"

A startup state-cloning bug was fixed.

The user installed the resulting APK, created a test task, fully closed the application, reopened it, and confirmed that the task remained visible.

The corresponding diagnostics showed valid saved JSON and one saved task after restart.

Scope of verification: This specific close/reopen test passed. It is not a guarantee against every possible data-loss scenario.

2.6 Remaining storage concern

The diagnostic value:

"storage persistence granted: false"

remains unresolved and must be investigated separately.

Do not claim that this diagnostic is fixed until it has been tested.

---

3. Approved Product Decisions

These decisions have been explicitly approved by the user.

3.1 Unified subject system

- Reuse the existing progress subject/project records.
- Tasks may optionally be linked to a subject.
- Notepad pages may optionally be linked to a subject.
- A subject workspace should eventually display its related tasks and notes together.
- Subject associations must remain stable and must not depend on display names.

3.2 Notepad

The user approved the following design:

Feature| Approved decision
Editor| Rich Text Editor
Subject association| Optional
Pages| Independent pages
Creation timestamp| Automatic
Last-modified timestamp| Automatic
Deletion| Permanent
Deletion confirmation| Required
Arabic support| Required
English support| Required

Notepad page behavior

Each page should have:

- A unique ID.
- A title.
- Rich-text content.
- An optional subject association.
- Creation date and time.
- Last-modified date and time.

The notepad should support:

- Creating pages.
- Editing pages.
- Viewing pages.
- Deleting pages permanently after confirmation.
- Finding pages associated with a particular subject.
- Displaying dates and times in the user's locale.

Rich-text editing requirements

The editor should support common formatting:

- Headings.
- Bold text.
- Italic text.
- Text colors.
- Bulleted lists.
- Numbered lists.
- Paragraphs and normal text.

Pasted or user-entered HTML must be sanitized using an explicit safe allowlist before saving or rendering.

The editor must not execute arbitrary scripts or unsafe embedded HTML.

---

4. Implementation Roadmap

Milestone 0 — Protect the Existing Application

Priority: Critical

Before changing the data model:

- Preserve backward compatibility with existing installations.
- Add regression tests before changing the state structure.
- Preserve all existing tasks, sections, subjects, lecture records, and settings.
- Never clear application data as part of feature development.
- Never remove existing backup records as part of feature development.
- Keep changes small enough to test independently.
- Build and run source checks after each contained change.

Acceptance criteria

- Existing installations can open the updated application.
- Existing tasks remain available.
- Existing progress records remain available.
- Existing backup snapshots remain readable.
- No existing behavior is unintentionally broken.

---

Milestone 1 — Unified Subject Associations

Priority: Very High

The existing subject/project records should become the shared reference for tasks and notes.

Task-to-subject association

Introduce a stable optional association:

"task.subjectId"

This must be separate from the existing legacy "task.lk".

Implement:

- Subject selection when creating a task.
- Subject selection when editing a task.
- Ability to remove the association.
- Display the associated subject on task cards.
- Filtering tasks by subject.
- A clear "No subject" option.

Data migration

Existing tasks must continue working.

Do not automatically interpret every old "task.lk" value as a new "subjectId" unless the mapping is verified and unambiguous.

Preserve all old "task.lk" values and their lecture synchronization behavior.

Subject deletion behavior

When a subject is deleted:

- Do not delete its associated tasks.
- Do not delete its associated notes.
- Clear associations to the deleted subject.
- Prevent orphan references.

Acceptance criteria

- A task can be linked to an existing subject.
- A task can remain unlinked.
- Editing a task preserves its subject association.
- Existing lecture tracking still works.
- Existing tasks survive migration and application restart.

---

Milestone 2 — Notepad MVP

Priority: Very High

Implement the approved independent-page notepad.

Data model

Introduce a backward-compatible "notes" collection in application state.

Each note should contain:

- "id"
- "title"
- "content"
- "subjectId" (optional)
- "createdAt"
- "updatedAt"

Use stable unique identifiers.

Use a timestamp representation consistently throughout the application.

Main notepad features

- Notes list.
- Create note.
- Edit note.
- View note.
- Permanently delete note after confirmation.
- Search notes by title and content.
- Filter notes by subject.
- Display creation and modification timestamps.

Rich-text editor

Implement a reliable editor with:

- Headings.
- Bold and italic.
- Text colors.
- Bulleted lists.
- Numbered lists.
- Normal paragraphs.

The editor must work with Arabic and English text.

The interface must respect RTL and LTR direction.

Data safety

- Sanitize HTML before saving and rendering.
- Preserve notes when the application closes.
- Preserve notes after application restart.
- Include notes in backup export.
- Restore notes safely during backup import.
- Validate imported note data before replacing existing state.

Acceptance criteria

- A new note can be created and saved.
- The note can be edited without losing its original creation timestamp.
- Its modification timestamp changes after editing.
- A note can be associated with a subject or left unassociated.
- Permanent deletion requires confirmation.
- Notes survive close/reopen testing.
- Backup export/import preserves notes and their associations.

---

Milestone 3 — Subject Workspace

Priority: High

Make each subject a central workspace.

When the user opens a subject, the application should eventually display:

Subject overview

- Subject name.
- Progress information.
- Completed lecture information where applicable.

Subject tasks

- Tasks associated with this subject.
- Task completion status.
- Task priority.
- Task dates.

Subject notes

- Notes associated with this subject.
- Note titles.
- Creation or modification dates.
- Ability to open a note directly.

The subject workspace should bring related study information together without mixing task completion with lecture progress.

Acceptance criteria

- The subject displays only its associated tasks.
- The subject displays only its associated notes.
- Unassociated tasks and notes remain accessible from their main sections.
- Existing progress calculations remain correct.

---

Milestone 4 — Notifications and Daily-Use Improvements

Priority: High

Review and improve:

- Android notification permissions.
- Reminder scheduling.
- Notification timing.
- Notifications while the app is open.
- Notifications while the app is in the background.
- Notification behavior after device reboot.
- Notification tap behavior.
- Opening the exact related task from a notification.
- Preventing duplicate or missing reminders.

Also improve:

- Empty states.
- Search experience.
- Arabic RTL layout.
- English LTR layout.
- Mobile and tablet layouts.
- Loading and error states.
- General performance.

Acceptance criteria

Test reminders on the actual Android device, not only in browser simulation.

Verify notification timing and navigation behavior.

---

Milestone 5 — Release Hardening

Priority: Critical before daily-use release

Storage reliability

- Investigate "storage persistence granted: false".
- Review localStorage and IndexedDB protection.
- Test corrupted and missing data scenarios.
- Test backup restoration.
- Review migration safety.
- Consider SQLite migration only as a separate, carefully tested architectural phase.

Build reliability

- Add a dependency lockfile.
- Use reproducible dependency installation.
- Keep GitHub Actions builds stable.
- Verify APK versioning.
- Verify update and installation behavior.
- Preserve Android signing continuity.

Final quality assurance

- Run automated tests.
- Build the Android APK.
- Install the APK on the target device.
- Test existing data preservation.
- Test tasks.
- Test subjects.
- Test notes.
- Test reminders.
- Test backup export/import.
- Test full application close/reopen behavior.

A milestone is not complete merely because code was committed or an APK was built. The relevant tests must pass.

---

5. Recommended Development Order

To reach a useful daily version quickly:

1. Protect the current data model.
2. Implement independent task-to-subject association.
3. Implement the notepad MVP.
4. Add subject workspace integration.
5. Test persistence and backup/restore.
6. Improve notifications.
7. Complete release hardening.

Avoid unnecessary redesign of features that already work.

Prioritize a working feature over adding many unfinished options.

---

6. Global Development Rules

These rules apply to every future change.

1. Never delete user data to solve a development issue.
2. Never clear application storage without explicit user approval.
3. Never remove backups without explicit user approval.
4. Preserve backward compatibility wherever possible.
5. Keep the existing lecture-tracking behavior intact.
6. Do not duplicate the subject catalogue.
7. Test every data-model migration.
8. Sanitize rich-text content.
9. Test on the actual Android device.
10. Do not declare a bug fixed without evidence.
11. Keep changes focused and independently testable.
12. Record important technical decisions in the repository.

---

7. Definition of Project Success

ENJAZI will be considered ready for dependable daily use when:

- Tasks can be managed and linked to subjects.
- Independent rich-text note pages can be created and linked to subjects.
- Each subject provides a useful overview of its tasks and notes.
- Creation and modification timestamps work correctly.
- Data survives application restarts.
- Backup export and import work reliably.
- Notifications behave correctly on Android.
- Arabic and English interfaces work properly.
- Existing data remains safe during application updates.
- Automated tests and actual-device tests pass.

Final product goal: One dependable application where the user can organize university subjects, tasks, lecture notes, progress, and reminders in one place.
