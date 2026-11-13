// Plays the built-in voices. The service worker sends speak, stop, pause, resume, prefetch,
// and warm. This page sends back start, word, end, and error events for the utterance.
import { stretch } from './stretch.js';

const G = globalThis.RIP_COMMON.GLINT;
const worker = new Worker(new URL('tts-worker.js', import.meta.url), { type: 'module' });

const cache = new Map(); // key -> { parts: [], done, error, wake: Set<fn> }
let cur = null; // the utterance playing now
let ahead = []; // cache keys of the sentences after the one playing
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
    // Forget the oldest audio, but never what is playing or coming up next.
    for (const [k, x] of cache) {
      if (cache.size <= 12) break;
      if (k !== key && x !== cur?.e && !ahead.includes(k)) cache.delete(k);
    }
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
  [...e.wake].forEach(f => f()); // a copy: each wakes once, and may wait again
};

const send = (id, ev) => chrome.runtime.sendMessage({ type: 'glintEvent', id, ev }).catch(() => {});

// Playback goes through Web Audio, not <audio>. Each part is queued to start the moment the
// one before it ends, so a sentence plays without gaps. Chrome also shows its media controls
// for <audio> longer than a few seconds, which made a toolbar icon come and go as we read.
const SR = 24000;
let ctx = null, gain = null;
function audioOut() {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: SR, latencyHint: 'playback' });
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }
  return ctx;
}

function speak({ id, text, voiceName, rate = 1, volume = 1 }) {
  stop();
  const { key, e, skip, playback } = reuse(text, voiceName, rate) || request(text, voiceName, rate, true);
  if (!e.done) worker.postMessage({ type: 'bump', key });
  // Drop unfinished work for text that reading has moved past. Keep work for this text and
  // the sentences after it at any speed, since it can be reused at a new rate.
  const texts = [e.text, ...ahead.map(k => cache.get(k)?.text)];
  for (const [k, x] of cache) if (!x.done && !texts.includes(x.text)) cache.delete(k);
  worker.postMessage({ type: 'drop', keep: [...cache.keys()] });
  const out = audioOut();
  out.resume().catch(() => {});
  gain.gain.value = volume;
  cur = { id, e, skip, part: 0, playback, at: 0, marks: [], w: 0, sources: [], timer: 0,
    started: false, finished: false, first: true };
  cur.timer = setInterval(() => tick(cur), 15);
  next(cur);
}

// Queues every part that is ready. Called again as each new part arrives.
function next(u) {
  if (cur !== u) return;
  for (let p; (p = u.e.parts[u.part]); u.part++) {
    if (p.words.length && p.words.at(-1).charIndex < u.skip) continue; // before the start
    const words = p.words.filter(x => x.charIndex >= u.skip);
    // Starting partway into the first part: begin just before the first word.
    const off = u.first && u.skip && words.length ? Math.max(0, words[0].t - 0.03) : 0;
    u.first = false;
    const pcm = stretch(p.audio.subarray(Math.round(off * SR)), u.playback);
    const buf = ctx.createBuffer(1, pcm.length, SR);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    const when = Math.max(u.at, ctx.currentTime + 0.03);
    src.start(when);
    u.sources.push(src);
    src.onended = () => { const i = u.sources.indexOf(src); if (i >= 0) u.sources.splice(i, 1); };
    u.at = when + buf.duration;
    for (const x of words) u.marks.push({ at: when + (x.t - off) / u.playback, charIndex: x.charIndex - u.skip });
    dbg('queue part', u.part, 'secs', buf.duration.toFixed(2), 'wait', (when - ctx.currentTime).toFixed(2));
    if (!u.started) { u.started = true; send(u.id, { type: 'start', charIndex: 0 }); }
  }
  if (u.e.error) { send(u.id, { type: 'error', errorMessage: u.e.error }); stop(); return; }
  if (u.e.done) { u.finished = true; return; }
  const wake = () => { u.e.wake.delete(wake); next(u); };
  u.e.wake.add(wake);
}

// Sends word events as their time comes, and the end once the last part has played.
function tick(u) {
  if (cur !== u) return;
  const now = ctx.currentTime; // stands still while paused
  while (u.w < u.marks.length && u.marks[u.w].at <= now + 0.02) {
    send(u.id, { type: 'word', charIndex: u.marks[u.w++].charIndex });
  }
  if (u.finished && now >= u.at - 0.01) {
    send(u.id, { type: 'end', charIndex: 0 });
    stop();
  }
}

function stop() {
  if (!cur) return;
  clearInterval(cur.timer);
  for (const s of cur.sources) { s.onended = null; try { s.stop(); } catch {} s.disconnect(); }
  cur = null;
}

chrome.runtime.onMessage.addListener(m => {
  if (m.target !== 'glint-offscreen') return;
  dbg('msg', m.type, m.id ?? '', (m.text || '').slice(0, 30), m.rate ?? '');
  switch (m.type) {
    case 'speak': speak(m); break;
    case 'stop': stop(); break;
    case 'pause': ctx?.suspend(); break;
    case 'resume': ctx?.resume(); break;
    case 'prefetch': // the next few sentences, in reading order
      ahead = m.texts.map(text => {
        const r = reuse(text, m.voiceName, m.rate);
        return r && !r.skip ? r.key : request(text, m.voiceName, m.rate, false).key;
      });
      break;
    case 'warm': worker.postMessage({ type: 'warm' }); break;
  }
});
