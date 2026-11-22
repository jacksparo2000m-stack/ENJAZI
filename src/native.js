// Capacitor 8 native bridge for ENJAZI.
// PersistentTasks stores active priority-2/3 tasks natively and restores them
// after device reboot. The app's existing task model remains in localStorage.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPlugin } from '@capacitor/core';

const PersistentTasks = registerPlugin('PersistentTasks');
const TASKS_STORAGE_KEY = 'pt2';

function notificationId(value) {
  let hash = 7;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2000000000 + 1;
}

// Read the same saved task state used by index.html. This deliberately does
// not rely on the optional per-task pin checkbox: every active medium/high
// priority task is kept visible as requested.

async function syncPersistentTasksFromStorage() {
  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);

    // Missing storage is ambiguous. Never treat it as an empty task list.
    if (raw === null) return null;

    const state = JSON.parse(raw);

    if (!state || !Array.isArray(state.tasks) || !Array.isArray(state.groups)) {
      throw new Error('Invalid or incomplete saved task state');
    }

    const ar = state.lang !== 'en';

    // Existing priority 2/3 notifications — behavior unchanged.
    const notifications = state.tasks
      .filter(task => task && !task.x && Number(task.p) >= 2)
      .map(task => ({
        id: notificationId('p' + task.id),
        title: String(task.t || ''),
        body: (Number(task.p) > 2
          ? (ar ? 'مهمة مهمة جدًا' : 'Very important task')
          : (ar ? 'مهمة متوسطة' : 'Medium priority task'))
          + (task.d ? ' · ' + String(task.d) : '')
      }))
      .filter(item => item.title.trim());

    // Priority 1 tasks: schedule only tasks that have a due date.
const priorityOneTasks = state.tasks
  .filter(task =>
    task &&
    !task.x &&
    Number(task.p) === 1 &&
    task.d
  )
  .map(task => {
    const taskId = task.id == null ? '' : String(task.id).trim();
    const title = String(task.t || '').trim();

    const dueAt = new Date(
      String(task.d) + 'T' + String(task.tm || '23:59')
    ).getTime();

    if (
      !taskId ||
      !title ||
      !Number.isFinite(dueAt) ||
      dueAt <= 0
    ) {
      throw new Error('Invalid priority one task data; preserving existing schedules');
    }

    return {
      taskId,
      notificationId: notificationId('p1' + taskId),
      title,
      body: [
        String(task.n || '').trim(),
        task.d
          + (task.tm ? ' · ' + String(task.tm) : '')
      ].filter(Boolean).join('\n'),
      dueAt
    };
  });
    // Reconcile existing priority 2/3 notifications.
    await PersistentTasks.sync({ notifications });

    // Reconcile priority 1 scheduled tasks.
    await PersistentTasks.syncPriorityOne({
      tasks: priorityOneTasks
    });

    return new Set(notifications.map(item => item.id));

  } catch (error) {
    // If storage or native synchronization fails, do not clear saved notices.
    console.error('ENJAZI persistent task sync skipped:', error);
    return null;
  }
}

const originalGetPending = LocalNotifications.getPending.bind(LocalNotifications);
const originalRemoveDelivered = LocalNotifications.removeDeliveredNotifications.bind(LocalNotifications);

// sched() always asks for pending notifications before rebuilding reminders.
// Use that synchronization point to reconcile all high/medium task notices,
// including tasks whose optional legacy pin checkbox is off.
const NativeLocalNotifications = new Proxy(LocalNotifications, {
  get(target, property) {
    if (property === 'getPending') {
      return async (...args) => {
        const pending = await originalGetPending(...args);
        await syncPersistentTasksFromStorage();
        return pending;
      };
    }
    if (property === 'removeDeliveredNotifications') {
      return async options => {
        const activeIds = await syncPersistentTasksFromStorage();
        if (activeIds === null) return { notifications: [] };
        const requested = Array.isArray(options?.notifications) ? options.notifications : [];
        // The old scheduler removes delivered IDs from its legacy pin list.
        // Never let that remove a task that is still active and priority 2/3.
        const safeToRemove = requested.filter(item => !activeIds.has(Number(item?.id)));
        if (!safeToRemove.length) return { notifications: [] };
        return originalRemoveDelivered({ ...options, notifications: safeToRemove });
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});

window.NativePlugins = {
  Filesystem,
  Directory,
  Encoding,
  Share,
  LocalNotifications: NativeLocalNotifications
};
