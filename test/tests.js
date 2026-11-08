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
  const click = (el, word, extra = {}) => {
    const r = wordRect(el, word);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2, button: 0, ...extra });
    document.elementFromPoint(ev.clientX, ev.clientY).dispatchEvent(ev);
    return ev;
  };
  async function fresh(at) {
    rd.stop();
    R.testLog.length = 0;
    P.fake.noWords = false; P.fake.msPerWord = 40; P.fake.cap = 4;
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
