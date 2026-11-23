
package com.jacksparo.enjazi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Independent persistent notification system for ENJAZI Deadlines.
 * Does not modify or share storage with task notifications.
 */
final class DeadlineNotifications {

    private static final String PREFS =
        "enjazi_deadline_notifications";

    private static final String KEY =
        "active_deadlines";

    private static final String CHANNEL =
        "enjazi_deadlines_v1";

    private DeadlineNotifications() {}

    static boolean sync(Context context, JSONArray incoming) {

        if (incoming == null) return false;

        JSONArray safe = new JSONArray();
        Set<String> deadlineIds = new HashSet<>();
        Set<Integer> notificationIds = new HashSet<>();

        // Validate the entire incoming collection first.
        for (int i = 0; i < incoming.length(); i++) {

            JSONObject item = incoming.optJSONObject(i);

            if (item == null) return false;

            Object rawDeadlineId = item.opt("deadlineId");
            Object rawNotificationId = item.opt("notificationId");
            Object rawTitle = item.opt("title");
            Object rawDueAt = item.opt("dueAt");

            if (!(rawDeadlineId instanceof String)
                || !(rawNotificationId instanceof Number)
                || !(rawTitle instanceof String)
                || !(rawDueAt instanceof Number)) {
                return false;
            }

            String deadlineId =
                ((String) rawDeadlineId).trim();

            String title =
                ((String) rawTitle).trim();

            long rawId =
                ((Number) rawNotificationId).longValue();

            long dueAt =
                ((Number) rawDueAt).longValue();

            if (deadlineId.isEmpty()
                || title.isEmpty()
                || rawId <= 0
                || rawId > Integer.MAX_VALUE
                || dueAt <= 0) {
                return false;
            }

            int notificationId = (int) rawId;

            if (!deadlineIds.add(deadlineId)
                || !notificationIds.add(notificationId)) {
                return false;
            }

            JSONObject normalized = new JSONObject();

            try {
                normalized.put("deadlineId", deadlineId);
                normalized.put("notificationId", notificationId);
                normalized.put("title", title);
                normalized.put("body", item.optString("body", ""));
                normalized.put("dueAt", dueAt);

                safe.put(normalized);

            } catch (JSONException e) {
                return false;
            }
        }

        SharedPreferences prefs =
            context.getSharedPreferences(
                PREFS,
                Context.MODE_PRIVATE
            );

        JSONArray previous;

        try {
            previous = new JSONArray(
                prefs.getString(KEY, "[]")
            );
        } catch (JSONException e) {
            // Preserve unreadable saved state.
            return false;
        }

        // Save the new desired state before changing notifications.
        if (!prefs.edit()
            .putString(KEY, safe.toString())
            .commit()) {
            return false;
        }

        ensureChannel(context);

        NotificationManagerCompat manager =
            NotificationManagerCompat.from(context);

        // Remove notifications that are no longer active.
        for (int i = 0; i < previous.length(); i++) {

            JSONObject old = previous.optJSONObject(i);

            if (old == null) continue;

            int oldId = old.optInt("notificationId", -1);

            if (oldId > 0 && !notificationIds.contains(oldId)) {
                manager.cancel(oldId);
            }
        }

        // Display or update all active deadlines.
        if (manager.areNotificationsEnabled()) {

            for (int i = 0; i < safe.length(); i++) {

                JSONObject item = safe.optJSONObject(i);

                if (item == null) continue;

                show(
                    context,
                    item.optString("deadlineId"),
                    item.optInt("notificationId"),
                    item.optString("title"),
                    item.optString("body"),
                    item.optLong("dueAt", -1)
                );
            }
        }

        return true;
    }

    static void restore(Context context) {

        SharedPreferences prefs =
            context.getSharedPreferences(
                PREFS,
                Context.MODE_PRIVATE
            );

        JSONArray saved;

        try {
            saved = new JSONArray(
                prefs.getString(KEY, "[]")
            );
        } catch (JSONException e) {
            return;
        }

        if (!NotificationManagerCompat.from(context)
            .areNotificationsEnabled()) {
            return;
        }

        ensureChannel(context);

        for (int i = 0; i < saved.length(); i++) {

            JSONObject item = saved.optJSONObject(i);

            if (item == null) continue;

            show(
                context,
                item.optString("deadlineId"),
                item.optInt("notificationId"),
                item.optString("title"),
                item.optString("body"),
                item.optLong("dueAt", -1)
            );
        }
    }

    private static void ensureChannel(Context context) {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            context.getSystemService(NotificationManager.class);

        if (manager == null
            || manager.getNotificationChannel(CHANNEL) != null) {
            return;
        }

        NotificationChannel channel =
            new NotificationChannel(
                CHANNEL,
                "إنجازي — المواعيد النهائية",
                NotificationManager.IMPORTANCE_LOW
            );

        channel.setDescription(
            "إشعارات ثابتة للمواعيد النهائية مع عد تنازلي"
        );

        channel.setShowBadge(true);

        manager.createNotificationChannel(channel);
    }

    private static void show(
        Context context,
        String deadlineId,
        int notificationId,
        String title,
        String body,
        long dueAt
    ) {

        if (deadlineId == null
            || deadlineId.trim().isEmpty()
            || notificationId <= 0
            || dueAt <= 0
            || title == null
            || title.trim().isEmpty()) {
            return;
        }

        Intent launch =
            context.getPackageManager()
                .getLaunchIntentForPackage(
                    context.getPackageName()
                );

        PendingIntent content = null;

        if (launch != null) {

            launch.addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );

            launch.putExtra(
                "enjaziDeadlineId",
                deadlineId
            );

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            content = PendingIntent.getActivity(
                context,
                notificationId,
                launch,
                flags
            );
        }

        ApplicationInfo app =
            context.getApplicationInfo();

        int icon = app.icon != 0
            ? app.icon
            : android.R.drawable.ic_dialog_info;

        long now = System.currentTimeMillis();
        boolean future = dueAt > now;

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(
                    new NotificationCompat.BigTextStyle()
                        .bigText(body)
                )
                .setWhen(dueAt)
                .setShowWhen(true)
                .setUsesChronometer(future)
                .setChronometerCountDown(true)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

        if (content != null) {
            builder.setContentIntent(content);
        }

        try {
            NotificationManagerCompat.from(context)
                .notify(notificationId, builder.build());

        } catch (SecurityException ignored) {}
    }
}
