
package com.jacksparo.enjazi;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class PriorityOneTaskScheduler {

    private static final String PREFS =
        "enjazi_priority_one_tasks";

    private static final String KEY =
        "scheduled_tasks";

    private PriorityOneTaskScheduler() {}

    
static boolean sync(Context context, JSONArray incoming) {
    if (incoming == null) return false;

    JSONArray safe = new JSONArray();
    Map<String, JSONObject> wanted = new HashMap<>();
    Map<Integer, String> notificationOwners = new HashMap<>();

    // Validate the entire incoming list before touching saved schedules.
    for (int i = 0; i < incoming.length(); i++) {
        JSONObject item = incoming.optJSONObject(i);
        if (item == null) return false;

        Object rawTaskId = item.opt("taskId");
        Object rawTitle = item.opt("title");
        Object rawNotificationId = item.opt("notificationId");
        Object rawDueAt = item.opt("dueAt");

        if (!(rawTaskId instanceof String)
            || !(rawTitle instanceof String)
            || !(rawNotificationId instanceof Number)
            || !(rawDueAt instanceof Number)) {
            return false;
        }

        String taskId = ((String) rawTaskId).trim();
        String title = ((String) rawTitle).trim();

        long notificationIdValue =
            ((Number) rawNotificationId).longValue();

        long dueAt = ((Number) rawDueAt).longValue();

        if (taskId.isEmpty() || title.isEmpty()
            || notificationIdValue <= 0
            || notificationIdValue > Integer.MAX_VALUE
            || dueAt <= 0) {
            return false;
        }

        int notificationId = (int) notificationIdValue;

        // Reject duplicate task IDs and notification IDs.
        if (wanted.containsKey(taskId)
            || notificationOwners.containsKey(notificationId)) {
            return false;
        }

        JSONObject normalized = new JSONObject();

        try {
            normalized.put("taskId", taskId);
            normalized.put("notificationId", notificationId);
            normalized.put("title", title);
            normalized.put("body", item.optString("body", ""));
            normalized.put("dueAt", dueAt);
        } catch (JSONException e) {
            return false;
        }

        safe.put(normalized);
        wanted.put(taskId, normalized);
        notificationOwners.put(notificationId, taskId);
    }

    SharedPreferences prefs =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

    JSONArray previous;

    try {
        previous = new JSONArray(prefs.getString(KEY, "[]"));
    } catch (JSONException e) {
        previous = new JSONArray();
    }

    // Save the desired state before changing alarms or notifications.
    if (!prefs.edit().putString(KEY, safe.toString()).commit()) {
        return false;
    }

    boolean success = true;

    // Remove alarms and notifications that are no longer valid.
    for (int i = 0; i < previous.length(); i++) {
        JSONObject old = previous.optJSONObject(i);
        if (old == null) continue;

        String taskId = old.optString("taskId", "");
        JSONObject current = wanted.get(taskId);

        boolean removed = current == null;
        boolean changed = !removed
            && current.optLong("dueAt", -1)
                != old.optLong("dueAt", -1);

        if (removed || changed) {
            cancelAlarm(
                context,
                taskId,
                old.optInt("notificationId", -1)
            );

            NotificationManagerCompat.from(context).cancel(
                old.optInt("notificationId", -1)
            );
        }
    }

    // Schedule future tasks or display tasks already due.
    for (int i = 0; i < safe.length(); i++) {
        JSONObject item = safe.optJSONObject(i);
        if (item == null) continue;

        long dueAt = item.optLong("dueAt", -1);

        if (dueAt <= System.currentTimeMillis()) {
            cancelAlarm(
                context,
                item.optString("taskId"),
                item.optInt("notificationId")
            );

            PersistentTaskNotifications.show(
                context,
                item.optInt("notificationId"),
                item.optString("title"),
                item.optString("body")
            );
        } else if (!schedule(context, item)) {
            success = false;
        }
    }

        for (int i = 0; i < previous.length(); i++) {
            JSONObject old = previous.optJSONObject(i);
            if (old == null) continue;

            String taskId = old.optString("taskId", "");
            JSONObject current = wanted.get(taskId);

            boolean removed = current == null;
            boolean changed = !removed
                && current.optLong("dueAt", -1)
                    != old.optLong("dueAt", -1);

            if (removed || changed) {
                cancelAlarm(
                    context,
                    taskId,
                    old.optInt("notificationId", -1)
                );

                NotificationManagerCompat.from(context).cancel(
                    old.optInt("notificationId", -1)
                );
            }
        }

        // Schedule future tasks or display tasks already due.
        for (int i = 0; i < safe.length(); i++) {
            JSONObject item = safe.optJSONObject(i);
            if (item == null) continue;

            long dueAt = item.optLong("dueAt", -1);

            if (dueAt <= System.currentTimeMillis()) {
                cancelAlarm(
                    context,
                    item.optString("taskId"),
                    item.optInt("notificationId")
                );

                PersistentTaskNotifications.show(
                    context,
                    item.optInt("notificationId"),
                    item.optString("title"),
                    item.optString("body")
                );
            } else if (!schedule(context, item)) {
                success = false;
            }
        }

        return success;
    }

    static void restore(Context context) {
        SharedPreferences prefs =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        JSONArray saved;

        try {
            saved = new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return;
        }

        long now = System.currentTimeMillis();

        for (int i = 0; i < saved.length(); i++) {
            JSONObject item = saved.optJSONObject(i);
            if (item == null) continue;

            long dueAt = item.optLong("dueAt", -1);

            if (dueAt <= 0) continue;

            if (dueAt <= now) {
                PersistentTaskNotifications.show(
                    context,
                    item.optInt("notificationId"),
                    item.optString("title"),
                    item.optString("body")
                );
            } else {
                schedule(context, item);
            }
        }
    }

    static void onAlarm(Context context, Intent intent) {
        if (intent == null) return;

        String taskId = intent.getStringExtra("taskId");
        int notificationId =
            intent.getIntExtra("notificationId", -1);
        long dueAt = intent.getLongExtra("dueAt", -1);

        if (taskId == null || taskId.trim().isEmpty()
            || notificationId <= 0 || dueAt <= 0) {
            return;
        }

        SharedPreferences prefs =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        JSONArray saved;

        try {
            saved = new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return;
        }

        JSONObject current = null;

        for (int i = 0; i < saved.length(); i++) {
            JSONObject item = saved.optJSONObject(i);

            if (item != null
                && taskId.equals(item.optString("taskId"))) {
                current = item;
                break;
            }
        }

        // Ignore alarms belonging to deleted or rescheduled tasks.
        if (current == null
            || current.optInt("notificationId") != notificationId
            || current.optLong("dueAt", -1) != dueAt) {
            return;
        }

        if (dueAt > System.currentTimeMillis()) {
            schedule(context, current);
            return;
        }

        PersistentTaskNotifications.show(
            context,
            notificationId,
            current.optString("title"),
            current.optString("body")
        );
    }

    private static boolean schedule(
        Context context,
        JSONObject item
    ) {
        AlarmManager manager =
            (AlarmManager) context.getSystemService(
                Context.ALARM_SERVICE
            );

        if (manager == null) return false;

        String taskId = item.optString("taskId");
        int notificationId = item.optInt("notificationId");
        long dueAt = item.optLong("dueAt", -1);

        if (taskId.isEmpty() || notificationId <= 0 || dueAt <= 0) {
            return false;
        }

        PendingIntent pending = alarmIntent(
            context,
            taskId,
            notificationId,
            item.optString("title"),
            item.optString("body"),
            dueAt
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && manager.canScheduleExactAlarms()) {

                manager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    dueAt,
                    pending
                );

            } else if (Build.VERSION.SDK_INT
                >= Build.VERSION_CODES.M) {

                manager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    dueAt,
                    pending
                );

            } else {
                manager.set(
                    AlarmManager.RTC_WAKEUP,
                    dueAt,
                    pending
                );
            }

            return true;

        } catch (SecurityException e) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    manager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        dueAt,
                        pending
                    );
                } else {
                    manager.set(
                        AlarmManager.RTC_WAKEUP,
                        dueAt,
                        pending
                    );
                }

                return true;

            } catch (RuntimeException fallbackError) {
                return false;
            }

        } catch (RuntimeException e) {
            return false;
        }
    }

    private static void cancelAlarm(
        Context context,
        String taskId,
        int notificationId
    ) {
        if (taskId == null || taskId.isEmpty()
            || notificationId <= 0) {
            return;
        }

        AlarmManager manager =
            (AlarmManager) context.getSystemService(
                Context.ALARM_SERVICE
            );

        if (manager == null) return;

        PendingIntent pending = alarmIntent(
            context,
            taskId,
            notificationId,
            "",
            "",
            1
        );

        manager.cancel(pending);
        pending.cancel();
    }

    private static PendingIntent alarmIntent(
        Context context,
        String taskId,
        int notificationId,
        String title,
        String body,
        long dueAt
    ) {
        Intent intent = new Intent(
            context,
            PriorityOneTaskReceiver.class
        );

        intent.setAction(
            PriorityOneTaskReceiver.ACTION_TASK_DUE
        );

        intent.setData(
            Uri.parse("enjazi://priority-one/" + Uri.encode(taskId))
        );

        intent.putExtra("taskId", taskId);
        intent.putExtra("notificationId", notificationId);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("dueAt", dueAt);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getBroadcast(
            context,
            notificationId,
            intent,
            flags
        );
    }
}
