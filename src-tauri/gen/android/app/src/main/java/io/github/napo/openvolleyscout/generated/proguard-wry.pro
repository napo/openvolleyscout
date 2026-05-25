# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class io.github.napo.openvolleyscout.* {
  native <methods>;
}

-keep class io.github.napo.openvolleyscout.WryActivity {
  public <init>(...);

  void setWebView(io.github.napo.openvolleyscout.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class io.github.napo.openvolleyscout.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class io.github.napo.openvolleyscout.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class io.github.napo.openvolleyscout.RustWebChromeClient,io.github.napo.openvolleyscout.RustWebViewClient {
  public <init>(...);
}
