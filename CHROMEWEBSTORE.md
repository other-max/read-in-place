# Chrome Web Store Listing: Glint Reader

> Last Updated: 2026-11-10

This file is the source for everything typed into the Chrome Developer Dashboard. Keep it in
step with `src/manifest.json`. Launch decisions and the rename record are in `docs/LAUNCH.md`.

## Store Listing

**Extension Name**
Glint Reader: reads any web page aloud, word by word

From the manifest `name` (52 of 75 characters). `short_name` is "Glint Reader". Always pair the
name with "reads ... aloud", so it isn't mistaken for a reader-mode tool.

**Short Description**
Reads any web page aloud right where it is, highlighting each word on the page as it is spoken.

From the manifest `description` (95 of 132 characters).

**Detailed Description**
Paste `store/description.txt` as is. It is plain text with line breaks, since the store strips
Markdown.

**Category**
Accessibility (alternative: Productivity)

**Single Purpose**
Glint Reader reads the current web page aloud and highlights each word on the page as it is
spoken. The user starts and stops it on a tab, moves through the text with the keyboard or by
clicking, and changes the speed and voice.

**Primary Language**
English

## Graphics & Assets

Render with `store/screenshots/render.sh` (headless Chrome, real content scripts).

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `src/icons/icon128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `store/screenshots/out/1-read.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/screenshots/out/2-click.png` |
| Screenshot 3 | 1280×800 | ✅ Ready | `store/screenshots/out/3-speed.png` |
| Screenshot 4 | 1280×800 | ✅ Ready | `store/screenshots/out/4-keys.png` |
| Screenshot 5 | 1280×800 | ✅ Ready | `store/screenshots/out/5-settings.png` |
| Small Promo Tile | 440×280 | ✅ Ready | `store/screenshots/out/small-tile.png` |
| Marquee Promo Tile | 1400×560 | ✅ Ready | `store/screenshots/out/marquee.png` |

### Screenshot Notes

1. Reading in place: the spoken word and its sentence highlighted on an article, pill at 1.5x.
2. Click to start: a pointer on the word reading jumped to.
3. Speed: the corner controls open on hover, at 3x, with key hints.
4. Keys: the keyboard controls beside a paused page.
5. Settings: voice picker, measured top speed, and reading speed.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| tts | permissions | Speaks the page's text with the voices available in Chrome, and receives word events so the extension can highlight the word being spoken. Also speaks a short sentence silently (volume 0) at rising speeds to measure how fast the user's voice can really go. |
| storage | permissions | Saves the user's settings (voice, speed, and highlight colors) and each measured voice's speed table and pace, so the speed shown matches the speed heard. Nothing is sent anywhere. |
| activeTab | permissions | Gives access to the current tab only when the user presses the shortcut or clicks the toolbar icon there. The extension has no host permissions and can't see any page otherwise. |
| scripting | permissions | Injects the reader's scripts and highlight styles into the tab the user just started it on, using the access activeTab grants. All scripts ship in the package. |
| (none) | host_permissions | None requested. |

**Remote code:** No. All code ships in the package.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No.

The extension reads the visible text of a page only after the user starts it there, to speak
and highlight it. It never stores that text or sends it to the developer. If the user picks an
online voice, Chrome itself sends the spoken text to that voice's provider (Google, for
Google's voices). The privacy policy says so.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | | No |
| Health info | No | No | | No |
| Financial info | No | No | | No |
| Authentication info | No | No | | No |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No | | No |
| User activity | No | No | | No |
| Website content | No (decision open) | Only by Chrome, to an online voice's provider | Speaking the page | No |

Open decision: whether to tick "Website content" because of the online voice case.
Recommendation: leave it unticked, since the developer never receives it and the policy
discloses it. Tick it if a reviewer pushes back.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://navica.llc/tools/glint-reader/privacy/

Source: `docs/privacy-policy.md`. The live page is in the `navica-marketing` repo. Keep both in step.

## Distribution

**Visibility**: Public (or Unlisted for a soft launch)
**Regions**: All regions

## Developer Info

**Publisher Name**
Navica LLC (the same developer account as Reckonry Timer for Karbon)

**Contact Email**
max@navica.llc

**Support URL**
https://navica.llc/tools/glint-reader/#support

**Homepage URL**
https://navica.llc/tools/glint-reader/ (also the manifest `homepage_url`)

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.2.3 | 2026-11-10 | Measures the voice automatically after install and update, and stops measuring if reading starts. Unmeasured Google voices start at a 3.5x top speed. | Draft |
| 0.2.2 | 2026-11-10 | Speeds are now the speed you hear: Google's online voices speed up by about rate squared, so the extension corrects for it. Word highlighting follows the voice's measured pace. | Draft |
| 0.2.1 | 2026-11-10 | Clear messages when Chrome has no voices or a voice fails. | Draft |
| 0.2.0 | 2026-11-09 | Renamed from Read in Place to Glint Reader. Homepage and store copy. | Draft |

## Review Notes

### Known Issues / Limitations
- Can't read Chrome's PDF viewer, canvas-drawn pages such as Google Docs, text in frames,
  Chrome's own pages, or the Chrome Web Store. The toolbar icon shows a red ! there.
- Google's online voices report no word positions, so their highlighting is estimated, and
  they hang above engine rate 2. Their top speed measures about 3.75x.
- Chrome installed as a Linux Flatpak has only Google's online voices. Its sandbox can't reach
  the system's speech service.

### Rejection History
None yet.
