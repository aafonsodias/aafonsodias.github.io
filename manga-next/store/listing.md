# Chrome Web Store listing for Manga Next

Paste these into the developer dashboard. Keep the version in `manifest.json` in step with each upload.

## Store listing

**Name:** Manga Next

**Summary (132 characters max):**
Know when the next chapter of every manga in your bookmarks folder comes out. No account, no tracking.

**Category:** Productivity (or Fun)

**Language:** English

**Description:**

You already bookmark the chapter you stopped at. Manga Next does the rest.

WHAT IT SHOWS
For every manga in your bookmarks folder:
• the chapter you are on and the latest chapter out in English
• when the next chapter is expected, worked out from the series' real release rhythm ("weekly, usually Tuesday"), and how late it is when a group slips
• whether a series is on hiatus, finished, or simply quiet for longer than usual
• the series cover, so your list looks like your shelf

WHEN SOMETHING DROPS
• a badge on the icon counts the series with a new chapter waiting
• a notification the moment one appears
• "Read ch N" opens the next unread chapter in one click
• smart timing: each series is checked two hours before its expected release and then hourly until the chapter lands, so you rarely wait more than an hour after a drop

ZERO UPKEEP
• keep bookmarking the chapter you stopped at; your latest save is where you are
• the previous bookmark of that series is tidied away automatically, one bookmark per series
• everything removed goes to a bin for 60 days with one-click restore, so a wrong delete is never final
• no folder yet? It finds the one you already use, or creates one for you

DISCOVER
• "You might like" suggests series read alongside the ones you follow, with Read ch 1, the series page, Skip for 30 days, or Not for me

WORKS ANYWHERE
• any reading site. Release dates come from Comick and MangaUpdates, two public databases covering almost every scanlation group
• wrong match? Fix it in one click by searching another name or pasting a link
• Alt+Shift+M opens the popup from anywhere

NO ACCOUNT. NO TRACKING.
Runs entirely in your browser. Nothing leaves it except the series title sent to those two databases to look up dates.

**Homepage:** https://github.com/aafonsodias/aafonsodias.github.io/tree/main/manga-next
**Support URL:** https://github.com/aafonsodias/aafonsodias.github.io/issues

## Graphic assets

Ready-made 1280×800 screenshots are in `store/screenshots/` (regenerate with `store/storeshots.mjs`).

- Store icon: `icons/icon128.png` (128×128, provided).
- Screenshots: at least one at 1280×800 or 640×400. Take them from your own Chrome with the popup open: one of the main list with a NEW row, one of the Bin, one of the settings page. Crop or pad to the exact size.
- Promo tile (440×280) is optional.

## Privacy practices tab

**Single purpose:** Shows when the next chapter of each manga bookmarked in a chosen folder is expected.

**Permission justifications:**

- `bookmarks` — Reads the titles and URLs of bookmarks inside the folder the user chooses, to identify each series and the chapter the user is on. If no folder by that name exists, detects an existing folder that already holds chapter bookmarks (by name or contents) and asks the user to confirm when there is more than one; creates a new folder in the bookmarks bar only when none fits. With the user's setting on, removes the previous bookmark of a series when the series is bookmarked again.
- `storage` — Stores settings, cached release data, and the bin of removed bookmarks locally.
- `alarms` — Re-checks release dates on a schedule (every 6 hours by default).
- `notifications` — Tells the user when a chapter newer than their bookmark is available.
- Host permissions (`api.comick.dev`, `api.comick.io`, `api.comick.fun`, `api.mangaupdates.com`) — Fetches release history and series status from these two public databases. Only the series title is sent.

**Remote code:** No, this extension does not use remote code.

**Data usage:** Tick nothing under "What user data do you plan to collect?" The extension collects no personally identifiable information, no health, financial, authentication, personal communications, location, web history, user activity, or website content. Then certify the three disclosures.

**Privacy policy URL:** https://aafonsodias.github.io/manga-next/privacy.html

**Rights:** the code is proprietary (see `LICENSE`). Add the line "© 2026 aafonsodias. All rights reserved." at the end of the description if you want it shown on the listing.

## Distribution

- Visibility: start with **Unlisted**. Anyone with the link can install; it does not show in search. Switch to Public once a few people have run it on real data.
- Regions: all.

## Packaging

Zip the `manga-next` folder contents (manifest.json at the root of the zip, not inside a subfolder). Exclude `store/`, `privacy.html`, and `package.json`; they are harmless but unnecessary. Upload the zip under "Package".
