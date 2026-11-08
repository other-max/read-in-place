// Stands in for the extension so the content scripts run in a normal page.
// Default: a fake voice that emits word events on a timer. ?real=1 uses speechSynthesis.
(() => {
  const R = (globalThis.__rip ||= {});
  const L = { tts: [], toggle: [], preempted: [], settings: [] };
  const real = new URLSearchParams(location.search).has('real');
  const store = { ...RIP_COMMON.DEFAULTS };
  const log = (R.testLog = []);
  let timers = [];
  const emit = (id, ev) => L.tts.forEach(f => f(id, ev));

  R.platform = {
    fake: { noWords: false, msPerWord: 40, cap: 4 },
    alive: () => true,
    send: async () => undefined,
    speak(id, text, opts) {
      log.push({ t: 'speak', id, text, rate: opts.rate });
      clear();
      if (real) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = opts.rate;
        u.onstart = () => emit(id, { type: 'start' });
        u.onboundary = e => e.name === 'word' && emit(id, { type: 'word', charIndex: e.charIndex });
        u.onend = () => emit(id, { type: 'end' });
        speechSynthesis.speak(u);
        return;
      }
      const f = this.fake, step = f.msPerWord / opts.rate;
      const ws = [...text.matchAll(/\S+/g)].map(m => m.index);
      timers.push(setTimeout(() => emit(id, { type: 'start' }), 2));
      if (!f.noWords) ws.forEach((ci, i) => timers.push(setTimeout(() => emit(id, { type: 'word', charIndex: ci }), 5 + i * step)));
      timers.push(setTimeout(() => emit(id, { type: 'end' }), 10 + ws.length * step));
    },
    stop() { clear(); if (real) speechSynthesis.cancel(); log.push({ t: 'stop' }); },
    setState: s => log.push({ t: 'state', s }),
    voiceInfo: async () => ({ voiceName: 'Fake', hasWord: !R.platform.fake.noWords, cap: R.platform.fake.cap }),
    getSettings: async () => ({ ...store }),
    saveSettings: async o => { Object.assign(store, o); },
    on: (t, fn) => L[t].push(fn),
    _toggle: () => L.toggle.forEach(f => f()),
    _store: store,
  };
  function clear() { timers.forEach(clearTimeout); timers = []; }
})();
