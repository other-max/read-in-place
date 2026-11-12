// Shared by the service worker, options page, and content scripts.
(() => {
  if (globalThis.RIP_COMMON) return;

  const DEFAULTS = { voiceName: '', rate: 1, wordColor: '#ffd84d', sentenceColor: '#fff1a8' };

  // Speed steps. The list is cut off at each voice's measured top speed.
  const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75,
    4, 4.5, 5, 5.5, 6, 7, 8, 9, 10];

  const CONTENT_FILES = ['shared/common.js', 'content/platform.js', 'content/text-model.js',
    'content/highlight.js', 'content/hud.js', 'content/reader.js', 'content/main.js'];

  // macOS novelty and legacy voices: usable, but never picked automatically.
  const NOVELTY = new Set(['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
    'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
    'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Fred', 'Junior',
    'Kathy', 'Ralph']);
  const PREFERRED = ['Samantha', 'Ava', 'Allison', 'Zoe', 'Evan', 'Nathan', 'Tom', 'Susan',
    'Alex', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Serena'];

  const baseName = v => (v.voiceName || '').split(' (')[0];
  const hasWord = v => !!v.eventTypes?.includes('word');

  // Best voice for a language: on-device, sends word events, not a novelty voice.
  function pickVoice(voices, lang) {
    const want = (lang || 'en').toLowerCase().split('-')[0];
    const score = v => {
      let s = 0;
      const vl = (v.lang || '').toLowerCase();
      if (vl.split('-')[0] === want) s += 100;
      if (vl === (lang || '').toLowerCase()) s += 10;
      if (!v.remote) s += 40;
      if (hasWord(v)) s += 30;
      if (NOVELTY.has(baseName(v))) s -= 80;
      const p = PREFERRED.indexOf(baseName(v));
      if (p >= 0) s += 20 - p;
      if (/enhanced|premium/i.test(v.voiceName)) s += 15;
      return s;
    };
    return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
  }

  // Speeds in the UI are the speed you hear. Engines don't all map the rate they're given to
  // that: Google's online voices speed up by about rate squared (rate 2 sounds near 3.7x).
  // Measuring records { rate sent, speedup heard } pairs, and engineRate() reads them backwards.

  // The measured pairs, rising in both rate and speedup, starting at { rate: 1, speedup: 1 }.
  function curve(m) {
    const out = [];
    for (const p of [...(m?.table || [])].sort((a, b) => a.rate - b.rate)) {
      if (p.speedup > 0 && (!out.length || p.speedup > out[out.length - 1].speedup)) out.push(p);
    }
    return out.length > 1 && out[0].rate === 1 ? out : null;
  }

  // Until measured, assume Google's online voices square the rate and everything else is linear.
  const guessPower = v => (v?.remote && /^Google /.test(v.voiceName || '') ? 2 : 1);

  // The rate to hand the engine so the voice is heard at `want` times normal speed.
  function engineRate(voice, caps, want) {
    const c = curve(voice && caps?.[voice.voiceName]);
    const clamp = r => Math.min(10, Math.max(0.1, r));
    if (!c) return clamp(Math.pow(want, 1 / guessPower(voice)));
    if (want <= 1) {
      // Below 1x, carry on the curve's first step as a power law.
      const k = Math.log(c[1].speedup) / Math.log(c[1].rate) || 1;
      return clamp(Math.pow(want, 1 / k));
    }
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1], b = c[i];
      if (want <= b.speedup) {
        const f = Math.log(want / a.speedup) / Math.log(b.speedup / a.speedup);
        return clamp(a.rate * Math.pow(b.rate / a.rate, f));
      }
    }
    return clamp(c[c.length - 1].rate);
  }

  // Top speed you can hear: measured if we have it, otherwise a cautious guess.
  function capFor(voice, caps) {
    const m = voice && caps?.[voice.voiceName];
    if (m?.best) return Math.max(1, Math.floor(m.best * 4) / 4);
    // Google's online voices measured 3.75x in Chrome 157; other online voices are unknown.
    if (guessPower(voice) === 2) return 3.5;
    return voice?.remote ? 2 : 4;
  }

  function stepsFor(cap) {
    const out = STEPS.filter(x => x <= cap + 1e-9);
    if (out[out.length - 1] < cap) out.push(cap);
    return out;
  }

  function cssFor(s) {
    return `::highlight(rip-sentence){background-color:${s.sentenceColor}66;}
::highlight(rip-word){background-color:${s.wordColor};color:#111;}`;
  }

  const fmt = r => (Math.round(r * 100) / 100).toString();

  globalThis.RIP_COMMON = { DEFAULTS, STEPS, CONTENT_FILES, pickVoice, capFor, engineRate, stepsFor, cssFor,
    hasWord, fmt };
})();
