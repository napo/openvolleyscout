// SPDX-License-Identifier: AGPL-3.0-or-later

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.napo.openvolleyscout.googleauth"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // Authorization API (Identity.getAuthorizationClient) and GoogleAuthUtil.clearToken
    implementation("com.google.android.gms:play-services-auth:21.4.0")
    implementation(project(":tauri-android"))
}
