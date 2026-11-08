# Read in Place

Chrome extension that reads a web page aloud in place: no reading mode, no popup window, no
reflow. Click where you want it to start, jump around with keys, and watch each word
highlight on the real page as it's spoken. Speed goes from 0.5x up to the fastest your
voice can really go, which is usually well past 2x for on-device voices.

Status: v0.1.2. Design notes and decisions are in `notes/PLAN.md`.

## Install

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and pick the `src/` folder.
3. On any page press Alt+Shift+R (Option+Shift+R on a Mac), or click the toolbar icon.

After pulling changes, click the reload icon on the extension's card, then refresh any tab
where it was running.

## Use

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

`scripts/package.sh` zips `src/` into `dist/` (git-ignored).
`scripts/make-icons.py src/icons` redraws the toolbar icons.

## Layout

```
src/          extension source (load this folder unpacked)
  background/   service worker: speech, toggle, speed measuring
  content/      injected scripts: text model, reader, highlight, corner controls, input
  options/      settings page
  shared/       defaults and helpers used everywhere
test/         in-page test suite and fixture page
notes/        research and design notes
scripts/      packaging and icon helpers
```
