package com.traveltoblog.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private volatile String pendingShareUrl;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoExifPlugin.class);
        super.onCreate(savedInstanceState);
        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        flushPendingShareUrl();
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }

        List<Uri> uris = extractShareUris(intent);
        if (uris.isEmpty()) {
            return;
        }

        final ShareIntentHandler handler = new ShareIntentHandler(this);
        new Thread(() -> {
            try {
                pendingShareUrl = handler.uploadAndGetRedirectUrl(uris);
            } catch (Exception e) {
                pendingShareUrl = handler.getServerUrl() + "/share/receive?error=invalid";
            }
            runOnUiThread(this::flushPendingShareUrl);
        })
            .start();
    }

    private List<Uri> extractShareUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        String action = intent.getAction();

        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                uris.add(uri);
            }
            return uris;
        }

        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (shared != null) {
                uris.addAll(shared);
            }
        }

        return uris;
    }

    private void flushPendingShareUrl() {
        String url = pendingShareUrl;
        if (url == null || url.isEmpty()) {
            return;
        }

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        pendingShareUrl = null;
        bridge.getWebView().loadUrl(url);
    }
}
