// Owns chrome.tts and the toggle. Content scripts ask it to speak; it relays events back.
importScripts('../shared/common.js');
const C = globalThis.RIP_COMMON;

let active = null; // { tabId, frameId, id } of the utterance currently speaking
// Frame of each tab whose reader is on. Usually the top frame (0), but a selection read in an
// iframe (an email body, an embedded document) runs the reader inside that frame.
const readerFrame = new Map();

chrome.action.onClicked.addListener(tab => toggle(tab));
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'toggle-reader') toggle(tab);
});

async function activeTab(tab) {
  if (tab?.id != null) return tab;
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t;
}

// Right-click menu on selected text. Our own parent item, since Chrome would otherwise title
// the group with the manifest's full store name.
const MENU = {
  'glint-read-selection': { title: 'Read aloud', whole: false },
  'glint-read-from-here': { title: 'Read aloud from here', whole: true },
};
function makeMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'glint', title: 'Glint Reader', contexts: ['selection'] });
    for (const [id, m] of Object.entries(MENU)) {
      chrome.contextMenus.create({ id, parentId: 'glint', title: m.title, contexts: ['selection'] });
    }
  });
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const m = MENU[info.menuItemId];
  // Read where the selection is: it may be inside a frame, which has its own selection.
  if (m) toPage(tab, { type: 'read', toEnd: m.whole }, info.frameId || 0);
});

const toggle = tab => toPage(tab, { type: 'toggle' });

// Sends a command to the reader in a frame of the tab, loading the content scripts first if
// needed. Without a frame: the frame already reading, or else the top frame.
async function toPage(tab, msg, frameId) {
  tab = await activeTab(tab);
  if (!tab?.id) return;
  frameId ??= readerFrame.get(tab.id) ?? 0;
  const target = { tabId: tab.id, frameIds: [frameId] };
  const s = await chrome.storage.sync.get(C.DEFAULTS);
  try {
    await chrome.scripting.insertCSS({ target, css: C.cssFor(s) });
    if (await send(tab.id, msg, frameId)) return;
    await chrome.scripting.executeScript({ target, files: C.CONTENT_FILES });
    if (await send(tab.id, msg, frameId)) return;
    throw new Error('no reply from the reader');
  } catch (e) {
    // chrome:// pages, the Web Store, and frames from another site that the click didn't
    // grant access to are off limits.
    console.warn('Glint Reader: could not start on this page', e);
    flash(tab.id);
    if (frameId !== 0) {
      readerFrame.delete(tab.id);
      toPage(tab, { type: 'notice', text: "Glint Reader can't reach the text inside that frame" }, 0);
    }
  }
}

async function send(tabId, msg, frameId = 0) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg, { frameId });
  } catch {
    return undefined;
  }
}

function flash(tabId) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#b3261e' });
  chrome.action.setBadgeText({ tabId, text: '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2000);
}

function badge(tabId, state) {
  if (tabId == null) return;
  const text = state === 'playing' ? 'ON' : state === 'paused' ? 'II' : '';
  chrome.action.setBadgeBackgroundColor({ tabId, color: state === 'paused' ? '#666' : '#1a7f37' });
  chrome.action.setBadgeText({ tabId, text });
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const tabId = sender.tab?.id, frameId = sender.frameId ?? 0;
  switch (msg.type) {
    case 'glintEvent': // from the offscreen page that plays the built-in voices
      if (engine?.id === msg.id) {
        engine.send(msg.ev);
        if (['end', 'error'].includes(msg.ev.type)) engine = null;
      }
      break;
    case 'speak':
      speak(tabId, frameId, msg);
      break;
    case 'stop':
      if (!active || (active.tabId === tabId && active.frameId === frameId)) {
        chrome.tts.stop();
        active = null;
      }
      break;
    case 'state':
      if (tabId == null) break;
      if (msg.state !== 'off') readerFrame.set(tabId, frameId);
      else if (readerFrame.get(tabId) === frameId) readerFrame.delete(tabId);
      badge(tabId, msg.state);
      break;
    case 'voiceInfo':
      voiceInfo(msg.voiceName, msg.lang).then(respond);
      return true;
    case 'calibrate':
      calibrate(msg.voiceName).then(respond);
      return true;
    case 'openSettings':
      chrome.runtime.openOptionsPage();
      break;
    case 'ping': // keeps the worker awake during long sentences
      break;
  }
});

