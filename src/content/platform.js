// Bridge to the extension. Tests swap this for a fake before the other files load.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.platform) return;
  const L = { tts: [], toggle: [], preempted: [], settings: [] };

  const send = msg => {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => undefined);
    } catch {
      return Promise.resolve(undefined); // extension was reloaded; this copy is orphaned
    }
  };

  R.platform = {
    alive: () => !!globalThis.chrome?.runtime?.id,
    send,
    speak: (id, text, opts) => send({ type: 'speak', id, text, ...opts }),
    stop: () => send({ type: 'stop' }),
    setState: state => send({ type: 'state', state }),
    openSettings: () => send({ type: 'openSettings' }),
    voiceInfo: voiceName => send({ type: 'voiceInfo', voiceName, lang: document.documentElement.lang }),
    getSettings: () => chrome.storage.sync.get(RIP_COMMON.DEFAULTS),
    saveSettings: o => chrome.storage.sync.set(o).catch(() => {}),
    on: (type, fn) => L[type].push(fn),
  };

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'toggle') {
      L.toggle.forEach(f => f());
      respond({ ok: true });
    } else if (msg.type === 'tts') {
      L.tts.forEach(f => f(msg.id, msg.ev));
    } else if (msg.type === 'preempted') {
      L.preempted.forEach(f => f());
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' || (area === 'local' && changes.caps)) L.settings.forEach(f => f(changes));
  });
})();
