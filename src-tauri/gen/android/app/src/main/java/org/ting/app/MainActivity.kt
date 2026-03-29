package org.ting.app

import android.os.Bundle
import android.view.ActionMode
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onActionModeStarted(mode: ActionMode?) {
    mode?.menu?.clear()
    super.onActionModeStarted(mode)
  }
}
