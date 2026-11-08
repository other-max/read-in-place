# Read in Place: v0.1.0 plan

Goal: read any normal web page aloud in place, with the spoken word highlighted on the real
page, click-to-start, keyboard navigation, and 0.5x to 10x speed. No reading mode, no popup
window, no layout changes.

## Architecture

```
service worker (background/service-worker.js)
  owns chrome.tts: speak, stop, pause, resume, voice list
  relays tts word/sentence/end events to the tab
  handles chrome.commands (Alt+Shift+R) and the toolbar button
        ^  chrome.runtime messages  v
content script (content/*.js, injected on demand via activeTab + scripting)
  text model:  walk visible text nodes -> blocks -> sentences -> words, with Range maps
  reader:      queue of sentences, current position, play/pause/jump logic
  highlight:   CSS.highlights "rip-word" and "rip-sentence" (no DOM edits)
  input:       keydown (capture) + click handling while active
  hud:         tiny Shadow DOM badge (speed, paused) that fades out; not a window
options page (options/options.html)
  voice picker (flags voices without word events), default speed, colors
```

Speaking one sentence per `chrome.tts.speak` call keeps jumps instant (stop and speak the
next sentence) and keeps `charIndex` mapping simple.

## Controls (defaults, rebindable later)

| Action | Key |
| --- | --- |
| Start / stop reader | Alt+Shift+R (or toolbar icon) |
| Pause / resume | Space |
| Next / previous sentence | Right / Left |
| Next / previous paragraph | Down / Up |
| Faster / slower | `=` / `-` (also `]` / `[`) |
| Reset speed to 1x | `0` |
| Start from here | Click text while reader is on; Alt+click any time |
| Exit | Esc |

Keys are only captured while the reader is on and focus is not in an input, textarea, or
contenteditable. Clicks on links still navigate unless Alt is held.

Speed steps: 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10.

## Milestones

1. **Skeleton.** Manifest, service worker, inject-on-toggle, speak a hard-coded sentence.
2. **Text model.** TreeWalker over visible text, skip nav/script/hidden, block grouping by
   display type, `Intl.Segmenter` sentences and words, each mapped to a DOM `Range`.
3. **Speak and highlight.** Sentence queue, `word` event -> word Range ->
   `CSS.highlights.set`. Sentence highlight underneath in a softer color. Auto-scroll when
   the word leaves the middle 60% of the viewport.
4. **Fallback timing.** If the voice lacks `word` events, estimate word timing from length
   and rate, and resync at each sentence boundary.
5. **Input.** Click-to-position via `caretPositionFromPoint`, key map above, HUD badge.
6. **Speed.** Step table, persisted in `chrome.storage.sync`, applied live by restarting the
   current sentence at the current word. Show "capped by voice" in the HUD when the engine
   clearly isn't going faster.
7. **Options page.** Voice picker, default speed, highlight colors.
8. **Test pass.** Wikipedia, a news article, Gmail message view, a docs site, a long
   Reddit thread, a page with iframes. Check dark sites for highlight contrast.

## Acceptance for v0.1.0

- Works on the test pages above without changing layout.
- Word highlight stays on the spoken word with a macOS system voice at 1x to 4x.
- Click starts reading at the clicked word within about 200 ms.
- All keys work and never fire while typing in a field.
- Speed persists across tabs and restarts.

## Deferred past v0.1.0

- True 10x on every voice via pre-rendered audio and `playbackRate` (needs a TTS source with
  word timings, likely cloud and opt-in).
- PDFs, Google Docs, rebinding keys, Chrome Web Store listing.

## Difficulty

Moderate. Everything needed is a native browser API, and v0.1.0 is roughly 800 to 1,200
lines of plain JS. The fiddly parts are mapping speech offsets back to DOM Ranges across
messy markup, and voice-dependent word events and speed caps.
