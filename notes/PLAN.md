# Glint Reader: design and status

Goal: read any normal web page aloud in place, with the spoken word highlighted on the real
page, click-to-start, keyboard navigation, and adjustable speed. No reading mode, no popup
window, no layout changes.

Status: v0.2.3 (renamed from Read in Place in 0.2.0). v0.1.2 was built and tested by hand in Chrome. All 35 tests on the in-page suite pass.

## Architecture (as built)

```
service worker (background/service-worker.js)
  owns chrome.tts: speak one sentence at a time, stop, voice info
  relays tts start/word/end/error events to the tab
  toggle via chrome.commands (Alt+Shift+R) and the toolbar button; injects on demand
  measures each voice's top speed silently (volume 0), stores it in storage.local
  opens the settings page for the corner controls
        ^  chrome.runtime messages  v
content scripts (injected with activeTab + scripting, top frame only)
  shared/common.js   defaults, speed steps, voice picking, highlight CSS
  platform.js        bridge to the extension (tests swap in a fake)
  text-model.js      visible text -> blocks -> sentences -> words, each mapped to a Range
  highlight.js       CSS.highlights "rip-word" and "rip-sentence" (no DOM edits)
  hud.js             corner controls in a closed Shadow DOM
  reader.js          position, speaking, navigation, speed, follow-scroll
  main.js            keys, clicks, scroll detection
options page (options/options.html)
  voice picker grouped by capability, test voice, measure top speed, default speed, colors
```

## Decisions

- **One sentence per `chrome.tts.speak` call.** Jumps are instant, and word `charIndex`
  maps straight back to the block offset.
- **Highlighting uses the CSS Custom Highlight API.** The page DOM is never changed. The
  test suite checks that `body.innerHTML` is identical before, during, and after reading.
- **Speed tops out at what the voice can really do.** 10x was dropped (not needed). On
  install and when a voice is chosen, the worker speaks a test sentence silently at rising
  rates and records the last rate that still got noticeably faster. Speed steps stop there.
  Until measured, the guess is 4x for on-device voices and 2x for online voices.
- **Speeds are the speed you hear, not the rate sent to the engine.** Engines don't all scale
  linearly: Google's online voices (measured 2026-11-10, Chrome 157 Linux) speed up by about
  rate squared, so rate 2 sounded like 3.7x. Measuring stores a table of rate sent against
  speedup heard, plus the voice's pace at 1x, and `engineRate()` in `shared/common.js` inverts
  it. Unmeasured Google voices assume rate squared, which comes out 10 to 15% slow; others
  assume linear. Measuring retries a dropped request once and stops where a voice hangs.
  The service worker measures the user's voice after install and every update (an unpacked
  reload counts as an update), and reading interrupts a measurement in progress. Via chrome.tts,
  Google US English measured 3.74x top speed and 17.3 characters a second at 1x, and it hangs
  at engine rate 2.5 and up, so that is its ceiling.
- **Voices without word events get estimated word timing.** It switches off as soon as a
  real word event arrives.
- **Keys are captured only while reading** and never while focus is in a field.
  Shift+arrows are left alone so text selection still works.
- **Clicks only jump when they land on a character.** Links and buttons keep working; Alt+click
  reads a link instead of following it.
- **Corner controls never move under the pointer.** Collapsed it shows speed and pause. On
  hover, stop, settings, slower, and faster open to the left in fixed grid columns, with key
  hints above. Pages can't move the pointer, so stable positions are the fix.
- **Page changes trigger a rebuild at the next sentence** (at most every 3 seconds, or right
  away if the current text was removed). Position is kept by DOM point, not index.
- **activeTab only, no host permissions.** The extension can't see a page until you start it
  there.

## Controls

| Action | Key | Corner controls |
| --- | --- | --- |
| Start / stop | Alt+Shift+R (Option+Shift+R on Mac), or the toolbar icon | ✕ stops |
| Pause / resume | Space | ⏸ / ▶ |
| Next / previous sentence | Right / Left | |
| Next / previous paragraph | Down / Up | |
| Faster / slower | `=` / `-` (also `]` / `[`, `+`) | + / − |
| Reset to 1x | `0` | |
| Read from here | Click text (Alt+click on links) | |
| Settings | | ⚙ |

## Testing

`test/index.html` loads the real content scripts with `test/fake-platform.js`, a stand-in
voice that emits word events on a timer. `test/tests.js` covers the text model, reading
order, every key, click handling, the corner controls, estimated timing, page changes,
nested scroll boxes, end of page, and the no-DOM-change rule. Add `?real=1` to hear the
browser's `speechSynthesis` instead. See the README for how to run it.

Not covered automatically: the service worker, `chrome.tts`, the options page, and the
toolbar shortcut. Browser automation can't press Chrome's own shortcuts, so test those by
hand after loading `src/` unpacked.

## Known limits

- Chrome's PDF viewer and canvas-drawn apps such as Google Docs can't be read.
- Text inside iframes and shadow DOM is skipped (top frame, light DOM only).
- Online voices often top out near 2x.
- Chrome installed as a Linux Flatpak has no voices: its sandbox has neither libspeechd nor
  the speech-dispatcher socket. The extension says so on start, and the settings page explains
  it. Test on Linux with Google's .deb Chrome instead.
- Restricted pages (chrome://, the Web Store) show a red ! on the toolbar icon.

## Ideas for later

- Read iframes and open shadow roots.
- Rebindable in-page keys.
- Reading from a right-click menu item.
- Chrome Web Store listing (needs a privacy policy and screenshots).
