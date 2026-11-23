
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
    public void syncDeadlines(PluginCall call) {
        JSONArray deadlines =
            call.getData().optJSONArray("deadlines");

        if (deadlines == null) {
            call.reject(
                "Missing deadlines array; refusing to clear saved deadlines"
            );
            return;
        }

        if (!DeadlineNotifications.sync(
            getContext(),
            deadlines
        )) {
            call.reject(
                "Could not save persistent deadline notifications"
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
        @PluginMethod
    public void consumePendingTask(PluginCall call) {
        android.content.Intent intent =
            getActivity().getIntent();

        String taskId = intent.getStringExtra("enjaziTaskId");

        if (taskId != null) {
            intent.removeExtra("enjaziTaskId");
            getActivity().setIntent(intent);
        }

        com.getcapacitor.JSObject result =
            new com.getcapacitor.JSObject();

        if (taskId != null && !taskId.trim().isEmpty()) {
            result.put("taskId", taskId);
        }

        call.resolve(result);
    }
        @PluginMethod
    public void consumePendingDeadline(PluginCall call) {
        android.content.Intent intent =
            getActivity().getIntent();

        String deadlineId =
            intent.getStringExtra("enjaziDeadlineId");

        if (deadlineId != null) {
            intent.removeExtra("enjaziDeadlineId");
            getActivity().setIntent(intent);
        }

        com.getcapacitor.JSObject result =
            new com.getcapacitor.JSObject();

        if (deadlineId != null && !deadlineId.trim().isEmpty()) {
            result.put("deadlineId", deadlineId);
        }

        call.resolve(result);
    }
}
