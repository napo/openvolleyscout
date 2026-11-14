# Tutorial screenshots

`capture.mjs` takes the screenshots used by the two user tutorials
(`docs/tutorial-tactical-reports*.md`, `docs/tutorial-video-sync*.md`), once
per language, by driving the real web app with the two sample matches in the
repository:

- `docs/melodicspikers_hollywoodblockers.dvw` for the tactical report;
- `stuttgart-schwrein.dvw` and its public YouTube video for the video part.

It runs in its own browser profile, so it never touches your archive.

## Run

```
npm run build
npx vite preview --port 5180 --strictPort --host 127.0.0.1   # leave it running
node tools/docs-screenshots/capture.mjs it      # then: en
```

The screenshots land in `tmp/docs-screenshots/<language>/` (`OUT_DIR` changes
the folder). A second argument limits the run: `report`, `share` or `video`.
The video part needs an Internet connection, to play the YouTube video.

The pages are requested at the public address of the web app and answered by
the local preview, so shared links and QR codes in the pictures show the real
address. After a domain move set `OVS_DOCS_BASE` (or change the default in
`lib.mjs`) and build with the matching `OVS_WEB_BASE`. Other variables:
`OVS_DOCS_LOCAL` (local preview address), `OVS_DOCS_CHROME` (browser
executable), `OVS_DOCS_PROFILES` (where the browser profiles are kept; delete
them to start from an empty archive).

## Publish

The tutorials use reduced copies in `docs/images/tutorials/<language>/`:
1280 px wide, 128 colours. For each picture:

```
convert shot.png -resize '1280x>' -strip -colors 128 PNG8:docs/images/tutorials/it/shot.png
```

Two pictures are composed by hand: `tr-09-preview.png` is the first three
`tr-09-preview-N.png` side by side, and `vs-08-share.png` is the right-hand
44% of the capture, 640 px wide.
