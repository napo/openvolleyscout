# Personal Cloud Synchronisation (Google Drive, Dropbox, OneDrive)

OpenVolleyScout can synchronise a user's local archive (matches, teams, rosters, competitions, opponent reports, and reception/defense systems) across devices using their own Google Drive, Dropbox, or OneDrive account. No intermediary server is used: tokens stay on the device and data travels directly between the device and the chosen cloud service.

Videos (`video-sync.ts`, `video-upload.ts`, `CloudSyncVideoSettings.tsx`): the archive never contains video files, only the video reference (YouTube link, URL or local file name/path), sync points, starred actions and notes. A device may also send the local match videos to the same cloud, by choice, in Settings > Cloud synchronisation > This device > Videos. The choice and the selected matches are kept per device (localStorage): on by default on computers, off on phones and tablets, which never upload. The panel reads each file size (desktop: `video_file_size` Tauri command on the stored path; browser: the remembered File System Access handle, or a file chosen again), adds up the selected videos not yet in the cloud and compares them with the free space (`spaceUsage()`: Google Drive `about.storageQuota`; Dropbox and OneDrive when their scopes allow it, otherwise "not available"). Uploads are resumable and sent one video at a time in 10 MiB chunks (Google Drive resumable session, Dropbox upload session, OneDrive upload session); the session and confirmed offset are kept per match in localStorage so an interrupted upload resumes. Desktop reads chunks with the `read_video_chunk` Tauri command (video extensions only). Cloud files are named `<matchId>__<file name>` (Drive: OpenVolleyScout folder, `appProperties.openvolleyscout=video`; Dropbox and OneDrive: `videos/` in the app folder), so any device finds a match video by listing the cloud, with nothing stored in the match itself. When the local file is missing and the cloud has the match video, Video analysis streams it at once (nothing is downloaded automatically) and asks the service for a fresh link when one expires, keeping the position; "Download to this device" (`video-download.ts`) streams the file to disk (desktop: save dialog plus appended writes, inside the `fs:scope` folders; Chrome/Edge: save picker; other browsers: the browser download, then relink) and relinks it to the match. Stream links (Dropbox temporary link, 4 h; OneDrive pre-authorised download URL, about 1 h; Drive `alt=media`, which accepts the access token only in an Authorization header that a video player cannot send: in the web app the service worker adds it (`public/ovs-stream-sw.js`, imported by the generated worker; the page registers the Drive URL and token with `video-stream-worker.ts` and plays a same-origin `ovs-stream/<id>` address, Range headers forwarded so seeking works; registrations kept in a small cache for 6 h so they survive the worker stopping; an expired token makes the player fail and the page registers a fresh one, keeping the position). The desktop app, and a browser page not yet controlled by the worker, can only download a Drive video). Clip export still needs the local file.

## Architecture

The implementation lives in `src/features/sync/cloud/` (modelled on `volleyreportxls`):

- **Archive format (`file.ts`)**: a standard `.ovs` backup zip (`OpenVolleyScout.ovs`) with an additional `deletions.json` tombstone map. Because it is a valid `.ovs` backup, the file can also be downloaded from the cloud and imported manually in Load Data.
- **3-way merge (`merge.ts`)**: each record is stamped by its `updatedAt` timestamp (or a content hash when no timestamp exists) and each local deletion leaves a dated tombstone kept for 400 days. If a record changes on one side only, that side wins; if a match changes on both devices since the last sync, the newer edit wins and the older version is preserved as a copy with a new id.
- **Local storage (`archive-adapter.ts`)**: deletions (`syncDeletions`), sync state (`syncMeta`) and reception/defense systems (`systemBlocks`) live in IndexedDB next to the data (database version 8 moves them from localStorage). A deletion and its tombstone are written in the same transaction. The snapshot is read in one transaction, and a round's changes are written in one transaction that skips any record whose stamp changed on this device after the snapshot: a change made during a round is never overwritten and goes out with the next round. A match save is always later than the version it replaces, even when the device clock is behind.
- **One scout per match (`presence.ts`, `ScoutingLockGate.tsx`)**: the cloud file carries a `presence.json` entry with the scouting claims and the list of devices (name, operating system and version, app version, last sync). Opening a match on the scouting screen claims it; because the upload is conditional on the file version, the first device to write wins. Other devices see who scouts (device, since when, last action) and can follow the match read-only; nothing is saved there. They can take over, with a confirmation, once no action has been recorded for the minutes set in Settings (5 by default), or at once when the claim has not been renewed for 15 minutes. Going to the background sends the match at once; leaving the scouting screen sends it and drops the claim. Without a connection the claim cannot be checked: scouting is allowed and the merge keeps both versions as usual.
- **Concurrency (`engine.ts`)**: writes are checked against the remote revision (Google Drive `version`, Dropbox `rev`, OneDrive `eTag` / `If-Match`). If another device wrote first, the round repeats up to 3 times.
- **Triggers (`controller.ts`)**: runs on startup (when previously connected), 4 seconds after any local change, on returning to the app after more than 30 seconds, every 5 minutes while visible, and when the browser comes back online.
- **Mutual exclusion**: each device connects to one cloud service at a time; devices connected to different services do not synchronise with each other.

