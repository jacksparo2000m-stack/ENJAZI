
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
        JSONArray notifications =
            call.getData().optJSONArray("notifications");

        if (notifications == null) {
            call.reject(
                "Missing notifications array; refusing to clear saved notices"
            );
            return;
        }

        if (!PersistentTaskNotifications.sync(
            getContext(),
            notifications
        )) {
            call.reject(
                "Could not save persistent task notifications"
            );
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void syncPriorityOne(PluginCall call) {
        JSONArray tasks =
            call.getData().optJSONArray("tasks");

        if (tasks == null) {
            call.reject(
                "Missing priority one tasks array; refusing to clear saved tasks"
            );
            return;
        }

        if (!PriorityOneTaskScheduler.sync(getContext(), tasks)) {
            call.reject(
                "Could not schedule all priority one tasks"
            );
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        JSONArray ids = call.getData().optJSONArray("ids");

        if (ids == null) {
            call.reject("Missing notification IDs");
            return;
        }

        if (!PersistentTaskNotifications.cancel(
            getContext(),
            ids
        )) {
            call.reject(
                "Could not update persistent task notification storage"
            );
            return;
        }

        call.resolve();
    }
}
