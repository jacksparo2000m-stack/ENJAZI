package com.jacksparo.enjazi;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PriorityOneTaskReceiver extends BroadcastReceiver {

    public static final String ACTION_TASK_DUE =
        "com.jacksparo.enjazi.ACTION_TASK_DUE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        if (!ACTION_TASK_DUE.equals(intent.getAction())) return;

        int id = intent.getIntExtra("notificationId", -1);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");

        if (id <= 0 || title == null || title.trim().isEmpty()) return;

        PersistentTaskNotifications.show(
            context,
            id,
            title,
            body == null ? "" : body
        );
    }
}
