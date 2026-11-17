package com.shmirka.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShmirkaNativePlugin.class);
        super.onCreate(savedInstanceState);
        WebSettings settings = getBridge().getWebView().getSettings();
        // Voice / music / notification sounds start without a tap first.
        settings.setMediaPlaybackRequiresUserGesture(false);
    }

    @Override
    public void onDestroy() {
        // The app was closed for real (swiped away): no call keeps going without it.
        CallService.stop(this);
        super.onDestroy();
    }
}
