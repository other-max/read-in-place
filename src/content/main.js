// Wires keys, clicks, and messages to the reader.
(() => {
  const R = globalThis.__rip;
  if (R.booted) return;
  R.booted = true;
  const rd = R.reader, P = R.platform;

  P.on('toggle', () => rd.toggle());
  P.on('read', toEnd => rd.readSelection(toEnd));
  P.on('tts', (id, ev) => rd.onTts(id, ev));
  P.on('preempted', () => rd.pause());
  P.on('notice', text => rd.notice(text));

  const KEYS = {
    ' ': { fn: () => rd.togglePause() },
    ArrowRight: { fn: () => rd.nav('sentence', +1), repeat: true },
    ArrowLeft: { fn: () => rd.nav('sentence', -1), repeat: true },
    ArrowDown: { fn: () => rd.nav('block', +1), repeat: true },
    ArrowUp: { fn: () => rd.nav('block', -1), repeat: true },
    '=': { fn: () => rd.changeRate(+1), repeat: true },
    '+': { fn: () => rd.changeRate(+1), repeat: true, shift: true },
    ']': { fn: () => rd.changeRate(+1), repeat: true },
    '-': { fn: () => rd.changeRate(-1), repeat: true },
    _: { fn: () => rd.changeRate(-1), repeat: true, shift: true },
    '[': { fn: () => rd.changeRate(-1), repeat: true },
    0: { fn: () => rd.changeRate(0) },
    Escape: { fn: () => rd.stop() },
  };
  const SCROLL_KEYS = new Set(['PageDown', 'PageUp', 'Home', 'End']);
  const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], ' +
    '[contenteditable="plaintext-only"]';
  const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, video, audio, ' +
    '[role="button"], [role="link"], [role="tab"], [role="menuitem"], [contenteditable=""], ' +
    '[contenteditable="true"]';

  const editable = t => t?.nodeType === 1 && (t.isContentEditable || !!t.closest(EDITABLE));
  const swallowed = new Set();

  // An orphaned copy (extension reloaded) must stop and get out of the way.
  function orphaned() {
    if (P.alive()) return false;
    if (rd.state !== 'off') rd.stop();
    return true;
  }

  addEventListener('keydown', e => {
    if (rd.state === 'off' || orphaned()) return;
    if (SCROLL_KEYS.has(e.key)) return rd.userScrolled();
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (editable(e.composedPath()[0])) return;
    const act = KEYS[e.key];
    if (!act || (e.shiftKey && !act.shift)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowed.add(e.code);
    if (!e.repeat || act.repeat) act.fn();
  }, true);

  // Keep the page from also acting on the keys we used.
  for (const type of ['keypress', 'keyup']) {
    addEventListener(type, e => {
      if (!swallowed.has(e.code)) return;
      if (type === 'keyup') swallowed.delete(e.code);
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      return p && { node: p.offsetNode, offset: p.offset };
    }
    const r = document.caretRangeFromPoint?.(x, y);
    return r && { node: r.startContainer, offset: r.startOffset };
  }

  // Only count clicks that actually land on a character, not blank space beside text.
  function onText({ node, offset }, x, y) {
    if (node?.nodeType !== 3) return false;
    const r = document.createRange();
    for (const o of [offset, offset - 1]) {
      if (o < 0 || o >= node.length) continue;
      r.setStart(node, o);
      r.setEnd(node, o + 1);
      for (const b of r.getClientRects()) {
        if (x >= b.left - 4 && x <= b.right + 4 && y >= b.top - 3 && y <= b.bottom + 3) return true;
      }
    }
    return false;
  }

  addEventListener('click', e => {
    if (rd.state === 'off' || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (orphaned()) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // they were selecting text
    const t = e.composedPath()[0];
    const el = t?.nodeType === 1 ? t : t?.parentElement;
    if (!el || R.hud.isHud(el)) return;
    if (el.closest(INTERACTIVE) && !e.altKey) return; // let links and buttons work
    const cp = caretAt(e.clientX, e.clientY);
    if (!cp || !onText(cp, e.clientX, e.clientY)) return;
    if (rd.jumpTo(cp.node, cp.offset) && e.altKey) {
      e.preventDefault(); // Alt+click on a link would otherwise download it
      e.stopImmediatePropagation();
    }
  }, true);

  const scrolled = () => { if (rd.state !== 'off') rd.userScrolled(); };
  addEventListener('wheel', scrolled, { passive: true, capture: true });
  addEventListener('touchmove', scrolled, { passive: true, capture: true });
  addEventListener('pagehide', () => rd.stop());
})();
