package io.github.napo.openvolleyscout

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    enterImmersiveMode()
  }

  // Android shows the bars again after dialogs, the keyboard or app switching:
  // hide them each time the app gets focus back.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) enterImmersiveMode()
  }

  /**
   * Full screen for scouting: status and navigation bars hidden. A swipe from
   * the top or bottom edge shows them for a few seconds (to go home, switch
   * app or read notifications), then they hide again.
   */
  private fun enterImmersiveMode() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }
}
