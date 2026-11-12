// Stands in for chrome.* on the settings page, so the screenshot shows real voices and a measured speed.
globalThis.chrome = {
  storage: {
    sync: { get: async d => ({ ...d, rate: 2.5 }), set: async () => {} },
    local: { get: async () => ({ caps: { 'Samantha (Enhanced)': { best: 4.6, cps: 16.2,
      table: [{ rate: 1, speedup: 1 }, { rate: 2, speedup: 2 }, { rate: 4, speedup: 3.9 }, { rate: 5, speedup: 4.6 }] } } }) },
  },
  tts: {
    getVoices: async () => [
      { voiceName: 'Samantha (Enhanced)', lang: 'en-US', remote: false, eventTypes: ['start', 'word', 'end'] },
      { voiceName: 'Daniel', lang: 'en-GB', remote: false, eventTypes: ['start', 'word', 'end'] },
      { voiceName: 'Moira', lang: 'en-IE', remote: false, eventTypes: ['start', 'word', 'end'] },
      { voiceName: 'Google US English', lang: 'en-US', remote: true, eventTypes: ['start', 'end'] },
    ],
    speak: () => {},
  },
  runtime: { sendMessage: async () => ({}) },
  tabs: { create: () => {} },
};
