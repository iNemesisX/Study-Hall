package com.studyhall.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrintPlugin.class); // Print / Save as PDF (see PrintPlugin.java)
        super.onCreate(savedInstanceState);
    }
}
