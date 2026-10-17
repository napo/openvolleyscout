# Social preview

`public/social-preview.png` (1280 × 640) is the image shown when the site or
the repository is shared. It is rendered from `social-preview.html` at
1280 × 640, with these files copied next to it:

- `og-logo.png`: `public/pwa-512x512.png` (the logo's ball);
- `og-app.png`: a 2× screenshot of live scouting (Court input, horizontal
  court, English), cropped to the court and the toolbar;
- `Ubuntu-Regular.ttf` and `Ubuntu-Bold.ttf` from `src/assets/fonts/ubuntu`.

Then:

```
node tools/social-preview/render.mjs /abs/path/social-preview.html public/social-preview.png
```

(`CHROME=/path/to/chrome` to use a specific browser.)

On GitHub the same image is set by hand in *Settings → General → Social preview*.
