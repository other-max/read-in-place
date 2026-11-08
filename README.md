# Read in Place

Chrome MV3 extension that reads a web page aloud in place: no reading mode, no popup
window, no reflow. Click where you want it to start, jump around with keys, and watch each
word highlight on the real page as it's spoken. Speed runs from 0.5x to 10x.

Status: v0.1.2. Plan and decisions in `notes/PLAN.md`.

## Install

1. Open `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick the `src/` folder. After code changes, click the reload icon on the card.
3. On any page press Alt+Shift+R (Option+Shift+R on a Mac) or click the toolbar icon.

## Use

- Click any text to read from that word. Alt+click works on links.
- Space pauses. Right and Left move by sentence, Down and Up by paragraph.
- `=` and `-` change speed (up to the voice's measured top speed). `0` resets. Esc stops.
- The pill in the bottom-right corner shows pause and speed. Hover it for speed buttons,
  settings, and stop, with the matching keys shown above each button.

## Test

Run `python3 -m http.server 8765` in the project folder, open
`http://127.0.0.1:8765/test/index.html?auto`, and check the console (or call `runTests()`).
The test page runs the real content scripts against a fake voice.

## Layout

```
src/          extension source (load this folder unpacked)
test/         in-page test suite and fixture page
notes/        research and plan
scripts/      build and packaging helpers
```
