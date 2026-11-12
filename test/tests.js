// In-page test suite. Open test/index.html (served over http) and call runTests(),
// or add ?auto to run on load. Results land in window.__results and the console.
(() => {
  const R = globalThis.__rip, M = R.model, rd = R.reader, P = R.platform;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 3000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(10); }
    return false;
  };
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const wordText = () => [...(CSS.highlights.get('rip-word') || [])][0]?.toString() || '';
  const sentText = () => norm([...(CSS.highlights.get('rip-sentence') || [])][0]?.toString() || '');
  const speaks = () => R.testLog.filter(e => e.t === 'speak');
  const lastSpeak = () => speaks().at(-1)?.text || '';
  const key = (k, target = window, extra = {}) => {
    const ev = new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(ev);
    target.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k, bubbles: true, cancelable: true }));
    return ev;
  };
  const blockText = id => {
    const m = M.build();
    return m.blocks.filter(b => b.el.id === id).map(b => norm(b.text));
  };
  function wordRect(el, word) {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      const i = n.data.indexOf(word);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i); r.setEnd(n, i + word.length);
        return r.getBoundingClientRect();
      }
    }
  }
  // The innermost element at a point, inside open shadow roots too, as a real click would hit.
  function deepElementAt(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }
  const click = (el, word, extra = {}) => {
    const r = wordRect(el, word);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, ...extra });
    deepElementAt(ev.clientX, ev.clientY).dispatchEvent(ev);
    return ev;
  };
  const inShadow = (hostId, sel) => document.getElementById(hostId).shadowRoot.querySelector(sel);
  const allText = (opts) => M.build(document.body, opts).blocks.map(b => norm(b.text));
  const textIn = (el, word) => {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { const i = n.data.indexOf(word); if (i >= 0) return [n, i]; }
  };
  // Selects from the start of `a` in elA to `chars` characters into `b` in elB (whole word if omitted).
  function select(elA, a, elB, b, chars) {
    const find = (el, word) => {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) { const i = n.data.indexOf(word); if (i >= 0) return [n, i]; }
    };
    const [sn, si] = find(elA, a), [en, ei] = find(elB, b);
    const r = document.createRange();
    r.setStart(sn, si); r.setEnd(en, ei + (chars ?? b.length));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }
  const $ = id => document.getElementById(id);
  function menuReset() {
    rd.stop();
    R.testLog.length = 0;
    P.fake.noWords = false; P.fake.msPerWord = 20; P.fake.failSpeak = null;
  }

  async function fresh(at) {
    rd.stop();
    R.testLog.length = 0;
    P.fake.noWords = false; P.fake.msPerWord = 40; P.fake.cap = 4;
    P.fake.noVoices = false; P.fake.failSpeak = null;
    P._store.rate = 1;
    if (at) document.getElementById(at).scrollIntoView({ block: 'center' });
    await rd.start();
    await waitFor(() => speaks().length > 0);
  }

  const tests = {
    'model: inline formatting joins into one block'() {
      const t = blockText('p1')[0];
      if (!t.startsWith('The first paragraph has bold and italic words.')) throw t;
    },
    'model: hidden, aria-hidden, sr-only, textarea, button excluded'() {
      const all = M.build().blocks.map(b => b.text).join(' | ');
      for (const bad of ['must never be read', 'aria hidden', 'Screen reader only', 'Typing area', 'Button label']) {
        if (all.includes(bad)) throw `included: ${bad}`;
      }
    },
    'model: display contents wrapper is read (Karbon email body)'() {
      const t = blockText('pc')[0];
      if (t !== 'Mail inside a display contents wrapper.') throw JSON.stringify(t);
    },
    'model: visible child of a visibility hidden box is read, the rest is not'() {
      const all = M.build().blocks.map(b => b.text).join(' | ');
      if (!all.includes('Shown again inside a hidden box.')) throw 'child missing';
      if (all.includes('Invisible lead text')) throw 'hidden text included';
    },
    'model: lenient build reads aria-hidden text, strict does not'() {
      if (blockText('ap').length) throw 'strict included it';
      const b = M.build(document.body, { lenient: true }).blocks.find(x => x.el.id === 'ap');
      if (!b) throw 'lenient missed it';
      if (M.build(document.body, { lenient: true }).blocks.some(x => /must never be read/.test(x.text))) {
        throw 'lenient read display:none text';
      }
    },
    'model: citation markers skipped'() {
      const t = blockText('cite')[0];
      if (t.includes('[12]')) throw t;
    },
    'model: br becomes a space'() {
      const t = blockText('p2')[0];
      if (!t.includes('break. This line')) throw t;
    },
    'model: nested blocks split loose div text'() {
      const t = blockText('mixed');
      if (t.length !== 2 || t[0] !== 'Loose text in a div.' || t[1] !== 'More loose text.') throw JSON.stringify(t);
    },
    'model: flex children are separate blocks'() {
      const m = M.build();
      const f = m.blocks.filter(b => b.el.parentElement?.id === 'flex').map(b => b.text);
      if (f.length !== 2) throw JSON.stringify(f);
    },
    'model: sentences split, abbreviations mostly kept'() {
      const m = M.build(), b = m.blocks.find(x => x.el.id === 'p1');
      const ss = M.sentences(b).map(s => b.text.slice(s.start, s.end));
      if (ss[0] !== 'The first paragraph has bold and italic words.') throw JSON.stringify(ss);
      if (ss.length < 3) throw JSON.stringify(ss);
    },
    'model: long sentence split under limit'() {
      const m = M.build(), b = m.blocks.find(x => x.el.id === 'long');
      const ss = M.sentences(b);
      if (ss.length < 2 || ss.some(s => s.end - s.start > 360)) throw JSON.stringify(ss.map(s => s.end - s.start));
    },
    'model: every word maps to an exact DOM range'() {
      const m = M.build();
      let n = 0;
      for (const b of m.blocks) for (const s of M.sentences(b)) for (const w of M.words(b, s)) {
        const r = M.rangeOf(b, w.start, w.end);
        if (norm(r.toString()) !== norm(b.text.slice(w.start, w.end))) throw `${b.text.slice(w.start, w.end)} != ${r}`;
        n++;
      }
      if (n < 100) throw `only ${n} words`;
    },
    async 'reader: starts at first visible text, skipping fixed header'() {
      scrollTo(0, 0);
      await fresh();
      if (lastSpeak() !== 'Testing the reader') throw lastSpeak();
      if (R.hud.text() !== 'Reading · 1x') throw R.hud.text();
    },
    async 'reader: word highlight follows word events'() {
      scrollTo(0, 0);
      await fresh();
      await waitFor(() => sentText().startsWith('The first paragraph'));
      const seen = new Set();
      await waitFor(() => { seen.add(wordText()); return seen.has('italic'); });
      if (!seen.has('bold') || !seen.has('italic')) throw [...seen].join(',');
    },
    async 'reader: auto advances through sentences in order'() {
      scrollTo(0, 0);
      await fresh();
      await waitFor(() => speaks().length >= 4, 5000);
      const t = speaks().map(s => s.text);
      if (t[1] !== 'The first paragraph has bold and italic words.') throw JSON.stringify(t);
      if (!t[2].startsWith('It also has a link')) throw JSON.stringify(t);
    },
    async 'keys: space pauses and resumes from the same word'() {
      scrollTo(0, 0);
      await fresh();
      await waitFor(() => wordText() === 'bold');
      key(' ');
      if (rd.state !== 'paused') throw rd.state;
      const w = wordText();
      await wait(200);
      if (wordText() !== w) throw 'highlight moved while paused';
      key(' ');
      if (rd.state !== 'playing') throw rd.state;
      if (!lastSpeak().startsWith(w)) throw `resumed at "${lastSpeak()}" not "${w}"`;
    },
    async 'keys: right and left move by sentence'() {
      scrollTo(0, 0);
      P.fake.msPerWord = 400;
      await fresh();
      P.fake.msPerWord = 400;
      key('ArrowRight');
      if (!lastSpeak().startsWith('The first paragraph')) throw lastSpeak();
      key('ArrowRight');
      if (!lastSpeak().startsWith('It also has')) throw lastSpeak();
      key('ArrowLeft'); // on first word: previous sentence
      if (!lastSpeak().startsWith('The first paragraph')) throw lastSpeak();
      await waitFor(() => wordText() === 'paragraph');
      key('ArrowLeft'); // mid sentence: restart it
      if (!lastSpeak().startsWith('The first paragraph')) throw lastSpeak();
    },
    async 'keys: down and up move by paragraph'() {
      scrollTo(0, 0);
      P.fake.msPerWord = 400;
      await fresh();
      key('ArrowDown');
      if (!lastSpeak().startsWith('The first paragraph')) throw lastSpeak();
      key('ArrowDown');
      if (!lastSpeak().startsWith('Second paragraph')) throw lastSpeak();
      key('ArrowUp');
      if (!lastSpeak().startsWith('The first paragraph')) throw lastSpeak();
    },
    async 'keys: speed steps, caps at voice max, resets'() {
      scrollTo(0, 0);
      await fresh();
      key('=');
      if (rd.st.rate !== 1.25) throw rd.st.rate;
      if (speaks().at(-1).rate !== 1.25) throw 'did not restart at new rate';
      for (let i = 0; i < 30; i++) key(']');
      if (rd.st.rate !== 4) throw rd.st.rate;
      if (!R.hud.text().includes('top speed')) throw R.hud.text();
      for (let i = 0; i < 30; i++) key('-');
      if (rd.st.rate !== 0.5) throw rd.st.rate;
      key('0');
      if (rd.st.rate !== 1) throw rd.st.rate;
      if (P._store.rate !== 1) throw 'not saved';
    },
    async 'keys: plus with shift works, shift+arrow ignored'() {
      scrollTo(0, 0);
      await fresh();
      key('+', window, { shiftKey: true });
      if (rd.st.rate !== 1.25) throw rd.st.rate;
      const ev = key('ArrowRight', window, { shiftKey: true });
      if (ev.defaultPrevented) throw 'swallowed shift+arrow';
    },
    async 'keys: ignored while typing in a field'() {
      scrollTo(0, 0);
      await fresh();
      const ta = document.getElementById('ta');
      const ev = key(' ', ta);
      if (ev.defaultPrevented || rd.state !== 'playing') throw 'space was captured in textarea';
    },
    async 'keys: escape stops and clears highlights'() {
      scrollTo(0, 0);
      await fresh();
      key('Escape');
      if (rd.state !== 'off') throw rd.state;
      if (CSS.highlights.has('rip-word')) throw 'highlight left behind';
      if (document.querySelector('rip-hud')) throw 'hud left behind';
    },
    async 'keys: do nothing when reader is off'() {
      rd.stop();
      const ev = key(' ');
      if (ev.defaultPrevented) throw 'captured space while off';
    },
    async 'click: jumps to the clicked word'() {
      scrollTo(0, 0);
      await fresh();
      click(document.getElementById('p2'), 'continues');
      if (!lastSpeak().startsWith('continues after a break.')) throw lastSpeak();
      if (wordText() !== 'continues') throw wordText();
    },
    async 'click: link without alt is left alone, with alt jumps'() {
      scrollTo(0, 0);
      await fresh();
      const n = speaks().length;
      const ev = click(document.getElementById('link'), 'nowhere');
      if (speaks().length !== n || ev.defaultPrevented) throw 'plain link click was hijacked';
      const ev2 = click(document.getElementById('link'), 'nowhere', { altKey: true });
      if (!lastSpeak().startsWith('nowhere')) throw lastSpeak();
      if (!ev2.defaultPrevented) throw 'alt+click not prevented';
    },
    async 'click: blank space beside text does nothing'() {
      scrollTo(0, 0);
      await fresh();
      const n = speaks().length;
      const r = document.getElementById('title').getBoundingClientRect();
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.right - 5, clientY: r.top + r.height / 2 });
      document.elementFromPoint(ev.clientX, ev.clientY).dispatchEvent(ev);
      if (speaks().length !== n) throw `jumped to "${lastSpeak()}"`;
    },
    async 'click: resumes when paused'() {
      scrollTo(0, 0);
      await fresh();
      key(' ');
      click(document.getElementById('p1'), 'Tuesday');
      if (rd.state !== 'playing' || !lastSpeak().startsWith('Tuesday')) throw rd.state + ' ' + lastSpeak();
    },
    async 'estimator: highlights words when voice sends none'() {
      scrollTo(0, 0);
      await fresh();
      P.fake.noWords = true;
      rd.st.voice.hasWord = false;
      click(document.getElementById('p1'), 'first');
      const seen = new Set();
      await waitFor(() => { seen.add(wordText()); return seen.size >= 3; }, 3000);
      if (seen.size < 3) throw [...seen].join(',');
    },
    async 'dynamic: new content appended later gets read'() {
      document.getElementById('end').scrollIntoView({ block: 'center' });
      await fresh();
      click(document.getElementById('end'), 'final');
      if (!lastSpeak().startsWith('final paragraph')) throw lastSpeak();
      const p = document.createElement('p');
      p.id = 'added';
      p.textContent = 'Freshly added text.';
      document.getElementById('end').after(p);
      rd.st.model.builtAt -= 5000;
      await waitFor(() => lastSpeak() === 'Freshly added text.', 3000);
      p.remove();
      if (!speaks().some(s => s.text === 'Freshly added text.')) throw JSON.stringify(speaks().map(s => s.text));
    },
    async 'scroll: follows into a nested scroll box'() {
      const box = document.getElementById('box');
      box.scrollIntoView({ block: 'center' });
      box.scrollTop = 0;
      await wait(50);
      await fresh();
      P.fake.msPerWord = 250; // about real speech pace
      click(document.getElementById('b1'), 'first');
      const done = await waitFor(() => sentText().startsWith('The last line'), 15000);
      await wait(600);
      key(' ');
      if (!done) throw sentText();
      if (box.scrollTop < 20) throw `box did not scroll (${box.scrollTop})`;
      const r = wordRect(document.getElementById('bLast'), 'last'), br = box.getBoundingClientRect();
      if (r.top < br.top || r.bottom > br.bottom) throw `word not visible in box: ${[r.top, r.bottom, br.top, br.bottom, box.scrollTop, scrollY].map(Math.round)}`;
    },
    async 'end of page: stops and says so'() {
      document.getElementById('end').scrollIntoView({ block: 'center' });
      await fresh();
      click(document.getElementById('end'), 'final');
      await waitFor(() => rd.state === 'off', 3000);
      if (rd.state !== 'off') throw rd.state;
      if (R.hud.text() !== 'End of page') throw R.hud.text();
    },
    async 'hud: collapsed shows pause button and speed'() {
      scrollTo(0, 0);
      await fresh();
      const H = R.hud;
      if (H._el('.rate').textContent !== '1x') throw H._el('.rate').textContent;
      if (H._el('.pp').getAttribute('aria-label') !== 'Pause (Space)') throw H._el('.pp').getAttribute('aria-label');
      if (getComputedStyle(H._el('.stop')).display !== 'none') throw 'controls open without hover';
    },
    async 'hud: pause button pauses and resumes'() {
      scrollTo(0, 0);
      await fresh();
      R.hud._click('.pp');
      if (rd.state !== 'paused') throw rd.state;
      if (R.hud._el('.pp').getAttribute('aria-label') !== 'Resume (Space)') throw 'icon not updated';
      R.hud._click('.pp');
      if (rd.state !== 'playing') throw rd.state;
    },
    async 'hud: speed buttons step and disable at the limits'() {
      scrollTo(0, 0);
      await fresh();
      R.hud._click('.faster');
      if (rd.st.rate !== 1.25 || R.hud._el('.rate').textContent !== '1.25x') throw rd.st.rate;
      for (let i = 0; i < 30; i++) R.hud._click('.faster');
      if (rd.st.rate !== 4 || !R.hud._el('.faster').disabled) throw `rate ${rd.st.rate}`;
      if (!R.hud._el('.faster').title.includes('top speed')) throw R.hud._el('.faster').title;
      for (let i = 0; i < 30; i++) R.hud._click('.slower');
      if (rd.st.rate !== 0.5 || !R.hud._el('.slower').disabled) throw `rate ${rd.st.rate}`;
      key('0');
      if (R.hud._el('.slower').disabled || R.hud._el('.faster').disabled) throw 'still disabled at 1x';
    },
    async 'hud: settings button opens settings'() {
      scrollTo(0, 0);
      await fresh();
      R.hud._click('.settings');
      if (!R.testLog.some(e => e.t === 'openSettings')) throw 'not requested';
      if (rd.state !== 'playing') throw 'reading was interrupted';
    },
    async 'hud: stop button stops and removes it'() {
      scrollTo(0, 0);
      await fresh();
      R.hud._click('.stop');
      if (rd.state !== 'off' || document.querySelector('rip-hud')) throw rd.state;
    },
    async 'hud: clicking it never moves the reading position'() {
      scrollTo(0, 0);
      await fresh();
      const n = speaks().length;
      const r = document.querySelector('rip-hud') && R.hud._el('.rate').getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const target = document.elementFromPoint(x, y);
      if (target?.localName !== 'rip-hud') throw `hit ${target?.localName}`;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
      if (speaks().length !== n) throw 'jumped';
    },
    'speed: engine rate inverts a measured curve'() {
      const C = RIP_COMMON, near = (a, b) => Math.abs(a - b) < 0.02;
      // Measured from Google US English in Chrome 157 on Linux, 2026-11-10.
      const g = { voiceName: 'Google US English', remote: true };
      const caps = { [g.voiceName]: { best: 3.74, table: [
        { rate: 1, speedup: 1 }, { rate: 1.25, speedup: 1.4 }, { rate: 2, speedup: 3.74 }] } };
      if (!near(C.engineRate(g, caps, 1), 1)) throw 'at 1x';
      if (!near(C.engineRate(g, caps, 1.4), 1.25)) throw 'at a point';
      const mid = C.engineRate(g, caps, 2);
      if (!(mid > 1.25 && mid < 2)) throw 'between points: ' + mid;
      if (!near(C.engineRate(g, caps, 9), 2)) throw 'past the top';
      if (C.capFor(g, caps) !== 3.5) throw 'cap ' + C.capFor(g, caps);
    },
    'speed: unmeasured Google voices assume rate squared, others linear'() {
      const C = RIP_COMMON, near = (a, b) => Math.abs(a - b) < 0.01;
      if (!near(C.engineRate({ voiceName: 'Google UK English Male', remote: true }, {}, 4), 2)) throw 'google';
      if (!near(C.engineRate({ voiceName: 'Samantha', remote: false }, {}, 3), 3)) throw 'local';
      if (!near(C.engineRate(null, {}, 1.5), 1.5)) throw 'none';
    },
    async 'voices: none at all says so and does not start'() {
      rd.stop();
      R.testLog.length = 0;
      P.fake.noVoices = true;
      try {
        await rd.start();
        if (rd.state !== 'off') throw rd.state;
        if (speaks().length) throw 'spoke';
        if (!R.hud.text().includes('no voices')) throw R.hud.text();
      } finally { P.fake.noVoices = false; }
    },
    async 'voices: an error with no message suggests another voice'() {
      scrollTo(0, 0);
      rd.stop();
      R.testLog.length = 0;
      P.fake.failSpeak = '';
      try {
        await rd.start();
        await waitFor(() => rd.state === 'paused');
        if (rd.state !== 'paused') throw rd.state;
        if (!R.hud.text().includes('Try another voice')) throw R.hud.text();
      } finally { P.fake.failSpeak = null; rd.stop(); }
    },
    async 'voices: an error with a message shows it'() {
      scrollTo(0, 0);
      rd.stop();
      P.fake.failSpeak = 'synthesis-failed';
      try {
        await rd.start();
        await waitFor(() => rd.state === 'paused');
        if (R.hud.text() !== 'Speech error: synthesis-failed') throw R.hud.text();
      } finally { P.fake.failSpeak = null; rd.stop(); }
    },
    async 'menu: read aloud reads only the selection, finishing the last word'() {
      scrollTo(0, 0);
      menuReset();
      select($('p1'), 'italic', $('p2'), 'starts', 3);
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'italic words.') throw JSON.stringify(t);
      if (t.at(-1) !== 'Second paragraph starts') throw JSON.stringify(t);
      if (R.hud.text() !== 'End of selection') throw R.hud.text();
    },
    async 'menu: read aloud from here keeps going past the selection'() {
      scrollTo(0, 0);
      menuReset();
      select($('p1'), 'italic', $('p1'), 'words');
      P._read(true);
      await waitFor(() => speaks().some(x => x.text.startsWith('Second paragraph')), 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'italic words.') throw JSON.stringify(t);
      if (!t.some(x => x.startsWith('Second paragraph'))) throw JSON.stringify(t);
      rd.stop();
    },
    async 'menu: while reading, jumps to the selection and stops at its end'() {
      scrollTo(0, 0);
      await fresh();
      select($('p2'), 'continues', $('p2'), 'break');
      P._read(false);
      await waitFor(() => rd.state === 'off', 5000);
      getSelection().removeAllRanges();
      if (lastSpeak() !== 'continues after a break') throw lastSpeak();
      if (R.hud.text() !== 'End of selection') throw R.hud.text();
    },
    async 'menu: moving past the selection reads on'() {
      scrollTo(0, 0);
      menuReset();
      P.fake.msPerWord = 200;
      select($('p1'), 'italic', $('p1'), 'words');
      P._read(false);
      await waitFor(() => speaks().length > 0);
      getSelection().removeAllRanges();
      key('ArrowDown');
      await waitFor(() => speaks().length >= 2);
      P.fake.msPerWord = 20;
      await waitFor(() => speaks().length >= 4, 5000);
      if (rd.state === 'off') throw 'stopped at the selection end';
      rd.stop();
    },
    async 'menu: a selection ending on an element boundary stops there'() {
      scrollTo(0, 0);
      menuReset();
      const r = document.createRange();
      r.selectNodeContents($('p1'));
      getSelection().removeAllRanges(); getSelection().addRange(r);
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (!t[0].startsWith('The first paragraph')) throw JSON.stringify(t);
      if (t.some(x => x.startsWith('Second paragraph'))) throw JSON.stringify(t);
      if (R.hud.text() !== 'End of selection') throw R.hud.text();
    },
    async 'menu: a selection starting in a skipped citation reads the text after it'() {
      scrollTo(0, 0);
      menuReset();
      select($('cite').querySelector('sup'), '12', $('cite'), 'sentence');
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      if (lastSpeak() !== 'Another sentence') throw JSON.stringify(speaks().map(x => x.text));
    },
    async 'dynamic: current paragraph hidden mid-read moves on without stalling'() {
      scrollTo(0, 0);
      await fresh();
      P.fake.msPerWord = 120;
      await waitFor(() => sentText().startsWith('The first paragraph'), 5000);
      const extra = document.createElement('p');
      extra.textContent = 'Appended.';
      try {
        rd.st.model.builtAt = -1e9; // as if built long ago, so the change forces a rebuild
        $('p1').setAttribute('aria-hidden', 'true');
        document.body.append(extra);
        P.fake.msPerWord = 20;
        await waitFor(() => lastSpeak().startsWith('Second paragraph'), 5000);
        if (!lastSpeak().startsWith('Second paragraph')) throw lastSpeak();
        if (rd.state !== 'playing') throw rd.state;
      } finally { $('p1').removeAttribute('aria-hidden'); extra.remove(); rd.stop(); }
    },
    async 'menu: a selection in a display contents wrapper reads'() {
      menuReset();
      $('pc').scrollIntoView({ block: 'center' });
      select($('pc'), 'inside', $('pc'), 'wrapper');
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'inside a display contents wrapper') throw JSON.stringify(t);
    },
    async 'menu: a selection in an aria-hidden pane still reads'() {
      menuReset();
      $('ap').scrollIntoView({ block: 'center' });
      select($('ap'), 'marked', $('ap'), 'screen');
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'marked hidden that is still on screen') throw JSON.stringify(t);
      if (rd.st.lenient) throw 'lenient left on after stop';
    },
    'menu: a notice from the extension shows in the corner'() {
      menuReset();
      P._notice("Glint Reader can't reach the text inside that frame");
      if (!/inside that frame/.test(R.hud.text())) throw R.hud.text();
    },
    async 'menu: a selection in a text field says it cannot be read'() {
      scrollTo(0, 0);
      menuReset();
      getSelection().removeAllRanges();
      const ta = $('ta');
      ta.focus(); ta.setSelectionRange(0, 6);
      P._read(false);
      await wait(50);
      ta.blur();
      if (rd.state !== 'off') throw rd.state;
      if (!/typing box/.test(R.hud.text())) throw R.hud.text();
      if (speaks().length) throw 'spoke';
    },
    'shadow: text in an open shadow root is read, with the usual visibility rules'() {
      const all = allText();
      if (!all.includes('Words inside an open shadow root.')) throw 'open shadow text missing';
      if (all.some(t => t.includes('Hidden shadow text'))) throw 'display:none text in a shadow root was read';
      if (!all.includes('Text in a contents host.')) throw 'text in a display: contents host missing';
    },
    'shadow: a nested shadow root is read in place, inside its sentence'() {
      const all = allText();
      if (!all.includes('Outer text runs into nested shadow and back out.')) {
        throw JSON.stringify(all.filter(t => /Outer|nested/.test(t)));
      }
    },
    'shadow: slotted text is read once, where its slot is'() {
      const want = ['Before the components.', 'Words inside an open shadow root.',
        'Outer text runs into nested shadow and back out.', 'Card heading.', 'Slotted beta comes first.',
        'Between the slots.', 'Slotted alpha comes last.', 'Default slot text.', 'Text in a contents host.',
        'Shadow box line one.'];
      const all = allText();
      const i = all.indexOf(want[0]);
      const got = all.slice(i, i + want.length);
      if (JSON.stringify(got) !== JSON.stringify(want)) throw JSON.stringify(got);
      for (const w of want) {
        const n = all.filter(t => t === w).length;
        if (n !== 1) throw `"${w}" read ${n} times`;
      }
      if (all.some(t => t.includes('Fallback text'))) throw 'unused slot fallback was read';
    },
    'shadow: a closed shadow root is skipped'() {
      if (allText().some(t => t.includes('Closed shadow text'))) throw 'strict model read it';
      if (allText({ lenient: true }).some(t => t.includes('Closed shadow text'))) throw 'lenient model read it';
    },
    'shadow: a block across trees maps to one range per tree'() {
      const m = M.build(), b = m.blocks.find(x => norm(x.text).startsWith('Outer text runs'));
      const rs = M.rangesOf(b, 0, b.text.length);
      if (rs.length !== 3) throw `${rs.length} ranges`;
      if (norm(rs.map(String).join('')) !== norm(b.text)) throw rs.map(String).join('|');
      const w = M.words(b, M.sentences(b)[0]).find(x => b.text.slice(x.start, x.end) === 'nested');
      const wr = M.rangesOf(b, w.start, w.end);
      if (wr.length !== 1 || String(wr[0]) !== 'nested') throw wr.map(String).join('|');
      if (wr[0].startContainer.getRootNode() !== inShadow('host2', '#inhost').shadowRoot) throw 'wrong tree';
    },
    async 'shadow: click reads a word in a shadow root, and its highlight paints there'() {
      $('host1').scrollIntoView({ block: 'center' });
      await fresh();
      const s1 = inShadow('host1', '#s1');
      click(s1, 'inside');
      if (!lastSpeak().startsWith('inside an open shadow root.')) throw lastSpeak();
      if (wordText() !== 'inside') throw wordText();
      const r = [...CSS.highlights.get('rip-word')][0];
      if (r.startContainer.getRootNode() !== $('host1').shadowRoot) throw 'range not in the shadow root';
      const want = getComputedStyle(document.documentElement, '::highlight(rip-word)').backgroundColor;
      const got = getComputedStyle(s1, '::highlight(rip-word)').backgroundColor;
      if (want === 'rgba(0, 0, 0, 0)' || got !== want) throw `shadow text gets ${got}, page has ${want}`;
      rd.stop();
    },
    async 'shadow: a sentence across a nested shadow root highlights every part'() {
      $('host2').scrollIntoView({ block: 'center' });
      await fresh();
      P.fake.msPerWord = 300;
      const outer = inShadow('host2', '#outer');
      rd.jumpTo(outer.firstChild, 0);
      if (lastSpeak() !== 'Outer text runs into nested shadow and back out.') throw lastSpeak();
      const rs = [...CSS.highlights.get('rip-sentence')];
      if (rs.length !== 3) throw `${rs.length} sentence ranges`;
      if (norm(rs.map(String).join('')) !== 'Outer text runs into nested shadow and back out.') throw rs.join('|');
      await waitFor(() => wordText() === 'nested', 3000);
      if (wordText() !== 'nested') throw wordText();
      rd.stop();
    },
    async 'shadow: read aloud on a selection inside a shadow root'() {
      menuReset();
      $('host1').scrollIntoView({ block: 'center' });
      select(inShadow('host1', '#s1'), 'inside', inShadow('host1', '#s1'), 'shadow');
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'inside an open shadow') throw JSON.stringify(t);
      if (R.hud.text() !== 'End of selection') throw R.hud.text();
    },
    async 'shadow: read aloud on slotted text'() {
      menuReset();
      $('host3').scrollIntoView({ block: 'center' });
      select($('host3'), 'beta', $('host3'), 'first');
      P._read(true);
      await waitFor(() => speaks().length >= 2, 5000);
      getSelection().removeAllRanges();
      const t = speaks().map(x => x.text);
      rd.stop();
      if (t[0] !== 'beta comes first.' || t[1] !== 'Between the slots.') throw JSON.stringify(t);
    },
    async 'shadow: a selection from the page into a shadow root reads both sides'() {
      const sel = getSelection();
      if (!sel.getComposedRanges) return; // Chrome before 137 can't report it; nothing to check
      menuReset();
      $('host1').scrollIntoView({ block: 'center' });
      const [a, ai] = textIn($('shIntro'), 'components'), [b, bi] = textIn(inShadow('host1', '#s1'), 'inside');
      sel.setBaseAndExtent(a, ai, b, bi + 'inside'.length);
      P._read(false);
      await waitFor(() => rd.state === 'off' && speaks().length > 0, 5000);
      sel.removeAllRanges();
      const t = speaks().map(x => x.text);
      if (t[0] !== 'components.' || t.at(-1) !== 'Words inside') throw JSON.stringify(t);
    },
    async 'shadow: follows the spoken word in a scroll box inside a shadow root'() {
      const host = $('host6'), box = inShadow('host6', '#sbox');
      host.scrollIntoView({ block: 'center' });
      box.scrollTop = 0;
      await wait(50);
      await fresh();
      P.fake.msPerWord = 400;
      rd.st.autoScrollUntil = 0;
      rd.jumpTo(inShadow('host6', '#sbLast').firstChild, 0);
      await waitFor(() => box.scrollTop > 10, 3000);
      await wait(600);
      key(' ');
      if (box.scrollTop <= 10) throw `box did not scroll (${box.scrollTop})`;
      const r = wordRect(inShadow('host6', '#sbLast'), 'last'), br = box.getBoundingClientRect();
      if (r.top < br.top || r.bottom > br.bottom) throw 'word not visible in the box';
      rd.stop();
    },
    async 'shadow: fallback sheet colors shadow text, leaves page sheets alone, and goes on stop'() {
      const root = $('host1').shadowRoot, s1 = inShadow('host1', '#s1');
      const pageSheet = new CSSStyleSheet();
      pageSheet.replaceSync('p { letter-spacing: 0px; }');
      root.adoptedStyleSheets = [pageSheet];
      const html = root.innerHTML, body = document.body.innerHTML;
      R.hl.alwaysAdopt = true;
      try {
        $('host1').scrollIntoView({ block: 'center' });
        await fresh();
        R.hl.colors({ wordColor: '#00ff00' }); // only the added sheet uses this color
        P.fake.msPerWord = 300;
        rd.jumpTo(s1.firstChild, 0);
        if (root.adoptedStyleSheets.length !== 2) throw `${root.adoptedStyleSheets.length} sheets while reading`;
        if (root.adoptedStyleSheets[0] !== pageSheet) throw 'page sheet moved';
        const c = getComputedStyle(s1, '::highlight(rip-word)').backgroundColor;
        if (c !== 'rgb(0, 255, 0)') throw `word color in the shadow root is ${c}`;
        if (root.innerHTML !== html || document.body.innerHTML !== body) throw 'HTML changed while reading';
        rd.stop();
        const left = root.adoptedStyleSheets;
        if (left.length !== 1 || left[0] !== pageSheet) throw `${left.length} sheets after stop`;
        if (root.innerHTML !== html || document.body.innerHTML !== body) throw 'HTML changed after stop';
        if (CSS.highlights.has('rip-word') || CSS.highlights.has('rip-sentence')) throw 'highlight left behind';
      } finally {
        R.hl.alwaysAdopt = false;
        rd.stop();
        root.adoptedStyleSheets = [];
      }
    },
    async 'no layout change: body HTML untouched while reading'() {
      rd.stop();
      scrollTo(0, 0);
      const before = document.body.innerHTML;
      await fresh();
      await waitFor(() => wordText() === 'italic');
      const during = document.body.innerHTML;
      rd.stop();
      if (before !== during || before !== document.body.innerHTML) throw 'body changed';
    },
  };

  globalThis.runTests = async (filter) => {
    const results = [];
    for (const [name, fn] of Object.entries(tests)) {
      if (filter && !name.includes(filter)) continue;
      try { await fn(); results.push({ name, ok: true }); }
      catch (e) { results.push({ name, ok: false, err: String(e) }); }
    }
    rd.stop();
    scrollTo(0, 0);
    globalThis.__results = results;
    const failed = results.filter(r => !r.ok);
    console.log(`[rip-tests] ${results.length - failed.length}/${results.length} passed`, failed);
    return { passed: results.length - failed.length, total: results.length, failed };
  };
  if (new URLSearchParams(location.search).has('auto')) addEventListener('load', () => runTests());
})();
