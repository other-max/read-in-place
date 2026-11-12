// Paints the spoken word and sentence with the CSS Custom Highlight API. No DOM changes.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.hl) return;
  const C = globalThis.RIP_COMMON;
  let word, sent;

  function ensure() {
    if (!word) {
      word = new Highlight();
      sent = new Highlight();
      word.priority = 2;
      sent.priority = 1;
    }
    // Re-register every time in case the page cleared the registry.
    if (CSS.highlights.get('rip-word') !== word) CSS.highlights.set('rip-word', word);
    if (CSS.highlights.get('rip-sentence') !== sent) CSS.highlights.set('rip-sentence', sent);
  }

  // Text inside a shadow root. The ::highlight() colors are set on the page (insertCSS), and
  // page styles don't match elements inside shadow trees. Chrome's highlight inheritance
  // carries them in from the host anyway, so normally nothing is needed. Where that doesn't
  // happen (older Chrome), the colors are added to that shadow root as a constructed sheet
  // at the end of its adoptedStyleSheets, and taken out again when reading stops.
  const CLEAR = 'rgba(0, 0, 0, 0)';
  const native = new WeakMap(); // shadow root -> page colors reach it
  const adopted = new Set(); // shadow roots holding our sheet
  let sheet = null, css = C.cssFor(C.DEFAULTS);

  const hlColor = el => getComputedStyle(el, '::highlight(rip-word)').backgroundColor;

  function cover(r) {
    const n = r.startContainer, root = n.getRootNode();
    if (root.nodeType !== 11 || !root.host) return; // not in a shadow tree
    if (adopted.has(root)) {
      // A framework may have replaced the list since. Put the sheet back at the end.
      if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    }
    if (native.get(root) && !R.hl.alwaysAdopt) return;
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el) return; // text right under the shadow root is styled from the host
    if (!R.hl.alwaysAdopt) {
      const want = hlColor(document.documentElement);
      if (want !== CLEAR && hlColor(el) === want) { native.set(root, true); return; }
    }
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    adopted.add(root);
  }

  // Accepts one Range, a list of them, or null.
  function paint(which, rs) {
    ensure();
    const h = which === 'word' ? word : sent;
    h.clear();
    for (const r of [rs].flat()) {
      if (!r) continue;
      h.add(r);
      cover(r);
    }
  }

  R.hl = {
    alwaysAdopt: false, // tests: use the adopted sheet even where page colors reach
    sentence(rs) { paint('sentence', rs); },
    word(rs) { paint('word', rs); },
    // Word and sentence colors from settings, for the adopted sheet.
    colors(s) {
      css = C.cssFor({ ...C.DEFAULTS, ...s });
      sheet?.replaceSync(css);
    },
    clear() {
      word?.clear();
      sent?.clear();
      CSS.highlights.delete('rip-word');
      CSS.highlights.delete('rip-sentence');
      for (const root of adopted) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(x => x !== sheet);
      }
      adopted.clear();
    },
  };
})();
