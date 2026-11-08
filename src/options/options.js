const C = globalThis.RIP_COMMON;
const $ = id => document.getElementById(id);
let voices = [];
let settings = { ...C.DEFAULTS };

async function caps() {
  return (await chrome.storage.local.get('caps')).caps || {};
}

function currentVoice() {
  return voices.find(v => v.voiceName === settings.voiceName) ||
    C.pickVoice(voices, navigator.language);
}

function fillVoices() {
  const sel = $('voice');
  sel.innerHTML = '';
  const auto = currentVoiceAuto();
  sel.append(new Option(`Automatic${auto ? ` (${auto.voiceName})` : ''}`, ''));
  const groups = [
    ['On this device, with word highlighting', v => !v.remote && C.hasWord(v)],
    ['On this device', v => !v.remote && !C.hasWord(v)],
    ['Online', v => v.remote],
  ];
  const sorted = [...voices].sort((a, b) =>
    (a.lang || '').localeCompare(b.lang || '') || a.voiceName.localeCompare(b.voiceName));
  for (const [name, test] of groups) {
    const list = sorted.filter(test);
    if (!list.length) continue;
    const g = document.createElement('optgroup');
    g.label = name;
    for (const v of list) g.append(new Option(`${v.voiceName} (${v.lang || '?'})`, v.voiceName));
    sel.append(g);
  }
  sel.value = settings.voiceName;
}

function currentVoiceAuto() {
  return C.pickVoice(voices, navigator.language);
}

async function refreshVoiceInfo() {
  const v = currentVoice();
  const c = await caps();
  const cap = C.capFor(v, c);
  const m = v && c[v.voiceName];
  const notes = [];
  if (v) {
    notes.push(v.remote ? 'Online voice.' : 'On-device voice.');
    notes.push(C.hasWord(v) ? 'Reports each word, so highlighting is exact.' :
      'Does not report words, so word highlighting is estimated.');
  }
  $('voice-note').textContent = notes.join(' ');
  $('speed-note').textContent = m ?
    `Top speed: ${C.fmt(cap)}x (measured; speech is about ${C.fmt(m.best)}x faster than 1x there).` :
    `Top speed: ${C.fmt(cap)}x (a guess until measured).`;
  fillRates(cap);
  return { v, cap, measured: !!m };
}

function fillRates(cap) {
  const sel = $('rate');
  sel.innerHTML = '';
  for (const r of C.stepsFor(cap)) sel.append(new Option(`${C.fmt(r)}x`, r));
  const r = Math.min(settings.rate, cap);
  sel.value = String(C.stepsFor(cap).reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a)));
}

async function measure() {
  const btn = $('measure');
  btn.disabled = true;
  $('speed-note').textContent = 'Measuring silently. This takes about 20 seconds.';
  const res = await chrome.runtime.sendMessage({ type: 'calibrate', voiceName: settings.voiceName });
  btn.disabled = false;
  if (res?.error) $('speed-note').textContent = res.error;
  else await refreshVoiceInfo();
}

function test() {
  const v = currentVoice();
  chrome.tts.speak('This is how Read in Place will sound at your chosen speed.', {
    voiceName: v?.voiceName, rate: Number($('rate').value) || 1, enqueue: false,
  });
}

async function init() {
  settings = await chrome.storage.sync.get(C.DEFAULTS);
  voices = await chrome.tts.getVoices();
  fillVoices();
  $('wordColor').value = settings.wordColor;
  $('sentenceColor').value = settings.sentenceColor;
  const { measured } = await refreshVoiceInfo();
  if (!measured && currentVoice()) measure();

  $('voice').addEventListener('change', async e => {
    settings.voiceName = e.target.value;
    await chrome.storage.sync.set({ voiceName: settings.voiceName });
    const { measured: m } = await refreshVoiceInfo();
    if (!m) measure();
  });
  $('rate').addEventListener('change', e => {
    settings.rate = Number(e.target.value);
    chrome.storage.sync.set({ rate: settings.rate });
  });
  for (const id of ['wordColor', 'sentenceColor']) {
    $(id).addEventListener('change', e => chrome.storage.sync.set({ [id]: e.target.value }));
  }
  $('test').addEventListener('click', test);
  $('measure').addEventListener('click', measure);
  $('shortcuts').addEventListener('click', () =>
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
}

init();
