package com.shmirka.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** What the web app (client/src/native/native.ts) asks the Android shell for. */
@CapacitorPlugin(name = "ShmirkaNative")
public class ShmirkaNativePlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("version", p.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            ret.put("version", "?");
            ret.put("versionCode", 0);
        }
        // Built with google-services.json (Firebase) → push notifications can work.
        ret.put("firebase", getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName()) != 0);
        call.resolve(ret);
    }

    /** Keep the call alive with the screen off: a foreground service with an ongoing notification. */
    @PluginMethod
    public void startCall(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            // Android 14+ refuses a microphone service without the permission; the page asks for it
            // when it opens the mic, so this only happens in a call that never got the mic.
            call.resolve();
            return;
        }
        try {
            CallService.start(getContext(), call.getString("title", "ШмиркаТа"), call.getString("text", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject("could not start the call service", e);
        }
    }

    @PluginMethod
    public void stopCall(PluginCall call) {
        CallService.stop(getContext());
        call.resolve();
    }

    /** Open a link in the phone's browser (Google sign-in refuses to run inside the app). */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("bad url");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
