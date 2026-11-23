# Social previews

Images shown when a link is shared (1280 × 640), rendered from HTML:

- `social-preview.html` -> `public/social-preview.png`: the site, the repository
  and tutorial links without their own image;
- `social-preview-stats.html` -> `public/social-preview-stats.png`: shared
  statistics links (`stats-viewer/`).

Both use the brand colours of the logo (`#0b3d91`, `#2ec4e6`) and show the
address `scout.volleyserve.it`. Render them with:

```
tools/social-preview/build.sh
```

(`CHROME=/path/to/chrome` to use a specific browser.) The script copies next
to the pages the Ubuntu fonts, the logo (`og-cover.png`), the app icon
(`og-icon.png`), the live-scouting tutorial screenshot `court-05.png`
(`og-app.png`) and `og-stats.png` (the Player performance card of the demo
match, kept in this folder).

On GitHub the site image is set by hand in *Settings → General → Social preview*.