## OAuth Configuration (Build-time Environment Variables)

An empty client id hides that cloud provider on that platform. Set the values in `.env.local` (ignored by git) for local builds, or as repository variables/secrets in CI:

```bash
# Google Drive (scope: https://www.googleapis.com/auth/drive.file)
VITE_GOOGLE_WEB_CLIENT_ID=...
VITE_GOOGLE_DESKTOP_CLIENT_ID=...
VITE_GOOGLE_DESKTOP_CLIENT_SECRET=...
# Android: any non-empty value enables Google Drive; Google recognises the app by
# package (io.github.napo.openvolleyscout) and signing-certificate SHA-1.
VITE_GOOGLE_ANDROID_CLIENT_ID=...

# Dropbox (App folder, scopes: files.content.read files.content.write files.metadata.read)
VITE_DROPBOX_APP_KEY=...

# OneDrive (personal Microsoft accounts, scopes: Files.ReadWrite.AppFolder offline_access)
VITE_ONEDRIVE_CLIENT_ID=...
```

### Provider Setup Checklist

1. **Google Drive** (Google Cloud Console):
   - Enable **Google Drive API** and add the `https://www.googleapis.com/auth/drive.file` scope.
   - **Web client**: add your web origin (and `http://localhost:5173` for dev) to Authorized JavaScript origins. No redirect URI is needed (Google Identity Services token model).
   - **Desktop client**: type Desktop app (loopback `http://127.0.0.1:<port>` handled by `src-tauri/src/oauth.rs`). Put the client secret in `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` (Google treats desktop client secrets as public, but keep it out of git to satisfy secret scanners).
2. **Dropbox** (Dropbox App Console):
   - Create an App folder app with public clients enabled and permissions `files.content.read`, `files.content.write`, `files.metadata.read`.
   - Register redirect URIs: `<web-app-origin>/oauth-callback.html` (web popup via `public/oauth-callback.html`) and `http://localhost:53682/` (desktop fixed port).
3. **OneDrive** (Microsoft Entra):
   - Register an app for personal Microsoft accounts only (`consumers`).
   - Add SPA redirect URIs `<web-app-origin>/oauth-callback.html` and `http://localhost:5173/oauth-callback.html`.
   - Add Mobile and desktop redirect URI `http://localhost` (Microsoft ignores the port). Desktop token requests omit the `Origin` header via `tauri-plugin-http`'s `unsafe-headers` feature.

## Desktop Permissions (Tauri)

Installed desktop builds route cloud HTTP calls through `tauri-plugin-http`, scoped strictly to the required provider hosts in:
- `src-tauri/capabilities/google-drive.json`
- `src-tauri/capabilities/dropbox.json`
- `src-tauri/capabilities/onedrive.json`

## Android

Only Google Drive is offered on Android (Dropbox and OneDrive accept only https or localhost redirects). Sign-in uses the Authorization API of Google Play services through the Kotlin plugin in `src-tauri/plugins/google-auth` (`auth-android.ts`): account and consent are asked once, then Play services hands out access tokens silently, so no refresh token is stored. In Google Cloud, create an OAuth client of type **Android** with package `io.github.napo.openvolleyscout` and the SHA-1 of the release keystore (`keytool -list -v -keystore <keystore> -alias <alias>`); a second Android client with the debug keystore's SHA-1 is needed to try debug builds. Set the repository variable `VITE_GOOGLE_ANDROID_CLIENT_ID` to that client's id so the Android build shows Google Drive. iOS is not supported yet.
