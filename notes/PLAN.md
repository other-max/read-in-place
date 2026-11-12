# Glint Reader: design and status

Goal: read any normal web page aloud in place, with the spoken word highlighted on the real
page, click-to-start, keyboard navigation, and adjustable speed. No reading mode, no popup
window, no layout changes.

Status: v0.2.7 (renamed from Read in Place in 0.2.0). v0.1.2 was built and tested by hand in Chrome. All 67 tests on the in-page suite pass.

## Architecture (as built)

```
service worker (background/service-worker.js)
  owns chrome.tts: speak one sentence at a time, stop, voice info
  relays tts start/word/end/error events to the tab
  toggle via chrome.commands (Alt+Shift+R) and the toolbar button; injects on demand
  measures each voice's top speed silently (volume 0), stores it in storage.local
  opens the settings page for the corner controls
        ^  chrome.runtime messages  v
content scripts (injected with activeTab + scripting; top frame, or the frame a right-click
  selection is in)
  shared/common.js   defaults, speed steps, voice picking, highlight CSS
  platform.js        bridge to the extension (tests swap in a fake)
  text-model.js      visible text -> blocks -> sentences -> words, each mapped to a Range;
                     walks the flat tree (open shadow roots, slots)
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
  Inside shadow roots, older Chrome may need the colors as an adopted stylesheet, which is
  removed on stop. See "Open shadow roots" below.
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
nested scroll boxes, end of page, open shadow roots (nested, slotted, closed, highlighting,
selections, clicks, scrolling, and sheet cleanup), and the no-DOM-change rule. Add `?real=1` to hear the
browser's `speechSynthesis` instead. See the README for how to run it.

Not covered automatically: the service worker, `chrome.tts`, the options page, and the
toolbar shortcut. Browser automation can't press Chrome's own shortcuts, so test those by
hand after loading `src/` unpacked.

## Known limits

- Chrome's PDF viewer and canvas-drawn apps such as Google Docs can't be read.
- Text inside closed shadow roots is skipped. Open shadow roots are read (0.2.6). Before
  Chrome 137 (no `getComposedRanges()`), a selection that crosses into or out of a shadow
  tree has that end moved to the host, so the right-click menu may read only part of it.
  Untested on those versions. A component that was hidden
  or had no shadow root yet at the last rebuild isn't watched, so text it draws later is
  picked up only when something else on the page changes. Frames are read only through the
  right-click menu, and only frames the click grants access to (same site, about:blank, srcdoc).
  A frame from another site gets a notice in the top frame instead.
- Online voices often top out near 2x.
- Chrome installed as a Linux Flatpak has no voices: its sandbox has neither libspeechd nor
  the speech-dispatcher socket. The extension says so on start, and the settings page explains
  it. Test on Linux with Google's .deb Chrome instead.
- Restricted pages (chrome://, the Web Store) show a red ! on the toolbar icon.
- Right-click menu on selected text (0.2.4), under a "Glint Reader" parent item so Chrome
  doesn't title it with the long store name: "Read aloud" reads just the selection and stops
  at its end, finishing a word cut partway. "Read aloud from here" starts at the selection and
  reads on. Both work whether or not the reader is already running. Moving past the end of the
  selection with keys or a click drops the stop point. Selections in form fields say they
  can't be read. The menu grants activeTab, so no new host access.

## Case: Karbon emails said "can't read that selection" (0.2.5)

Karbon wraps the email body in a Tailwind `contents` div (`display: contents`).
`checkVisibility()` returns false for any element with no box of its own, so the text model
rejected the wrapper and everything in it. The email showed on screen but was not in the
model, so a selection there mapped to nothing.

The class of bug: a visibility test that rejects a whole subtree when the element itself is
fine. Guards added for each member found:
- `display: contents` wrappers (Tailwind `contents`, framework wrappers, custom elements with
  `:host { display: contents }`, and `<slot>`): skip the box check for them, still check
  their children.
- `visibility: hidden` boxes with a `visibility: visible` child: the child shows, so hide
  only the text directly inside the hidden box, checked per text node.
- Apps that mark a visible pane `aria-hidden` (behind a drawer or dialog that doesn't cover
  it): when the strict model has none of a selection, rebuild leniently, reading aria-hidden
  and screen-reader-only text until reading stops. Selected text is text the user can see.
- Selections inside an iframe (email clients that sandbox the message in a frame): the
  right-click menu now runs the reader in the frame the selection is in, and speech events go
  back to that frame. Alt+Shift+R and the toolbar button go to the frame that is reading.
- Selections starting on skipped text (a citation, a button) were already handled by
  `rangePoints()`.

Open shadow roots were still open here. They are done in 0.2.6, below.

## Open shadow roots (0.2.6)

Web components keep their text in shadow roots: MSN articles nest them several deep,
Salesforce-style apps build whole pages from them, and Karbon's own `khq-*` components use
them. Up to 0.2.5 the reader saw light DOM only.

- **The walk follows the flat tree, the page as drawn.** For a host with an open shadow
  root, the model reads the shadow root's children instead of the host's own. For a
  `<slot>`, it reads `assignedNodes({ flatten: true })`, or the fallback content when nothing
  is assigned. So slotted text is read once, at its slot, in the order shown. Light children
  that no slot takes are not drawn and are not read. The visibility rules are unchanged and
  apply on both sides of the boundary, including `:host { display: contents }`.
- **Closed shadow roots stay closed.** `el.shadowRoot` is null for them, so the host's light
  children are walked as before. Content scripts could open them with
  `chrome.dom.openOrClosedShadowRoot()`, but a closed root is the page saying keep out.
- **Order and positions use the flat tree.** `flatParent()` steps to a node's slot or a
  shadow root's host, and `flatCompare()` orders nodes by that, since
  `compareDocumentPosition()` across trees is arbitrary. `blockAtOrAfter()` and selection
  mapping use it. Selection mapping now walks the model's own text in order, so its two ends
  can sit in different trees.
- **One Range per tree.** A Range can't cross a shadow boundary (it collapses), and one
  around a host doesn't cover the text drawn inside it. A block that mixes trees (a component
  inline in a sentence) is marked `mixed`, and `rangesOf()` returns one Range per run of text
  in the same tree. The word and sentence highlights take all of them.
- **Selections** use `Selection.getComposedRanges({ shadowRoots })` with every open shadow
  root in the page (Chrome 137 and up). Without it, `getRangeAt()` as before.
- **Clicks** pass the open shadow roots on the event's `composedPath()` to
  `caretPositionFromPoint()`, which otherwise answers with a spot next to the host. Links
  and buttons are found along the composed path too.
- **Scroll-follow** climbs the flat tree to find the box that scrolls, so a scroll box
  inside a component follows the spoken word.
- **Page changes:** the MutationObserver also watches each open shadow root the model read.

**Highlight colors in shadow trees.** The highlight registry is per document, so Ranges inside
shadow trees can be added to the same `rip-word` and `rip-sentence` highlights. The colors are
another matter: `::highlight()` rules injected into the page don't match elements in shadow
trees. Tested in Chrome 156, the shadow text paints anyway. Highlight inheritance carries
the host's `::highlight()` style into its shadow tree. That is newer than our minimum
Chrome (128), so `highlight.js` checks once per shadow root: if
`getComputedStyle(el, '::highlight(rip-word)')` inside the root matches the page's value,
nothing is done. If not, it appends one constructed stylesheet with the two `::highlight()`
rules to the end of that root's `adoptedStyleSheets`, and only for roots it paints in. The
root's own sheets stay as they were, same objects, same order. The sheet is put back if a
framework replaces the list mid-read, follows color changes from settings, and is filtered
out of every root when reading stops. Why this choice: it needs no change to the DOM, no
`<style>` element, and nothing in `innerHTML`. It touches a shadow tree only when there is
no other way to color it, and it is fully undone on stop. The test suite forces this path
(`R.hl.alwaysAdopt`) to check that the sheet colors shadow text and is removed.

## Ideas for later

- Rebindable in-page keys.
- Chrome Web Store listing (needs a privacy policy and screenshots).
