// Plays the built-in voices. The service worker sends speak, stop, pause, resume, prefetch,
// and warm. This page sends back start, word, end, and error events for the utterance.
const G = globalThis.RIP_COMMON.GLINT;
const worker = new Worker(new URL('tts-worker.js', import.meta.url), { type: 'module' });

const cache = new Map(); // key -> { parts: [], done, error, wake: Set<fn> }
let cur = null; // the utterance playing now
let lastPrefetch = '';
let jobs = 0;

const voiceOf = name => G.voices.find(v => v.voiceName === name) || G.voices[0];
const modelSpeed = rate => Math.min(G.maxModelSpeed, Math.max(0.5, rate));
const keyOf = (v, speed, text) => `${v.id}|${speed.toFixed(2)}|${text}`;

function request(text, voiceName, rate, urgent) {
  const v = voiceOf(voiceName), speed = modelSpeed(rate), key = keyOf(v, speed, text);
  let e = cache.get(key);
  if (!e || e.error) {
    e = { job: ++jobs, voice: v.id, speed, text, parts: [], done: false, error: null, wake: new Set() };
    cache.set(key, e);
    worker.postMessage({ type: 'synth', job: e.job, key, text, voice: v.id, lang: v.lang, speed, urgent });
    while (cache.size > 8) cache.delete(cache.keys().next().value);
  } else if (urgent && !e.done) {
    worker.postMessage({ type: 'bump', key });
  }
  return { key, e, skip: 0, playback: rate / speed };
}

// Audio already made (or being made) for this text, or for a sentence it is the end of.
// Restarting from a word after a pause or a speed change then plays at once: seek to the
// word and change the playback rate. Not used when it would mean slowing audio down much.
function reuse(text, voiceName, rate) {
  const v = voiceOf(voiceName), want = modelSpeed(rate);
  let best = null;
  for (const [key, e] of cache) {
    if (e.error || e.voice !== v.id || !e.text.endsWith(text)) continue;
    const skip = e.text.length - text.length;
    if (skip && !/\s/.test(e.text[skip - 1])) continue; // must start on a word
    if (rate / e.speed < 0.9) continue;
    const score = Math.abs(Math.log(e.speed / want)) + (e.done ? 0 : 0.05);
    if (!best || score < best.score) best = { key, e, skip, playback: rate / e.speed, score };
  }
  return best;
}

const DEBUG = false;
const dbg = (...a) => DEBUG && console.log('[glint]', Math.round(performance.now()), ...a);
dbg('isolated', self.crossOriginIsolated, navigator.hardwareConcurrency);
worker.onerror = e => dbg('worker error', e.message);
worker.onmessage = ({ data: m }) => {
  dbg('worker', m.type, m.key?.slice(0, 40), m.message || '');
  const e = cache.get(m.key);
  if (m.type === 'error' && !m.key) return console.warn('Glint voice failed to load', m.message);
  if (!e || e.job !== m.job) return; // from a job that was dropped and asked for again
  if (m.type === 'part') e.parts.push({ audio: m.audio, words: m.words });
  else if (m.type === 'done') e.done = true;
  else if (m.type === 'error') e.error = m.message;
  e.wake.forEach(f => f());
};

const send = (id, ev) => chrome.runtime.sendMessage({ type: 'glintEvent', id, ev }).catch(() => {});

function wav(f32) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 24000, true); d.setUint32(28, 48000, true); d.setUint16(32, 2, true);
  d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function speak({ id, text, voiceName, rate = 1, volume = 1 }) {
  stop();
  const { key, e, skip, playback } = reuse(text, voiceName, rate) || request(text, voiceName, rate, true);
  if (!e.done) worker.postMessage({ type: 'bump', key });
  // Drop unfinished work for text that reading has moved past. Keep work for this text and
  // the next sentence at any speed, since it can be reused at a new rate.
  const texts = [e.text, cache.get(lastPrefetch)?.text];
  for (const [k, x] of cache) if (!x.done && !texts.includes(x.text)) cache.delete(k);
  worker.postMessage({ type: 'drop', keep: [...cache.keys()] });
  cur = { id, e, skip, part: 0, playback, volume, audio: null, url: '', timer: 0, started: false, paused: false };
  next(cur);
}

function next(u) {
  if (cur !== u) return;
  const p = u.e.parts[u.part];
  if (!p) {
    if (u.e.error) { send(u.id, { type: 'error', errorMessage: u.e.error }); cur = null; return; }
    if (u.e.done) { send(u.id, { type: 'end', charIndex: 0 }); cur = null; return; }
    const wake = () => { u.e.wake.delete(wake); next(u); };
    u.e.wake.add(wake);
    return;
  }
  if (p.words.length && p.words.at(-1).charIndex < u.skip) { u.part++; return next(u); } // before the start
  const words = p.words.filter(x => x.charIndex >= u.skip);
  const audio = new Audio();
  u.url = URL.createObjectURL(wav(p.audio));
  audio.src = u.url;
  audio.preservesPitch = true;
  audio.playbackRate = u.playback;
  audio.volume = u.volume;
  if (words.length && words[0].t > 0 && u.skip) audio.currentTime = Math.max(0, words[0].t - 0.03);
  u.audio = audio;
  let w = 0;
  const tick = () => {
    while (w < words.length && words[w].t <= audio.currentTime + 0.02) {
      send(u.id, { type: 'word', charIndex: words[w++].charIndex - u.skip });
    }
  };
  audio.onplaying = () => {
    if (!u.started) { u.started = true; send(u.id, { type: 'start', charIndex: 0 }); }
    clearInterval(u.timer);
    u.timer = setInterval(tick, 15);
    tick();
  };
  audio.onended = () => {
    clearInterval(u.timer);
    tick();
    URL.revokeObjectURL(u.url);
    u.part++;
    next(u);
  };
  audio.onerror = () => {
    if (cur === u) { send(u.id, { type: 'error', errorMessage: 'Audio playback failed' }); stop(); }
  };
  dbg('play part', u.part, 'secs', (p.audio.length / 24000).toFixed(2), 'rate', u.playback);
  if (!u.paused) audio.play().catch(e => dbg('play failed', String(e)));
}

function stop() {
  if (!cur) return;
  clearInterval(cur.timer);
  if (cur.audio) { cur.audio.onended = cur.audio.onerror = null; cur.audio.pause(); }
  if (cur.url) URL.revokeObjectURL(cur.url);
  cur = null;
}

chrome.runtime.onMessage.addListener(m => {
  if (m.target !== 'glint-offscreen') return;
  dbg('msg', m.type, m.id ?? '', (m.text || '').slice(0, 30), m.rate ?? '');
  switch (m.type) {
    case 'speak': speak(m); break;
    case 'stop': stop(); break;
    case 'pause': if (cur) { cur.paused = true; cur.audio?.pause(); } break;
    case 'resume': if (cur) { cur.paused = false; cur.audio?.play().catch(() => {}); } break;
    case 'prefetch': {
      const r = reuse(m.text, m.voiceName, m.rate);
      lastPrefetch = r && !r.skip ? r.key : request(m.text, m.voiceName, m.rate, false).key;
      break;
    }
    case 'warm': worker.postMessage({ type: 'warm' }); break;
  }
});
