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

/** Stores and restores ENJAZI's persistent high/medium-priority task notices. */
final class PersistentTaskNotifications {
    private static final String PREFS = "enjazi_persistent_tasks";
    private static final String KEY = "active_notifications";
    private static final String CHANNEL = "enjazi_persistent_tasks_v1";

    private PersistentTaskNotifications() {}

    static boolean sync(Context context, JSONArray incoming) {
        ensureChannel(context);
        JSONArray safe = new JSONArray();
        Set<Integer> wanted = new HashSet<>();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject item = incoming.optJSONObject(i);
            if (item == null) continue;
            int id = item.optInt("id", -1);
            String title = item.optString("title", "").trim();
            String body = item.optString("body", "").trim();
            if (id <= 0 || title.isEmpty()) continue;
            JSONObject normalized = new JSONObject();
            try {
                normalized.put("id", id);
                normalized.put("title", title);
                normalized.put("body", body);
                safe.put(normalized);
                wanted.add(id);
            } catch (JSONException ignored) {}
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray previous;
        try { previous = new JSONArray(prefs.getString(KEY, "[]")); }
        catch (JSONException e) { previous = new JSONArray(); }

        // Commit the desired state before changing the notification shade.
        if (!prefs.edit().putString(KEY, safe.toString()).commit()) return false;
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        for (int i = 0; i < previous.length(); i++) {
            JSONObject old = previous.optJSONObject(i);
            int oldId = old == null ? -1 : old.optInt("id", -1);
            if (oldId > 0 && !wanted.contains(oldId)) manager.cancel(oldId);
        }
        if (manager.areNotificationsEnabled()) {
            for (int i = 0; i < safe.length(); i++) {
                JSONObject item = safe.optJSONObject(i);
                if (item != null) show(context, item.optInt("id"), item.optString("title"), item.optString("body"));
            }
        }
        return true;
    }

    static boolean cancel(Context context, JSONArray ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray previous;
        try { previous = new JSONArray(prefs.getString(KEY, "[]")); }
        catch (JSONException e) { previous = new JSONArray(); }
        Set<Integer> remove = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) {
            int id = ids.optInt(i, -1);
            if (id > 0) remove.add(id);
        }
        JSONArray kept = new JSONArray();
        for (int i = 0; i < previous.length(); i++) {
            JSONObject item = previous.optJSONObject(i);
            if (item == null) continue;
            int id = item.optInt("id", -1);
            if (remove.contains(id)) NotificationManagerCompat.from(context).cancel(id);
            else kept.put(item);
        }
        return prefs.edit().putString(KEY, kept.toString()).commit();
    }

    static void restore(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray saved;
        try { saved = new JSONArray(prefs.getString(KEY, "[]")); }
        catch (JSONException e) { saved = new JSONArray(); }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        ensureChannel(context);
        for (int i = 0; i < saved.length(); i++) {
            JSONObject item = saved.optJSONObject(i);
            if (item != null) show(context, item.optInt("id"), item.optString("title"), item.optString("body"));
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL, "إنجازي — المهام المهمة", NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("تذكيرات ثابتة للمهام المهمة جدًا والمتوسطة");
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    private static void show(Context context, int id, String title, String body) {
        if (id <= 0) return;
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent content = null;
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            content = PendingIntent.getActivity(context, id, launch, flags);
        }
        ApplicationInfo app = context.getApplicationInfo();
        int icon = app.icon != 0 ? app.icon : android.R.drawable.ic_dialog_info;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        if (content != null) builder.setContentIntent(content);
        try { NotificationManagerCompat.from(context).notify(id, builder.build()); }
        catch (SecurityException ignored) {}
    }
}
