# Glint Reader

Formerly Read in Place. The store title is "Glint Reader: reads any web page aloud, word by word".

Chrome extension that reads a web page aloud in place: no reading mode, no popup window, no
reflow. Click where you want it to start, jump around with keys, and watch each word
highlight on the real page as it's spoken. Speed goes from 0.5x up to the fastest your
voice can really go, which is usually well past 2x for on-device voices.

Status: v0.2.7. Design notes and decisions are in `notes/PLAN.md`.

## Install

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and pick the `src/` folder.
3. On any page press Alt+Shift+R (Option+Shift+R on a Mac), or click the toolbar icon.

After pulling changes, click the reload icon on the extension's card, then refresh any tab
where it was running.

## Use

- Select text, right-click, and choose Glint Reader. Read aloud reads just the selection. Read
  aloud from here reads from the selection to the end of the page.
- Click any text to read from that word. Alt+click reads a link instead of following it.
- Space pauses. Right and Left move by sentence. Down and Up move by paragraph.
- `=` and `-` change speed. `0` resets to 1x. Esc stops.
- The pill in the bottom-right corner shows speed and a pause button. Hover it for stop,
  settings, and speed buttons, with each key shown above its button.
- Settings (right-click the toolbar icon, then Options): voice, default speed, highlight
  colors, and a button to measure your voice's top speed.

Pick an on-device voice listed under "with word highlighting" for exact word tracking and
the highest speeds.

## Test

```sh
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/test/index.html?auto` and check the console, or run
`await runTests()` there. The page runs the real content scripts against a fake voice.

## Package

`scripts/package.sh` zips `src/` into `dist/glint-reader-<version>.zip` (git-ignored).
`scripts/make-icons.py src/icons` redraws the toolbar icons.

## Store listing and website

Launch checklist, open decisions, and the rename list: [docs/LAUNCH.md](docs/LAUNCH.md).

- `store/description.txt`: the store description.
- `store/screenshots/render.sh`: renders the 1280x800 screenshots, promo tiles, and landing page
  images to `store/screenshots/out/` with headless Chrome, using the real content scripts.
- `CHROMEWEBSTORE.md`: everything typed into the store dashboard.
- `docs/privacy-policy.md`: the privacy policy.
- Live pages, from the `navica-marketing` repo: https://navica.llc/tools/glint-reader/ and
  https://navica.llc/tools/glint-reader/privacy/.
- `site/`: the original landing page draft. The live page is the source of truth now.

## Layout

```
src/          extension source (load this folder unpacked)
  background/   service worker: speech, toggle, speed measuring, built-in voice engine
  content/      injected scripts: text model, reader, highlight, corner controls, input
  options/      settings page
  shared/       defaults and helpers used everywhere
  voice/        built-in Kokoro-82M voices (model fetched by scripts/fetch-voice.sh)
test/         in-page test suite and fixture page
notes/        research and design notes
scripts/      packaging and icon helpers
store/        store description and screenshot renderer
site/         landing page draft (plain HTML)
docs/         launch checklist, privacy policy, store Privacy tab text
```

## License

Copyright (C) 2026 Navica LLC. Glint Reader is free software under the GNU General Public
License, version 3 or later. See `LICENSE`. The built-in voices bundle eSpeak NG (GPL-3.0),
ONNX Runtime Web (MIT), and Kokoro-82M (Apache 2.0). See `THIRD_PARTY_NOTICES.md`.
