# Read in Place

Chrome MV3 extension that reads a web page aloud in place: no reading mode, no popup
window, no reflow. Click where you want it to start, jump around with keys, and watch each
word highlight on the real page as it's spoken. Speed runs from 0.5x to 10x.

Status: planning v0.1.0. See `notes/PLAN.md`.

## Run (once code lands)

1. Open `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick the `src/` folder.
3. On any page press Alt+Shift+R.

## Layout

```
src/          extension source (load this folder unpacked)
notes/        research and plan
scripts/      build and packaging helpers
```
