# Manga Next

A small Chrome extension that reads the bookmarks in your **Manga** folder and, for each one, shows:

- the chapter you bookmarked and the latest chapter that is out in English,
- when the next chapter is expected (worked out from the series' recent release rhythm),
- whether the series is on hiatus, completed, or just quiet for longer than usual.

It keeps your current habit: bookmark the chapter you stopped at into the Manga folder.
The extension does the rest. A badge on the icon shows how many of your series have a
chapter newer than your bookmark, and you get a notification when one appears.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `manga-next` folder.
4. Click the puzzle icon in the toolbar and pin **Manga Next**.

Nothing to sign up for, no keys. It runs entirely in your browser.

## How it works

1. It finds a bookmarks folder named `Manga` (any case, anywhere in your bookmarks) and reads
   every bookmark in it, including subfolders.
2. From each bookmark title it extracts the series name and chapter, for example
   `Dungeon Odyssey Chapter 27 - Read Online | Asura Scans` gives *Dungeon Odyssey*, chapter 27.
   If the title has no chapter, the URL is used instead.
3. It looks the series up on [Comick](https://comick.io), falling back to
   [MangaUpdates](https://www.mangaupdates.com), and fetches the recent English releases.
4. It takes the median gap between the last releases, works out the usual weekday, and
   projects the next one. If a series is more than one and a half gaps late it says so, and
   if it is silent for more than two and a half gaps it marks it as probably on a break.
5. It re-checks every 6 hours (change this in settings) and whenever you edit the folder.

## Reading the popup

- **NEW 223** pill: a chapter newer than your bookmark is out. Click the row to open your bookmark.
- **next: Tue 14 Oct (in 2 days) · weekly, usually Tue**: the estimate and the rhythm it is based on.
- **BREAK?** / **HIATUS** / **DONE**: quiet for too long, flagged as hiatus by the source, or completed.
- **CHECK MATCH**: the series the source matched does not look like your bookmark title. Follow the
  *via* link to see what was matched. If it is wrong, press **fix** and either type a better name
  to search with or paste a `comick.io/comic/...` or `mangaupdates.com/series/...` link, then press Enter.

## Settings

Folder name, check interval, notifications on/off, which source to try first, and an optional
Comick API base URL in case the API moves domains again.

## Limits

- "Next expected" is a projection from the release history, not an announcement. Scanlation
  groups slip; the popup shows how late a series is rather than pretending to know.
- Both data sources are public, keyless APIs that are not officially documented. If one changes,
  switch the source order in settings; if both break, the match and parsing code in `lib/providers.js`
  is where to look.
- Only English releases are counted.

## Support me

If Manga Next saves you from re-bookmarking every week, you can buy me a coffee on Ko-fi:
https://ko-fi.com/YOUR_KOFI_NAME

## Development

Plain Manifest V3, no build step. Files:

- `background.js`: service worker. Reads bookmarks, checks series, stores results, badge, notifications.
- `lib/parse.js`: bookmark title and URL parsing.
- `lib/predict.js`: cadence and next-release estimate.
- `lib/providers.js`: Comick and MangaUpdates clients.
- `lib/icon.js`: inline toolbar and notification icon (no binary files in the repo).
- `popup.*`, `options.*`: UI.
