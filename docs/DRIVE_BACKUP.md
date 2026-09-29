# Backup: file export and Google Drive

Ported from the MealFast app (`C:\Users\rajkumar_p\dev\mealfast\app.js`, "Backup" and
"Google Drive backup" sections). Reuse its approach and structure, with the changes listed below.

## Role of backup in PRABAS

Supabase holds the live shared data. Drive holds an off-platform safety copy.
Drive is **not** a sync mechanism between the two users.

Only one household member (the "backup owner", normally Raj) connects Drive. The Settings
screen shows who the backup owner is. Other members see the backup status but not the controls.

## Backup contents

A single JSON snapshot of all household tables, in this shape:

```json
{
  "app": "PRABAS",
  "schemaVersion": 1,
  "exportedAt": "2026-09-27T20:15:00.000Z",
  "householdId": "…",
  "tables": { "items": [], "stock_events": [], "dishes": [], "…": [] }
}
```

- Build the snapshot generically from a list of backed-up tables, so tables added in later batches are included by adding them to that list.
- Increase `schemaVersion` whenever the shape changes, and write a migration so older backups restore correctly instead of being rejected.

## File export and import (Settings, "Backup" section)

- **Export JSON:** the full snapshot, named `prabas-backup-YYYY-MM-DD.json`. Use MealFast's blob-download approach (`triggerDownload`).
- **Export CSV:** a spreadsheet-friendly export of stock and meal history, oldest first, in clearly separated sections in one file (as MealFast does, since a single download is reliable on iOS).
- **Import JSON:** validate `app` and `schemaVersion`, migrate if needed, confirm, then replace the household's data in Supabase. This restores both phones.

## Google Drive backup: keep from MealFast

- Load Google Identity Services (`https://accounts.google.com/gsi/client`) asynchronously. It must never block the app from opening.
- Scope: `https://www.googleapis.com/auth/drive.file`, so the app only sees files it created.
- Token handling, as in MealFast's `gdGetToken`: use `initTokenClient`, request with `prompt: ""` so consent shows only the first time, and cache the token in memory until one minute before expiry.
- Find-or-create logic, as in `gdFindFile`, `gdPatch`, `gdCreate`, and `gdUpload`: cache the file ID in local storage, and if it's stale, find the file again by name, else create it with a multipart upload.
- Automatic backup on app open, as in `gdMaybeAutoBackup`: if connected and the last backup is older than 24 hours, back up quietly with no toasts.
- Restore, as in `gdRestore`: fetch, validate, confirm, then replace. Handle a stale file ID by searching again.
- Status UI, as in `renderBackupStatus`: "Connect Google Drive" when not connected. Once connected, show "Last synced: 3 hours ago", "Sync now", "Restore from Drive", "Disconnect Drive", and a readable error line ("Sign-in needed to sync", "Last sync failed · will retry").
- Keep the last-known-good timestamp when a sync fails.
- Service worker passes Google requests straight through without caching.
- The OAuth client ID lives in an environment variable (`VITE_GOOGLE_CLIENT_ID`). It is a public identifier, not a secret.

## Google Drive backup: changes from MealFast

1. **Rolling backups instead of one overwritten file.** Store backups in a `PRABAS backups` folder created by the app. Keep the last 7 daily files (`prabas-backup-YYYY-MM-DD.json`) plus one weekly file for each of the last 4 weeks. Delete older ones. A bad day's data can then never overwrite the only good copy.
2. **Restore picks a date.** "Restore from Drive" lists the available backups by date, with the newest first.
3. **Disconnect revokes access.** Call `google.accounts.oauth2.revoke(token)` before clearing local flags.
4. **Migrations on restore.** Older `schemaVersion` backups are migrated forward, not rejected.
5. **Backup owner only.** Drive controls appear only for the backup owner. Restore from Drive or file requires a confirm that states that it replaces data for everyone in the household.
6. **Local storage keys** use the `prabas_gd_` prefix (connected, last, folderId, err).

## Tests

- Snapshot and restore round-trip: export, wipe, import, and compare all tables.
- Migration from `schemaVersion` 1 to the current version, once a second version exists.
- Rolling retention: given a set of dated files, the right ones are kept and deleted.
