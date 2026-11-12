// Turns the visible page into blocks -> sentences -> words, each mappable to a DOM Range.
// Block text keeps one character per source character, so offsets map straight back.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.model) return;

  const SKIP = new Set(['script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
    'template', 'iframe', 'object', 'embed', 'canvas', 'svg', 'math', 'head', 'button', 'video',
    'audio', 'img', 'picture', 'rip-hud']);
  const WORDISH = /[\p{L}\p{N}]/u;
  const MAX_SENT = 360; // long runs get split so voices don't stall or cut out
  const REF = /^\s*\[[^\]]{1,8}\]\s*$/; // citation markers like [12]

  let sentSeg, wordSeg;
  function segmenters() {
    if (sentSeg) return;
    const lang = document.documentElement.lang || navigator.language || 'en';
    try {
      sentSeg = new Intl.Segmenter(lang, { granularity: 'sentence' });
      wordSeg = new Intl.Segmenter(lang, { granularity: 'word' });
    } catch {
      sentSeg = new Intl.Segmenter('en', { granularity: 'sentence' });
      wordSeg = new Intl.Segmenter('en', { granularity: 'word' });
    }
  }

  // ---- the flat tree: the page as drawn, with open shadow roots and slots filled in ----
  // Closed shadow roots stay out: el.shadowRoot is null for them, so their light DOM
  // children are walked as before and checkVisibility() drops the ones that don't show.

  // Children as drawn: an open shadow root's content instead of the host's own children, and
  // a slot's assigned nodes (or its fallback content when nothing is assigned).
  function flatKids(n) {
    if (n.shadowRoot) return n.shadowRoot.childNodes;
    if (n.localName === 'slot' && n.assignedNodes) {
      const a = n.assignedNodes({ flatten: true });
      if (a.length) return a;
    }
    return n.childNodes;
  }

  const isShadowRoot = n => n?.nodeType === 11 && !!n.host;

  // Parent as drawn: the slot a node is assigned to, or the host for a shadow root's children.
  // assignedSlot is null when the slot is in a closed shadow root.
  function flatParent(n) {
    if (n.assignedSlot) return n.assignedSlot;
    const p = n.parentNode;
    return isShadowRoot(p) ? p.host : p;
  }

  function flatPath(n) {
    const out = [];
    for (let x = n; x; x = flatParent(x)) out.push(x);
    return out.reverse();
  }

  // Order in the flat tree: -1 if a comes first, 1 if b does, 0 if they are the same node.
  // Ancestors come before their descendants. Light DOM only, this is document order.
  function flatCompare(a, b) {
    if (a === b) return 0;
    const pa = flatPath(a), pb = flatPath(b);
    let i = 0;
    while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
    if (i === pa.length) return -1;
    if (i === pb.length) return 1;
    // Same flat parent, so they are siblings in one shadow root, one host, or one slot's
    // assigned nodes, which are in tree order.
    return pa[i].compareDocumentPosition(pb[i]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  const flatContains = (a, n) => flatPath(n).includes(a);

  // Every open shadow root in the page, for Selection.getComposedRanges().
  function shadowRoots(root = document, out = []) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.shadowRoot) {
        out.push(n.shadowRoot);
        shadowRoots(n.shadowRoot, out);
      }
    }
    return out;
  }

  // lenient: also read aria-hidden and screen-reader-only text. Used when the user selected
  // text the strict pass left out, since text they could select is text they can see.
  function build(root = document.body, { lenient = false } = {}) {
    const styles = new Map();
    const cs = el => {
      let s = styles.get(el);
      if (!s) styles.set(el, (s = getComputedStyle(el)));
      return s;
    };
    const isInline = el => /^(inline|contents|ruby)/.test(cs(el).display);
    // Gone with everything inside it. Two traps here, both seen on real sites:
    // - display: contents draws no box, so checkVisibility() says false even though its
    //   children show (Tailwind's "contents" wrapper around Karbon's email bodies).
    // - visibility: hidden can be undone by a child with visibility: visible, so it hides
    //   only the text directly inside it. That is checked per text node instead.
    const gone = el => {
      if (cs(el).display !== 'contents' && !el.checkVisibility()) return true;
      if (lenient) return false;
      if (el.getAttribute('aria-hidden') === 'true') return true;
      const pos = cs(el).position;
      if (pos === 'absolute' || pos === 'fixed') {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 && r.height <= 2) return true; // screen-reader-only text
      }
      return false;
    };

    const blocks = [];
    const where = new Map();
    const roots = new Set(); // open shadow roots read, so the reader can watch them for changes
    let cur = null;

    // Walks the flat tree, the order the page is drawn in: into open shadow roots, and through
    // slots to the light DOM nodes assigned to them, so slotted text is read once, where it
    // shows. el: the element whose children to read. b: the block those children belong to.
    function visit(el, b) {
      if (el.shadowRoot) roots.add(el.shadowRoot);
      for (const n of flatKids(el)) {
        if (n.nodeType === 3) {
          if (cs(el).visibility === 'visible') addText(n, b);
          continue;
        }
        if (n.nodeType !== 1) continue;
        if (SKIP.has(n.localName) || gone(n)) continue;
        if (n.localName === 'sup' && REF.test(n.textContent)) continue;
        if (n.localName === 'br') { // a space so lines don't run together
          if (cur && cur.el === b) {
            cur.segs.push({ node: null, start: cur.text.length, end: cur.text.length + 1 });
            cur.text += ' ';
          }
          continue;
        }
        visit(n, isInline(n) ? b : n);
      }
    }

    function addText(n, b) {
      const data = n.data;
      if (!data) return;
      const scope = n.getRootNode();
      if (!cur || cur.el !== b) {
        if (!/\S/.test(data)) return;
        cur = { el: b, text: '', segs: [], sents: null, scope, mixed: false };
        blocks.push(cur);
      }
      // Text from more than one tree (an inline component inside a paragraph) needs one
      // Range per tree: a Range can't cross a shadow boundary.
      if (scope !== cur.scope) cur.mixed = true;
      where.set(n, { block: cur, seg: cur.segs.length });
      cur.segs.push({ node: n, start: cur.text.length, end: cur.text.length + data.length });
      cur.text += data.replace(/\s/g, ' ');
    }

    visit(root, root);

    const out = blocks.filter(b => WORDISH.test(b.text));
    out.forEach((b, i) => { b.i = i; });
    return { blocks: out, where, root, roots, builtAt: performance.now() };
  }

  function sentences(block) {
    if (block.sents) return block.sents;
    segmenters();
    const t = block.text, out = [];
    const push = (a, e) => {
      while (a < e && t[a] === ' ') a++;
      while (e > a && t[e - 1] === ' ') e--;
      if (e > a && WORDISH.test(t.slice(a, e))) out.push({ start: a, end: e, words: null });
    };
    for (const s of sentSeg.segment(t)) {
      let a = s.index;
      const e = s.index + s.segment.length;
      while (e - a > MAX_SENT) {
        let cut = t.lastIndexOf(', ', a + MAX_SENT);
        if (cut > a + 80) cut += 1;
        else cut = t.lastIndexOf(' ', a + MAX_SENT);
        if (cut <= a) cut = a + MAX_SENT;
        push(a, cut);
        a = cut;
      }
      push(a, e);
    }
    return (block.sents = out);
  }

  function words(block, sent) {
    if (sent.words) return sent.words;
    segmenters();
    const out = [];
    for (const s of wordSeg.segment(block.text.slice(sent.start, sent.end))) {
      if (s.isWordLike) {
        const a = sent.start + s.index;
        out.push({ start: a, end: a + s.segment.length });
      }
    }
    if (!out.length) out.push({ start: sent.start, end: sent.end });
    return (sent.words = out);
  }

  const sentenceAt = (sents, off) => {
    const i = sents.findIndex(s => s.end > off);
    return i < 0 ? sents.length - 1 : i;
  };
  const wordAt = (block, sent, off) => {
    const ws = words(block, sent);
    return ws.find(w => w.end > off) || ws[ws.length - 1];
  };

  // Block offset -> [segment index, offset in its text node], or null. Synthetic <br> spaces
  // snap to the nearest real text.
  function segPoint(block, off, isEnd) {
    const segs = block.segs;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (isEnd ? segs[mid].start < off : segs[mid].start <= off) lo = mid;
      else hi = mid - 1;
    }
    let i = lo;
    if (!segs[i].node) {
      if (isEnd) while (i > 0 && !segs[i].node) i--;
      else while (i < segs.length - 1 && !segs[i].node) i++;
      const n = segs[i].node;
      if (!n) return null;
      return isEnd ? [i, n.length] : [i, 0];
    }
    const s = segs[i];
    return [i, Math.max(0, Math.min(off - s.start, s.node.length))];
  }

  // Block offset -> [textNode, offset].
  function domPoint(block, off, isEnd) {
    const p = segPoint(block, off, isEnd);
    return p && [block.segs[p[0]].node, p[1]];
  }

  function makeRange(n1, o1, n2, o2) {
    try {
      const r = document.createRange();
      r.setStart(n1, o1);
      r.setEnd(n2, o2);
      return r;
    } catch {
      return null;
    }
  }

  // The Ranges covering block text a..e: one, or one per run of text in the same tree when
  // the block mixes light DOM and shadow DOM text. A Range across trees would collapse, and
  // one around a shadow host doesn't cover the text drawn inside it.
  function rangesOf(block, a, e) {
    const p = segPoint(block, a, false), q = segPoint(block, e, true);
    if (!p || !q) return [];
    const segs = block.segs;
    if (!block.mixed) {
      const r = makeRange(segs[p[0]].node, p[1], segs[q[0]].node, q[1]);
      return r ? [r] : [];
    }
    const out = [];
    let first = null, last = null;
    const flush = () => {
      if (!first) return;
      const r = makeRange(first.node, first === segs[p[0]] ? p[1] : 0,
        last.node, last === segs[q[0]] ? q[1] : last.node.length);
      if (r) out.push(r);
    };
    for (let i = p[0]; i <= q[0]; i++) {
      const s = segs[i];
      if (!s.node) continue;
      if (first && s.node.getRootNode() !== first.node.getRootNode()) { flush(); first = null; }
      first ||= s;
      last = s;
    }
    flush();
    return out;
  }

  // One Range for block text a..e. For a block mixing trees, only the first tree's part.
  const rangeOf = (block, a, e) => rangesOf(block, a, e)[0] || null;

  // The box around block text a..e, across all its Ranges.
  function rectOf(block, a, e) {
    let box = null;
    for (const r of rangesOf(block, a, e)) {
      const b = r.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      box = box ? { top: Math.min(box.top, b.top), bottom: Math.max(box.bottom, b.bottom),
        left: Math.min(box.left, b.left), right: Math.max(box.right, b.right) } :
        { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    }
    if (box) { box.width = box.right - box.left; box.height = box.bottom - box.top; }
    return box;
  }

  // First text node in the flat tree at or under n.
  function firstText(n) {
    if (n.nodeType === 3) return n;
    for (const k of flatKids(n)) {
      const t = firstText(k);
      if (t) return t;
    }
    return null;
  }

  // DOM point -> { b, off } in the model, or null if that text isn't part of it.
  function locate(model, node, offset) {
    if (node.nodeType === 1) {
      const t = firstText(node.childNodes[offset] || node);
      if (!t) return null;
      node = t;
      offset = 0;
    }
    const w = model.where.get(node);
    if (!w || w.block.i === undefined) return null;
    return { b: w.block.i, off: w.block.segs[w.seg].start + Math.min(offset, node.length) };
  }

  function firstNode(block) {
    return block.segs.find(s => s.node)?.node;
  }

  // First block that starts at or after `node` in flat tree order, or -1.
  function blockAtOrAfter(model, node) {
    if (!node.isConnected) return -1;
    const bs = model.blocks;
    let lo = 0, hi = bs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (flatCompare(node, firstNode(bs[mid])) <= 0) hi = mid;
      else lo = mid + 1;
    }
    return lo < bs.length ? lo : -1;
  }

  function pinned(el, cache) {
    for (let e = el; e?.nodeType === 1 && e !== document.body; e = flatParent(e)) {
      if (cache.has(e)) return cache.get(e);
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') { cache.set(el, true); return true; }
    }
    cache.set(el, false);
    return false;
  }

  // Where to start when nothing was clicked: the first sentence showing in the viewport,
  // skipping fixed and sticky headers.
  function firstVisible(model) {
    const vh = innerHeight, cache = new Map();
    for (const b of model.blocks) {
      if (pinned(b.el, cache)) continue;
      const rect = rectOf(b, 0, b.text.length);
      if (!rect) continue;
      if (rect.bottom <= 0 || rect.top >= vh) continue;
      const ss = sentences(b);
      for (let s = 0; s < ss.length; s++) {
        const rr = rectOf(b, ss[s].start, ss[s].end);
        if (rr && rr.bottom > 0) return { b: b.i, s, off: ss[s].start };
      }
    }
    const b0 = model.blocks[0];
    return b0 ? { b: 0, s: 0, off: sentences(b0)[0].start } : null;
  }

  R.model = { build, sentences, words, sentenceAt, wordAt, domPoint, rangeOf, rangesOf, rectOf,
    locate, blockAtOrAfter, firstNode, firstVisible, flatParent, flatCompare, flatContains,
    shadowRoots };
})();
