// Owns chrome.tts and the toggle. Content scripts ask it to speak; it relays events back.
importScripts('../shared/common.js');
const C = globalThis.RIP_COMMON;

let active = null; // { tabId, id } of the utterance currently speaking

chrome.action.onClicked.addListener(tab => toggle(tab));
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'toggle-reader') toggle(tab);
});

async function activeTab(tab) {
  if (tab?.id != null) return tab;
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t;
}

async function toggle(tab) {
  tab = await activeTab(tab);
  if (!tab?.id) return;
  const target = { tabId: tab.id };
  const s = await chrome.storage.sync.get(C.DEFAULTS);
  try {
    await chrome.scripting.insertCSS({ target, css: C.cssFor(s) });
  } catch (e) {
    return flash(tab.id); // chrome:// pages, the Web Store, and similar are off limits
  }
  if (await send(tab.id, { type: 'toggle' })) return;
  try {
    await chrome.scripting.executeScript({ target, files: C.CONTENT_FILES });
    await send(tab.id, { type: 'toggle' });
  } catch (e) {
    console.warn('Read in Place: could not start on this page', e);
    flash(tab.id);
  }
}

async function send(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
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
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case 'speak':
      speak(tabId, msg);
      break;
    case 'stop':
      if (!active || active.tabId === tabId) {
        chrome.tts.stop();
        active = null;
      }
      break;
    case 'state':
      badge(tabId, msg.state);
      break;
    case 'voiceInfo':
      voiceInfo(msg.voiceName, msg.lang).then(respond);
      return true;
    case 'calibrate':
      calibrate(msg.voiceName).then(respond);
      return true;
    case 'ping': // keeps the worker awake during long sentences
      break;
  }
});

function speak(tabId, msg) {
  if (tabId == null) return;
  if (active && active.tabId !== tabId) send(active.tabId, { type: 'preempted' });
  active = { tabId, id: msg.id };
  const relay = ev => chrome.tabs.sendMessage(tabId, {
    type: 'tts', id: msg.id,
    ev: { type: ev.type, charIndex: ev.charIndex, errorMessage: ev.errorMessage },
  }, { frameId: 0 }).catch(() => {});
  const opts = { rate: Math.min(10, Math.max(0.1, msg.rate || 1)), enqueue: false, onEvent: relay };
  if (msg.voiceName) opts.voiceName = msg.voiceName;
  try {
    const p = chrome.tts.speak(msg.text, opts);
    p?.catch?.(e => relay({ type: 'error', errorMessage: String(e?.message || e) }));
  } catch (e) {
    relay({ type: 'error', errorMessage: String(e?.message || e) });
  }
}

chrome.tabs.onRemoved.addListener(tabId => {
  if (active?.tabId === tabId) { chrome.tts.stop(); active = null; }
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && active?.tabId === tabId) { chrome.tts.stop(); active = null; }
});

async function voiceInfo(name, lang) {
  const voices = await chrome.tts.getVoices();
  const v = (name && voices.find(x => x.voiceName === name)) ||
    C.pickVoice(voices, lang || navigator.language);
  const { caps = {} } = await chrome.storage.local.get('caps');
  return {
    voiceName: v?.voiceName || '',
    hasWord: v ? C.hasWord(v) : false,
    remote: !!v?.remote,
    cap: C.capFor(v, caps),
    measured: !!(v && caps[v.voiceName]),
  };
}

// Measure how fast a voice really gets. Speaks silently at rising rates and times each
// run; the top speed is the last rate that still made speech noticeably faster.
const CAL_TEXT = 'The quick brown fox jumps over the lazy dog, and then it runs across the ' +
  'wide green field to find a quiet place to rest.';

function timeIt(rate, voiceName) {
  return new Promise(resolve => {
    let t0 = 0;
    const done = v => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(null), 30000);
    const opts = { rate, volume: 0, enqueue: false, onEvent: ev => {
      if (ev.type === 'start') t0 = performance.now();
      else if (ev.type === 'end') done(t0 ? performance.now() - t0 : null);
      else if (['error', 'interrupted', 'cancelled'].includes(ev.type)) done(null);
    } };
    if (voiceName) opts.voiceName = voiceName;
    try { chrome.tts.speak(CAL_TEXT, opts)?.catch?.(() => done(null)); } catch { done(null); }
  });
}

let calibrating = null;
function calibrate(name) {
  calibrating ||= runCalibration(name).finally(() => { calibrating = null; });
  return calibrating;
}

async function runCalibration(name) {
  const { voiceName } = await voiceInfo(name);
  const base = await timeIt(1, voiceName);
  if (!base) return { error: 'Could not time this voice. Try again.' };
  const table = [{ rate: 1, speedup: 1 }];
  let cap = 1, best = 1, misses = 0;
  for (const rate of [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const d = await timeIt(rate, voiceName);
    if (!d) return { error: 'Measuring was interrupted. Try again.' };
    const speedup = base / d;
    table.push({ rate, speedup: Math.round(speedup * 100) / 100 });
    if (speedup > best * 1.08) { cap = rate; best = speedup; misses = 0; }
    else if (++misses >= 2) break;
  }
  const { caps = {} } = await chrome.storage.local.get('caps');
  caps[voiceName] = { cap, best: Math.round(best * 100) / 100, table, at: Date.now() };
  await chrome.storage.local.set({ caps });
  return { voiceName, cap, best: caps[voiceName].best, table };
}

// Measure the default voice once, silently, right after install.
chrome.runtime.onInstalled.addListener(d => {
  if (d.reason === 'install') calibrate('');
});