async function speak(tabId, frameId, msg) {
  if (tabId == null) return;
  if (calibrating) yieldToReader = true; // reading wins; measuring stops at its next step
  if (active && (active.tabId !== tabId || active.frameId !== frameId)) {
    send(active.tabId, { type: 'preempted' }, active.frameId);
  }
  active = { tabId, frameId, id: msg.id };
  const relay = ev => chrome.tabs.sendMessage(tabId, {
    type: 'tts', id: msg.id,
    ev: { type: ev.type, charIndex: ev.charIndex, errorMessage: ev.errorMessage },
  }, { frameId }).catch(() => {});
  const [voices, { caps = {} }] = await Promise.all([chrome.tts.getVoices(), chrome.storage.local.get('caps')]);
  if (active?.id !== msg.id) return; // a newer sentence started while we looked up the voice
  const v = voices.find(x => x.voiceName === msg.voiceName);
  const opts = { rate: C.engineRate(v, caps, msg.rate || 1), enqueue: false, onEvent: relay };
  if (msg.voiceName) opts.voiceName = msg.voiceName;
  try {
    const p = chrome.tts.speak(msg.text, opts);
    p?.catch?.(e => relay({ type: 'error', errorMessage: String(e?.message || e) }));
  } catch (e) {
    relay({ type: 'error', errorMessage: String(e?.message || e) });
  }
  // Built-in voices take a moment to make speech, so start on the next sentence now.
  if (msg.next && C.isGlint(msg.voiceName)) {
    toOffscreen({ type: 'prefetch', text: msg.next, voiceName: msg.voiceName, rate: opts.rate });
  }
}

// ---- built-in voices ----
// The extension is also a speech engine (chrome.ttsEngine), so its voices show up in
// chrome.tts like any other. The model runs and plays in an offscreen page.

let engine = null; // { id, send } for the utterance our engine is speaking
let engineSeq = 0;
let offscreenReady = null;

function ensureOffscreen() {
  offscreenReady ||= (async () => {
    const have = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!have.length) {
      await chrome.offscreen.createDocument({
        url: 'voice/offscreen.html',
        reasons: ['AUDIO_PLAYBACK', 'WORKERS'],
        justification: 'Plays the built-in voices, which run on this device.',
      });
    }
  })().catch(e => { offscreenReady = null; throw e; });
  return offscreenReady;
}

async function toOffscreen(msg) {
  try {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({ target: 'glint-offscreen', ...msg });
  } catch (e) {
    offscreenReady = null; // the page was closed; make it again next time
    console.warn('Glint Reader: built-in voice unavailable', e);
    return false;
  }
  return true;
}

chrome.ttsEngine.onSpeak.addListener(async (text, options, sendTtsEvent) => {
  const id = ++engineSeq;
  engine = { id, send: sendTtsEvent };
  const ok = await toOffscreen({ type: 'speak', id, text, voiceName: options.voiceName,
    rate: options.rate ?? 1, volume: options.volume ?? 1 });
  if (!ok && engine?.id === id) {
    sendTtsEvent({ type: 'error', errorMessage: 'The built-in voice could not start.' });
    engine = null;
  }
});
chrome.ttsEngine.onStop.addListener(() => {
  engine = null;
  toOffscreen({ type: 'stop' });
});
chrome.ttsEngine.onPause.addListener(() => toOffscreen({ type: 'pause' }));
chrome.ttsEngine.onResume.addListener(() => toOffscreen({ type: 'resume' }));

chrome.tabs.onRemoved.addListener(tabId => {
  readerFrame.delete(tabId);
  if (active?.tabId === tabId) { chrome.tts.stop(); active = null; }
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  readerFrame.delete(tabId);
  if (active?.tabId === tabId) { chrome.tts.stop(); active = null; }
});

