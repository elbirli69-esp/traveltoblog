package com.traveltoblog.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoExifPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
