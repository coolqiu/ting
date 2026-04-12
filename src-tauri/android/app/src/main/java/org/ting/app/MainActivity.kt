package org.ting.app

import android.os.Bundle
import com.tauri_bindings.TauriActivity
import android.webkit.WebView

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Enable WebView debugging for Chrome DevTools
        WebView.setWebContentsDebuggingEnabled(true)
    }
}