async function voiceInfo(name, lang) {
  const voices = await chrome.tts.getVoices();
  const v = (name && voices.find(x => x.voiceName === name)) ||
    C.pickVoice(voices, lang || navigator.language);
  const { caps = {} } = await chrome.storage.local.get('caps');
  if (C.isGlint(v?.voiceName)) toOffscreen({ type: 'warm' }); // load the model before it's needed
  return {
    none: !voices.length, // e.g. Chrome as a Linux Flatpak, which can't reach the system's voices
    voiceName: v?.voiceName || '',
    hasWord: v ? C.hasWord(v) : false,
    remote: !!v?.remote,
    builtIn: C.isGlint(v?.voiceName), // makes speech on this device, so the first words take a moment
    cap: C.capFor(v, caps),
    cps: caps[v?.voiceName]?.cps || 0, // characters per second at 1x, for estimated word timing
    measured: !!(v && caps[v.voiceName]?.best),
  };
}

// Measure how fast a voice really gets. Speaks silently at rising rates and times each run.
// The table of rate sent against speedup heard lets engineRate() hit the speed the user picked,
// and the top speed is the fastest speedup heard before speech stopped getting faster.
const CAL_TEXT = 'The quick brown fox jumps over the lazy dog, and then it runs across the ' +
  'wide green field to find a quiet place to rest.';

function timeIt(rate, voiceName, limit = 30000) {
  return new Promise(resolve => {
    let t0 = 0;
    const done = v => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => { chrome.tts.stop(); done(null); }, limit);
    const opts = { rate, volume: 0, enqueue: false, onEvent: ev => {
      if (ev.type === 'start') t0 = performance.now();
      else if (ev.type === 'end') done(t0 ? performance.now() - t0 : null);
      else if (['error', 'interrupted', 'cancelled'].includes(ev.type)) done(null);
    } };
    if (voiceName) opts.voiceName = voiceName;
    try { chrome.tts.speak(CAL_TEXT, opts)?.catch?.(() => done(null)); } catch { done(null); }
  });
}

let calibrating = null, yieldToReader = false;
function calibrate(name) {
  if (!calibrating) yieldToReader = false;
  calibrating ||= runCalibration(name).finally(() => { calibrating = null; });
  return calibrating;
}

// Times one rate, with a second try, since online voices drop the odd request at random.
async function timeTwice(rate, voiceName, limit) {
  for (let tries = 0; tries < 2; tries++) {
    await new Promise(r => setTimeout(r, 400 * (tries + 1)));
    if (yieldToReader) return null;
    const d = await timeIt(rate, voiceName, limit);
    if (d) return d;
  }
  return null;
}
const STOPPED = { error: 'Measuring stopped because reading started. Try again when it is done.' };

async function runCalibration(name) {
  const { voiceName } = await voiceInfo(name);
  const base = await timeTwice(1, voiceName);
  if (yieldToReader) return STOPPED;
  if (!base) return { error: 'Could not time this voice. Try again.' };
  const table = [{ rate: 1, speedup: 1 }];
  let best = 1, misses = 0;
  // Fine steps low down, since some engines speed up much faster than the rate they're given.
  for (const rate of [1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    // A voice that hangs at a high rate has passed its top speed, so stop there.
    const d = await timeTwice(rate, voiceName, Math.max(4000, (2 * base) / rate + 3000));
    if (yieldToReader) return STOPPED;
    if (!d) break;
    const speedup = base / d;
    table.push({ rate, speedup: Math.round(speedup * 100) / 100 });
    if (speedup > best * 1.08) { best = speedup; misses = 0; }
    else if (++misses >= 2) break;
  }
  const { caps = {} } = await chrome.storage.local.get('caps');
  caps[voiceName] = { best: Math.round(best * 100) / 100, cps: Math.round((CAL_TEXT.length / base) * 10000) / 10,
    table, at: Date.now() };
  await chrome.storage.local.set({ caps });
  return { voiceName, cap: C.capFor({ voiceName }, caps), best: caps[voiceName].best, table };
}

// Measure the user's voice silently after install or update, unless it's already measured.
// Entries from before 0.2.2 have no pace (cps), so an update redoes them.
chrome.runtime.onInstalled.addListener(async d => {
  makeMenus();
  if (d.reason !== 'install' && d.reason !== 'update') return;
  const { voiceName } = await chrome.storage.sync.get(C.DEFAULTS);
  const info = await voiceInfo(voiceName);
  // Built-in voices need no measuring: their speed is set exactly.
  if (!info.none && !info.cps && !info.builtIn) calibrate(voiceName);
});
