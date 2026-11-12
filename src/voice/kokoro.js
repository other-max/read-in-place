// Kokoro-82M text to speech with word timings. Runs inside tts-worker.js.
// Each word is turned into sounds on its own, so every sound the model times belongs to
// exactly one word of the text we were given. That is what makes the word timings exact.
import * as ort from './vendor/ort.wasm.min.mjs';
import { phonemize } from './vendor/phonemizer.js';

const BASE = new URL('./', import.meta.url).href;
const get = async url => {
  const r = await fetch(url).catch(e => { throw new Error(`${e.message}: ${url}`); });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r;
};
const SR = 24000, HOP = 600; // samples per second, samples per duration frame
const MAX_TOKENS = 500; // the model takes 510 at most, with a pad at each end

let session = null, vocab = null, PUNCT_IDS = new Set();
const styles = new Map();
const wordCache = new Map();

export async function load(opts = {}) {
  if (session) return;
  ort.env.wasm.wasmPaths = BASE + 'vendor/';
  ort.env.wasm.numThreads = opts.threads ?? (self.crossOriginIsolated ?
    Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 2)) : 1);
  const [model, tok] = await Promise.all([
    get(BASE + (opts.model || 'model/kokoro.onnx')).then(r => r.arrayBuffer()),
    get(BASE + 'model/tokenizer.json').then(r => r.json()),
  ]);
  vocab = tok.model.vocab;
  PUNCT_IDS = new Set([...PUNCT].map(c => vocab[c]));
  session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  });
}

async function style(id) {
  if (!styles.has(id)) {
    const buf = await get(`${BASE}voices/${id}.bin`).then(r => r.arrayBuffer());
    styles.set(id, new Float32Array(buf));
  }
  return styles.get(id);
}

// ---- text to sounds ----

const PUNCT = ';:,.!?—…"()“”';
const EDGE = /[^\p{L}\p{N}$£%&@#'’]+/u;

// Years, times, money, and decimals, read the way people say them (from kokoro-js).
function year(t) {
  if (t.includes('.')) return t;
  if (t.includes(':')) {
    const [h, m] = t.split(':').map(Number);
    return m === 0 ? `${h} o'clock` : m < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  }
  const y = parseInt(t.slice(0, 4), 10);
  if (y < 1100 || y % 1000 < 10) return t;
  const a = t.slice(0, 2), b = parseInt(t.slice(2, 4), 10), s = t.endsWith('s') ? 's' : '';
  if (y % 1000 >= 100 && y % 1000 <= 999) {
    if (b === 0) return `${a} hundred${s}`;
    if (b < 10) return `${a} oh ${b}${s}`;
  }
  return `${a} ${b}${s}`;
}
function money(t) {
  const unit = t[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(t.slice(1)))) return `${t.slice(1)} ${unit}s`;
  if (!t.includes('.')) return `${t.slice(1)} ${unit}${t.slice(1) === '1' ? '' : 's'}`;
  const [a, b] = t.slice(1).split('.'), c = parseInt(b.padEnd(2, '0'), 10);
  const small = t[0] === '$' ? (c === 1 ? 'cent' : 'cents') : (c === 1 ? 'penny' : 'pence');
  return `${a} ${unit}${a === '1' ? '' : 's'} and ${c} ${small}`;
}
const TITLES = { 'dr.': 'Doctor', 'mr.': 'Mister', 'mrs.': 'Missus', 'ms.': 'Miss', 'st.': 'Saint',
  'etc.': 'etcetera', 'vs.': 'versus', 'e.g.': 'for example', 'i.e.': 'that is' };

function normalize(w) {
  const t = TITLES[w.toLowerCase()];
  if (t) return t;
  return w
    .replace(/[‘’]/g, "'")
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/^[$£]\d+(?:\.\d\d?)?$/, money)
    .replace(/^\d{4}s?$|^(?:[1-9]|1[0-2]):[0-5]\d$/, year)
    .replace(/\d*\.\d+/g, m => { const [a, b] = m.split('.'); return `${a} point ${b.split('').join(' ')}`; })
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent')
    .replace(/[—–\-/]+/g, ' ');
}

