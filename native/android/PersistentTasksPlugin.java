package com.jacksparo.enjazi;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name = "PersistentTasks")
public class PersistentTasksPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        JSONArray notifications = call.getData().optJSONArray("notifications");
        if (notifications == null) notifications = new JSONArray();
        if (!PersistentTaskNotifications.sync(getContext(), notifications)) {
            call.reject("Could not save persistent task notifications");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        JSONArray ids = call.getData().optJSONArray("ids");
        if (ids == null) ids = new JSONArray();
        if (!PersistentTaskNotifications.cancel(getContext(), ids)) {
            call.reject("Could not update persistent task notification storage");
            return;
        }
        call.resolve();
    }
}
