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
    const blockOf = el => {
      while (el && el !== root && isInline(el)) el = el.parentElement;
      return el || root;
    };
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
    let cur = null;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 3) {
          return cs(n.parentElement).visibility === 'visible' ? NodeFilter.FILTER_ACCEPT :
            NodeFilter.FILTER_SKIP;
        }
        if (SKIP.has(n.localName) || gone(n)) return NodeFilter.FILTER_REJECT;
        if (n.localName === 'sup' && REF.test(n.textContent)) return NodeFilter.FILTER_REJECT;
        return n.localName === 'br' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    for (let n; (n = tw.nextNode());) {
      const b = blockOf(n.parentElement);
      if (n.nodeType === 1) { // <br>: a space so lines don't run together
        if (cur && cur.el === b) {
          cur.segs.push({ node: null, start: cur.text.length, end: cur.text.length + 1 });
          cur.text += ' ';
        }
        continue;
      }
      const data = n.data;
      if (!data) continue;
      if (!cur || cur.el !== b) {
        if (!/\S/.test(data)) continue;
        cur = { el: b, text: '', segs: [], sents: null };
        blocks.push(cur);
      }
      where.set(n, { block: cur, seg: cur.segs.length });
      cur.segs.push({ node: n, start: cur.text.length, end: cur.text.length + data.length });
      cur.text += data.replace(/\s/g, ' ');
    }

    const out = blocks.filter(b => WORDISH.test(b.text));
    out.forEach((b, i) => { b.i = i; });
    return { blocks: out, where, root, builtAt: performance.now() };
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

  // Block offset -> [textNode, offset]. Synthetic <br> spaces snap to the nearest real text.
  function domPoint(block, off, isEnd) {
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
      return isEnd ? [n, n.length] : [n, 0];
    }
    const s = segs[i];
    return [s.node, Math.max(0, Math.min(off - s.start, s.node.length))];
  }

  function rangeOf(block, a, e) {
    const p = domPoint(block, a, false), q = domPoint(block, e, true);
    if (!p || !q) return null;
    try {
      const r = document.createRange();
      r.setStart(p[0], p[1]);
      r.setEnd(q[0], q[1]);
      return r;
    } catch {
      return null;
    }
  }

  // DOM point -> { b, off } in the model, or null if that text isn't part of it.
  function locate(model, node, offset) {
    if (node.nodeType === 1) {
      const child = node.childNodes[offset] || node;
      const tw = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      const t = child.nodeType === 3 ? child : tw.nextNode();
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

  // First block that starts at or after `node` in document order, or -1.
  function blockAtOrAfter(model, node) {
    if (!node.isConnected) return -1;
    const bs = model.blocks;
    let lo = 0, hi = bs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const f = firstNode(bs[mid]);
      const after = f === node || (node.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (after) hi = mid;
      else lo = mid + 1;
    }
    return lo < bs.length ? lo : -1;
  }

  function pinned(el, cache) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
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
      const rect = rangeOf(b, 0, b.text.length)?.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) continue;
      if (rect.bottom <= 0 || rect.top >= vh) continue;
      const ss = sentences(b);
      for (let s = 0; s < ss.length; s++) {
        const rr = rangeOf(b, ss[s].start, ss[s].end)?.getBoundingClientRect();
        if (rr && rr.bottom > 0) return { b: b.i, s, off: ss[s].start };
      }
    }
    const b0 = model.blocks[0];
    return b0 ? { b: 0, s: 0, off: sentences(b0)[0].start } : null;
  }

  R.model = { build, sentences, words, sentenceAt, wordAt, domPoint, rangeOf, locate,
    blockAtOrAfter, firstNode, firstVisible };
})();
