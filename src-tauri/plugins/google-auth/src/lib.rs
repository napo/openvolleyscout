// SPDX-License-Identifier: AGPL-3.0-or-later

//! Registers the Kotlin plugin (android/) on Android; the web view calls its
//! commands directly ("plugin:google-auth|authorize"). Elsewhere it does nothing.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("google-auth")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("io.github.napo.openvolleyscout.googleauth", "GoogleAuthPlugin")?;
            Ok(())
        })
        .build()
}
