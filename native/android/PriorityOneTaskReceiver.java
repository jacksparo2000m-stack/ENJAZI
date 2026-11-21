
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

        PriorityOneTaskScheduler.onAlarm(context, intent);
    }
}
