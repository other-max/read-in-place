// Runs the voice model off the offscreen page's main thread, so word timing stays smooth
// while the next sentence is being made. One job at a time; a spoken job jumps the queue.
import { load, synth } from './kokoro.js';

const queue = [];
let busy = false;

self.onmessage = ({ data: m }) => {
  if (m.type === 'warm') load().catch(e => self.postMessage({ type: 'error', key: '', message: String(e) }));
  else if (m.type === 'synth') {
    const i = queue.findIndex(j => j.key === m.key);
    if (i >= 0) queue.splice(i, 1);
    if (m.urgent) queue.unshift(m); else queue.push(m);
    pump();
  } else if (m.type === 'bump') {
    const i = queue.findIndex(j => j.key === m.key);
    if (i > 0) queue.unshift(...queue.splice(i, 1));
  } else if (m.type === 'drop') {
    // Forget queued prefetches that aren't wanted any more.
    for (let i = queue.length - 1; i >= 0; i--) if (!m.keep.includes(queue[i].key)) queue.splice(i, 1);
  }
};

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await synth(job.text, {
        voice: job.voice, lang: job.lang, speed: job.speed,
        onPart: p => self.postMessage({ type: 'part', job: job.job, key: job.key, audio: p.audio, words: p.words },
          [p.audio.buffer]),
      });
      self.postMessage({ type: 'done', job: job.job, key: job.key });
    } catch (e) {
      self.postMessage({ type: 'error', job: job.job, key: job.key, message: String(e?.message || e) });
    }
  }
  busy = false;
}