async function sounds(word, lang) {
  const key = lang + '|' + word;
  if (wordCache.has(key)) return wordCache.get(key);
  let p = (await phonemize(normalize(word), lang === 'en-GB' ? 'en' : 'en-us')).join(' ');
  p = p.replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ');
  if (lang !== 'en-GB') p = p.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  p = p.trim();
  if (wordCache.size > 5000) wordCache.clear();
  wordCache.set(key, p);
  return p;
}

const punctOf = s => [...s.replace(/[«]/g, '“').replace(/[»]/g, '”').replace(/[–]/g, '—')]
  .filter(c => PUNCT.includes(c)).join('');

// Splits text into words, each with its tokens. Returns [{ charIndex, ids }].
async function tokenize(text, lang) {
  const out = [];
  for (const m of text.matchAll(/\S+/g)) {
    const raw = m[0];
    const lead = raw.match(new RegExp('^' + EDGE.source, 'u'))?.[0] || '';
    const rest = raw.slice(lead.length);
    const trail = rest.match(new RegExp(EDGE.source + '$', 'u'))?.[0] || '';
    const core = rest.slice(0, rest.length - trail.length);
    const ph = core ? await sounds(core, lang) : '';
    const str = punctOf(lead) + ph + punctOf(trail);
    if (!str) continue;
    const ids = [...str].map(c => vocab[c]).filter(x => x != null);
    if (!ph && out.length) { out[out.length - 1].ids.push(...ids); continue; } // lone punctuation
    out.push({ charIndex: m.index, ids });
  }
  return out;
}

// Groups words into model-sized runs. A long sentence's first clause goes on its own, so
// speech can start while the rest is made.
function chunks(words) {
  const out = [];
  let cur = [], n = 0;
  const total = words.reduce((a, w) => a + w.ids.length + 1, 0);
  for (const w of words) {
    if (cur.length && n + w.ids.length + 1 > MAX_TOKENS) {
      let cut = cur.length;
      for (let i = cur.length - 1; i > cur.length / 2; i--) {
        if (PUNCT_IDS.has(cur[i].ids.at(-1))) { cut = i + 1; break; }
      }
      out.push(cur.slice(0, cut));
      cur = cur.slice(cut);
      n = cur.reduce((a, x) => a + x.ids.length + 1, 0);
    }
    cur.push(w);
    n += w.ids.length + 1;
    if (!out.length && total > 120 && n >= 30 && total - n >= 30 && PUNCT_IDS.has(w.ids.at(-1))) {
      out.push(cur);
      cur = [];
      n = 0;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

// Turns text into audio parts: [{ audio: Float32Array (24 kHz), words: [{ charIndex, t }] }].
// speed is the model's own speed. onPart is called as each part is ready.
export async function synth(text, { voice = 'af_heart', lang = 'en-US', speed = 1, onPart } = {}) {
  await load();
  const words = await tokenize(text, lang);
  const st = await style(voice);
  const parts = [];
  for (const group of chunks(words)) {
    const ids = [0], first = [];
    group.forEach((w, i) => {
      if (i) ids.push(vocab[' ']);
      first.push(ids.length);
      ids.push(...w.ids);
    });
    ids.push(0);
    const n = Math.min(ids.length - 2, 509);
    const out = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      style: new ort.Tensor('float32', st.slice(n * 256, n * 256 + 256), [1, 256]),
      speed: new ort.Tensor('float32', [speed], [1]),
    });
    const dur = out['/encoder/Clip_output_0'].data;
    const at = [];
    let f = 0;
    for (let i = 0; i < dur.length; i++) { at.push(f); f += Number(dur[i]); }
    const part = {
      audio: out.waveform.data,
      words: group.map((w, i) => ({ charIndex: w.charIndex, t: (at[first[i]] * HOP) / SR })),
    };
    parts.push(part);
    onPart?.(part);
  }
  return parts;
}
