# Research: reading a page in place from a Chrome extension

Date: 2026-11-08

## Does this already exist?

Close, but not quite. Edge's built-in Read Aloud reads in place with word highlighting, but
it uses Microsoft's neural voices and isn't available in Chrome. Chrome's Read Aloud lives
inside Reading Mode, which opens a side panel and re-renders the text. Most Chrome Web Store
"read aloud" extensions either open a popup or player bar, highlight by sentence only, or
inject spans into the page, which can break layouts. A small, keyboard-first, no-reflow
reader with a true 10x ceiling is a real gap.

## Building blocks (all native, no libraries)

| Need | API | Notes |
| --- | --- | --- |
| Speech | `chrome.tts` (service worker) | `rate` 0.1 to 10. Emits `word` events with `charIndex`. Needs the `tts` permission. |
| Voice capability check | `chrome.tts.getVoices()` | Each voice lists `eventTypes`. Only voices with `word` can drive word highlighting. |
| Highlight without touching the DOM | CSS Custom Highlight API (`CSS.highlights`, `new Highlight(range)`, `::highlight(name)`) | Chrome 105+. Paints over existing text. No spans, no reflow. |
| Click to set position | `document.caretPositionFromPoint(x, y)` | Chrome 128+. Fall back to `caretRangeFromPoint`. |
| Collect readable text | `TreeWalker` over text nodes, `Element.checkVisibility()` | Skip script, style, hidden, aria-hidden, inputs. |
| Split into sentences and words | `Intl.Segmenter` (`granularity: "sentence"` / `"word"`) | Language aware. Gives clean jump targets. |
| Follow along | `Range.getBoundingClientRect()` + `window.scrollBy` | Only scroll when the word leaves a comfort band. |
| Keys | In-page `keydown` (capture phase) while active, plus `chrome.commands` for the global toggle | `chrome.commands` allows only 4 suggested shortcuts, so most keys live in the content script. |

## The two hard parts

1. **Word events depend on the voice.** Local OS voices (macOS system voices, Windows SAPI
   voices) send reliable `word` events. Some Google network voices send few or none. v0.1.0
   will prefer voices that advertise `word`, and fall back to sentence-level highlighting
   with an estimated word timer when a voice does not.
2. **10x speed.** `chrome.tts` accepts rate up to 10, but each engine clamps it lower in
   practice. macOS voices go very fast; Google voices top out near 2x to 3x. True 10x on any
   voice needs pre-rendered audio played with `HTMLMediaElement.playbackRate` (up to 16, pitch
   preserved) in an offscreen document. That needs a TTS source that returns audio plus word
   timings (for example a cloud TTS API), so it is post-v0.1.0. v0.1.0 will show the
   effective cap per voice so the slider is honest.

## Known out of scope

- Chrome's built-in PDF viewer (content scripts can't reach it).
- Canvas-rendered apps such as Google Docs and Sheets.
- Cross-origin iframes beyond what `all_frames` injection allows.

## Sources

- chrome.tts reference: https://developer.chrome.com/docs/extensions/reference/api/tts
- caretPositionFromPoint support: https://web-platform-dx.github.io/web-features-explorer/features/document-caretpositionfrompoint
- Custom Highlight API intent to ship: https://groups.google.com/a/chromium.org/g/blink-dev/c/Q21BQb-zV0w/m/2ik0_aKyCAAJ
