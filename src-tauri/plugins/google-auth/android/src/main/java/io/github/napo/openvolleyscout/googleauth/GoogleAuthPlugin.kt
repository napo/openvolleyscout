// SPDX-License-Identifier: AGPL-3.0-or-later

package io.github.napo.openvolleyscout.googleauth

import android.app.Activity
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope

@InvokeArg
class AuthorizeArgs {
    lateinit var scope: String
    /** False: never show Google's consent, answer without a token instead. */
    var interactive: Boolean = false
}

@InvokeArg
class ClearArgs {
    lateinit var token: String
}

/**
 * Google sign-in on Android with the Authorization API of Google Play services:
 * the account and the consent are asked once, then a valid access token comes
 * back without showing anything. Google identifies the app by its package and
 * signing certificate (the "Android" OAuth client of the project).
 */
@TauriPlugin
class GoogleAuthPlugin(private val activity: Activity) : Plugin(activity) {

    private fun resolveToken(invoke: Invoke, token: String?) {
        val result = JSObject()
        if (token != null) result.put("accessToken", token)
        invoke.resolve(result)
    }

    @Command
    fun authorize(invoke: Invoke) {
        val args = invoke.parseArgs(AuthorizeArgs::class.java)
        val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(args.scope))).build()
        Identity.getAuthorizationClient(activity).authorize(request)
            .addOnSuccessListener { result: AuthorizationResult ->
                val pending = result.pendingIntent
                when {
                    !result.hasResolution() -> resolveToken(invoke, result.accessToken)
                    args.interactive && pending != null ->
                        startIntentSenderForResult(invoke, IntentSenderRequest.Builder(pending.intentSender).build(), "consentDone")
                    else -> resolveToken(invoke, null)
                }
            }
            .addOnFailureListener { e -> invoke.reject(e.message ?: "authorization failed") }
    }

    @ActivityCallback
    fun consentDone(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) return resolveToken(invoke, null)
        try {
            resolveToken(invoke, Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.data).accessToken)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "authorization failed")
        }
    }

    /** Drops a token Drive refused, so that the next authorize() gets a fresh one. */
    @Command
    fun clear(invoke: Invoke) {
        val args = invoke.parseArgs(ClearArgs::class.java)
        Thread {
            try {
                GoogleAuthUtil.clearToken(activity, args.token)
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "clear failed")
            }
        }.start()
    }
}
