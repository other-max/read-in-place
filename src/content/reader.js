// Reading state: position, speaking one sentence at a time, navigation, speed.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.reader) return;
  const C = globalThis.RIP_COMMON;
  const M = R.model, hl = R.hl, hud = R.hud, P = R.platform;

  const st = {
    state: 'off', // off | playing | paused
    model: null,
    pos: null, // { b, s, off }: block, sentence, block offset of the current word
    utt: null, // the utterance in flight
    seq: 0,
    rate: 1,
    voice: { voiceName: '', hasWord: true, cap: 4 },
    dirty: false,
    userScrollAt: 0,
    autoScrollUntil: 0,
    mo: null,
    beat: null,
    est: null,
  };

  const NO_VOICES = 'Chrome has no voices on this computer. Open settings for help.';
  const SPEAK_FAILED = "This voice couldn't speak. Try another voice in settings.";

  const block = () => st.model.blocks[st.pos.b];
  const sent = () => M.sentences(block())[st.pos.s];
  const steps = () => C.stepsFor(st.voice.cap || 4);
  const clampRate = r => { const s = steps(); return Math.min(Math.max(r, s[0]), s[s.length - 1]); };
  const refreshHud = () => {
    const s = steps();
    hud.update({ mode: st.state, rate: st.rate, min: s[0], max: s[s.length - 1] });
  };

  async function loadSettings() {
    const s = await P.getSettings();
    const v = await P.voiceInfo(s.voiceName);
    if (v) st.voice = v;
    st.rate = clampRate(s.rate || 1);
  }

  function rebuild() {
    st.model = M.build();
    st.dirty = false;
  }

  function observe() {
    st.mo?.disconnect();
    st.mo = new MutationObserver(() => { st.dirty = true; });
    st.mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function posAt(node, offset) {
    let loc = M.locate(st.model, node, offset);
    if (!loc) { rebuild(); loc = M.locate(st.model, node, offset); }
    if (!loc) return null;
    const b = st.model.blocks[loc.b], ss = M.sentences(b);
    const s = M.sentenceAt(ss, loc.off);
    return { b: loc.b, s, off: M.wordAt(b, ss[s], loc.off).start };
  }

  function fromSelection() {
    const sel = getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return posAt(r.startContainer, r.startOffset);
  }

  // Rebuild after the page changed, keeping our place by DOM position.
  // atEnd: anchor on the end of the current sentence (used when moving on to the next one).
  function rebuildKeeping(atEnd) {
    const b = block(), s = sent();
    const pt = M.domPoint(b, atEnd ? s.end : st.pos.off, atEnd);
    rebuild();
    if (pt && pt[0].isConnected) {
      const loc = M.locate(st.model, pt[0], pt[1]);
      if (loc) {
        const nb = st.model.blocks[loc.b], ss = M.sentences(nb);
        const si = M.sentenceAt(ss, atEnd ? Math.max(0, loc.off - 1) : loc.off);
        st.pos = { b: loc.b, s: si, off: atEnd ? ss[si].start : M.wordAt(nb, ss[si], loc.off).start };
        return true;
      }
      const bi = M.blockAtOrAfter(st.model, pt[0]);
      if (bi >= 0) {
        // atEnd: sit "before" block bi so the next step lands on its first sentence.
        st.pos = atEnd ? { b: bi, s: -1, off: 0 } :
          { b: bi, s: 0, off: M.sentences(st.model.blocks[bi])[0].start };
        return true;
      }
    }
    const p = M.firstVisible(st.model);
    if (!p) return false;
    st.pos = p;
    return true;
  }

  function needsRebuild() {
    if (!st.dirty) return false;
    const n = M.domPoint(block(), st.pos.off, false)?.[0];
    return !n?.isConnected || performance.now() - st.model.builtAt > 3000;
  }

  // ---- speaking ----

  function clearEst() { clearTimeout(st.est); st.est = null; }

  function speak() {
    clearEst();
    const b = block(), s = sent();
    const start = Math.max(st.pos.off ?? s.start, s.start);
    const id = ++st.seq;
    const u = (st.utt = { id, start, end: s.end, gotWord: false, startedAt: 0 });
    paintSentence();
    paintWord(start);
    const n = stepSentence(st.pos, +1), nb = n && st.model.blocks[n.b], ns = nb && M.sentences(nb)[n.s];
    P.speak(id, b.text.slice(start, s.end), { rate: st.rate, voiceName: st.voice.voiceName,
      next: ns ? nb.text.slice(ns.start, ns.end) : '' });
    // If the voice never reports "start", fall back to timing from now. Built-in voices
    // always report it, but loading the model the first time can take several seconds.
    st.est = setTimeout(() => {
      if (st.utt === u && !u.startedAt && !u.gotWord) estimate(u, performance.now());
    }, st.voice.builtIn ? 30000 : 1500);
  }

  // For voices without word events: walk the words at an estimated pace.
  function estimate(u, t0) {
    if (st.utt !== u || u.gotWord) return;
    // The rate is the speed heard, so scale the voice's measured pace (or ~175 wpm) by it.
    const cps = (st.voice.cps || 14.5) * Math.min(st.rate, st.voice.cap || st.rate);
    const ws = M.words(block(), sent()).filter(w => w.end > u.start);
    const tick = () => {
      if (st.utt !== u || u.gotWord || st.state !== 'playing') return;
      const elapsed = (performance.now() - t0) / 1000;
      let cur = null;
      for (const w of ws) {
        if ((Math.max(w.start, u.start) - u.start) / cps <= elapsed) cur = w;
        else break;
      }
      if (cur) paintWord(Math.max(cur.start, u.start));
      st.est = setTimeout(tick, 80);
    };
    tick();
  }

  function onTts(id, ev) {
    const u = st.utt;
    if (!u || id !== u.id || st.state !== 'playing') return;
    switch (ev.type) {
      case 'start':
        u.startedAt = performance.now();
        clearEst();
        st.est = setTimeout(() => {
          if (st.utt === u && !u.gotWord) estimate(u, u.startedAt);
        }, st.voice.hasWord ? 800 : 0);
        break;
      case 'word':
        if (!u.gotWord) { u.gotWord = true; clearEst(); }
        paintWord(u.start + (ev.charIndex || 0));
        break;
      case 'end':
        advance();
        break;
      case 'error':
        pause();
        // Engines often fail without saying why, so point to the usual fix instead.
        hud.message(ev.errorMessage ? `Speech error: ${ev.errorMessage}` : SPEAK_FAILED, 6000);
        break;
    }
  }

  function advance() {
    if (needsRebuild() && !rebuildKeeping(true)) return finish();
    const n = stepSentence(st.pos, +1);
    if (!n) return finish();
    st.pos = n;
    speak();
  }

  // ---- painting and scrolling ----

  function paintSentence() {
    const b = block(), s = sent();
    hl.sentence(M.rangeOf(b, s.start, s.end));
  }

  function paintWord(off) {
    const b = block(), w = M.wordAt(b, sent(), off);
    st.pos.off = w.start;
    const r = M.rangeOf(b, w.start, w.end);
    hl.word(r);
    if (r) follow(r);
  }

  function scroller(el) {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const oy = getComputedStyle(e).overflowY;
      if (/(auto|scroll|overlay)/.test(oy) && e.scrollHeight > e.clientHeight + 4) return e;
    }
    return null;
  }

  // Keep the spoken word on screen, but leave the user alone right after they scroll.
  function follow(r) {
    const now = performance.now();
    if (now - st.userScrollAt < 4000 || now < st.autoScrollUntil) return;
    const rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const sc = scroller(r.startContainer.parentElement);
    const box = sc ? sc.getBoundingClientRect() : { top: 0, height: innerHeight };
    const top = rect.top - box.top, h = Math.min(box.height, innerHeight);
    if (top >= h * 0.12 && rect.bottom - box.top <= h * 0.82) return;
    st.autoScrollUntil = now + 450;
    (sc || window).scrollBy({ top: top - h * 0.33, behavior: 'smooth' });
  }

  // ---- navigation ----

  function stepSentence(pos, dir) {
    const bs = st.model.blocks;
    let b = pos.b, s = pos.s + dir;
    while (b >= 0 && b < bs.length) {
      const ss = M.sentences(bs[b]);
      if (s >= 0 && s < ss.length) return { b, s, off: ss[s].start };
      b += dir;
      if (b < 0 || b >= bs.length) break;
      s = dir > 0 ? 0 : M.sentences(bs[b]).length - 1;
    }
    return null;
  }

  function stepBlock(pos, dir) {
    const b = pos.b + dir;
    if (b < 0 || b >= st.model.blocks.length) return null;
    return { b, s: 0, off: M.sentences(st.model.blocks[b])[0].start };
  }

  function nav(unit, dir) {
    if (st.state === 'off') return;
    if (needsRebuild()) rebuildKeeping(false);
    const b = block(), s = sent();
    let p;
    if (unit === 'sentence') {
      // Back: first to the start of this sentence, then to the one before.
      p = dir < 0 && st.pos.off > M.words(b, s)[0].start ? { ...st.pos, off: s.start } :
        stepSentence(st.pos, dir);
    } else {
      const first = M.sentences(b)[0];
      p = dir < 0 && (st.pos.s > 0 || st.pos.off > M.words(b, first)[0].start) ?
        { b: st.pos.b, s: 0, off: first.start } : stepBlock(st.pos, dir);
    }
    if (!p) return hud.message(dir > 0 ? 'End of page' : 'Start of page');
    st.pos = p;
    st.userScrollAt = 0;
    if (st.state === 'playing') speak();
    else { paintSentence(); paintWord(p.off); }
  }

  // ---- public controls ----

  async function start(at) {
    if (st.state !== 'off') return;
    st.state = 'playing';
    await loadSettings();
    if (st.state !== 'playing') return;
    if (st.voice.none) {
      stop();
      hud.message(NO_VOICES, 6000);
      setTimeout(hideIfOff, 6100);
      return;
    }
    rebuild();
    const pos = at || fromSelection() || M.firstVisible(st.model);
    if (!pos) { stop(); hud.message('Nothing to read here', 1800); setTimeout(hideIfOff, 1900); return; }
    st.pos = pos;
    observe();
    st.beat = setInterval(() => P.send({ type: 'ping' }), 20000);
    P.setState('playing');
    refreshHud();
    speak();
  }

  function stop() {
    if (st.state === 'off') return;
    st.state = 'off';
    clearEst();
    st.utt = null;
    P.stop();
    P.setState('off');
    hl.clear();
    st.mo?.disconnect();
    clearInterval(st.beat);
    hud.hide();
  }

  function hideIfOff() { if (st.state === 'off') hud.hide(); }

  function finish() {
    stop();
    hud.message('End of page', 1800);
    setTimeout(hideIfOff, 1900);
  }

  function pause() {
    if (st.state !== 'playing') return;
    st.state = 'paused';
    clearEst();
    st.utt = null;
    P.stop();
    P.setState('paused');
    refreshHud();
  }

  function resume() {
    if (st.state !== 'paused') return;
    st.state = 'playing';
    if (needsRebuild()) rebuildKeeping(false);
    P.setState('playing');
    refreshHud();
    speak();
  }

  function jumpTo(node, offset) {
    if (st.state === 'off') return false;
    const pos = posAt(node, offset);
    if (!pos) return false;
    st.pos = pos;
    st.userScrollAt = 0;
    if (st.state === 'paused') { st.state = 'playing'; P.setState('playing'); }
    refreshHud();
    speak();
    return true;
  }

  function changeRate(dir) {
    if (st.state === 'off') return;
    const ss = steps();
    const max = ss[ss.length - 1];
    let r;
    if (dir === 0) r = clampRate(1);
    else if (dir > 0) r = ss.find(x => x > st.rate + 1e-9) ?? max;
    else r = [...ss].reverse().find(x => x < st.rate - 1e-9) ?? ss[0];
    if (dir > 0 && r === st.rate) {
      return hud.message(`${C.fmt(max)}x is the top speed for this voice`);
    }
    st.rate = r;
    P.saveSettings({ rate: r });
    refreshHud();
    if (st.state === 'playing') speak(); // restart from the current word at the new speed
  }

  P.on('settings', async changes => {
    if (st.state === 'off') return;
    if (changes.voiceName || changes.caps) {
      const s = await P.getSettings();
      const v = await P.voiceInfo(s.voiceName);
      if (v) st.voice = v;
    }
    if (changes.rate) st.rate = clampRate(changes.rate.newValue);
    else st.rate = clampRate(st.rate);
    refreshHud();
  });

  hud.bind({
    togglePause: () => (st.state === 'playing' ? pause() : resume()),
    slower: () => changeRate(-1),
    faster: () => changeRate(+1),
    settings: () => P.openSettings(),
    stop: () => stop(),
  });

  R.reader = {
    get state() { return st.state; },
    st,
    start,
    stop,
    toggle: () => (st.state === 'off' ? start() : stop()),
    pause,
    resume,
    togglePause: () => (st.state === 'playing' ? pause() : resume()),
    nav,
    changeRate,
    jumpTo,
    onTts,
    userScrolled: () => { st.userScrollAt = performance.now(); },
  };
})();
