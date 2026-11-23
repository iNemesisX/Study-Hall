package com.studyhall.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens Android's print screen for the current page. "Save as PDF" is one of the
 * printers it offers, which is how the tablet app exports a page as a PDF.
 * Called from web/bridge.js as StudyHallPrint.print({ name }).
 */
@CapacitorPlugin(name = "StudyHallPrint")
public class PrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Study Hall");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
                printManager.print(name, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Printing isn't available on this device: " + e.getMessage());
            }
        });
    }
}
