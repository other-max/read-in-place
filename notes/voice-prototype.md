# Built-in voice prototype (branch voice-prototype)

Goal: a voice that ships inside the extension, so Glint Reader doesn't depend on the voices
the OS gives Chrome. On Linux, Chrome only sees Google's online voices, and those blur at speed.

## How it works

- Model: Kokoro-82M v1.0, the 8-bit ONNX build (92 MB), Apache 2.0. Four voices are bundled
  (Heart, Bella, Michael, and Emma, at 0.5 MB each). It is English only.
- `scripts/fetch-voice.sh` downloads the model and adds one extra output: the length of each
  sound, in frames of 600 samples at 24 kHz. The model file is gitignored.
- The extension registers itself as a speech engine (`chrome.ttsEngine`), so the voices appear
  in `chrome.tts.getVoices()` as "Heart (Glint built-in)" and so on. The reader, options
  page, and voice picker work unchanged. On a computer whose only voices are online ones,
  `pickVoice` chooses Heart by default, because on-device voices score higher.
- The service worker passes speech requests to an offscreen page (`src/voice/offscreen.*`).
  That page plays the audio and runs the model in a module worker (`tts-worker.js` and
  `kokoro.js`) using ONNX Runtime Web (WebAssembly, up to 8 threads; COOP and COEP are set in
  the manifest so threads work).
- Word timing is exact, not estimated. Each word is turned into sounds on its own (eSpeak NG
  via the `phonemizer` package), so every sound the model times belongs to one word. A word's
  start is the sum of the sound lengths before it.
- Speed: up to 1.75x the model itself speaks faster. Above that, playback is sped up with
  pitch kept, by our own WSOLA time stretch (`stretch.js`). Built-in voices skip speed
  measurement because their speed is exact.
- Each sentence is made in short runs cut at punctuation (about 50 sounds first, doubling up
  to 110), and each run plays as soon as it is ready. The model's silence padding is trimmed
  where runs of one sentence join. Before 0.2.8 a long sentence was one short clause plus
  one big run, which paused for several seconds partway through.
- Playback is Web Audio: each run is queued to start as the one before it ends. Before 0.2.8
  each run was an `<audio>` element, and Chrome showed its media controls icon in the
  toolbar for every run over about 5 seconds, so the icon came and went while reading.
- When the reader speaks a sentence, the service worker also sends the next three (up to
  about 600 characters) to be made ahead of time, in order. Restarting from a word after a pause or a speed change reuses audio already
  made for that sentence: it seeks to the word and changes the playback rate, so there is no
  wait.

## Measurements (16-core Linux desktop, headless Chromium 156)

| | |
|---|---|
| Model load | about 2 s |
| First audio after a fresh install | about 5 s |
| Making speech, 1x (4 threads / 8 threads) | 0.57 / 0.47 s of work per second of audio |
| Long sentence (294 chars), longest wait partway (0.2.7 / 0.2.8) | 3.7 s / none |
| Keeps up with reading, with prefetch | up to about 3x. At 4x there are 0.4 to 1 s gaps between some sentences |
| Package size | 106 MB unpacked (model 92 MB, runtime 15 MB, eSpeak 1.3 MB) |

Samples recorded through Chrome's own playback are in `dist/voice-samples/` (gitignored):
Heart at 1x to 5x, Heart at 3x with only the model sped up and with only playback sped up,
and the other three voices at 3x. They are worth comparing by ear to pick `maxModelSpeed`.

## Open issues before shipping

1. **License (decided 2026-11-12).** The `phonemizer` package is Apache 2.0, but it embeds
   eSpeak NG, which is GPL-3.0. We chose to ship it: Glint Reader is now GPL-3.0-or-later
   (`LICENSE`, `THIRD_PARTY_NOTICES.md`). Each release must make the source available,
   including the phonemizer.js and eSpeak NG source trees. The exact eSpeak NG commit that
   phonemizer 1.2.1 was built from isn't recorded upstream. To be exact, rebuild eSpeak NG
   from a pinned commit with Emscripten. The fallback, if GPL ever becomes a problem, is a
   dictionary-based phonemizer (CMUdict plus rules, as Kokoro's own `misaki` does).
2. **Speed past 3x.** Making speech is the limit. Options: WebGPU (Kokoro runs several times
   faster there, but needs the fp32 or fp16 model at 163 to 325 MB, so it would be downloaded
   on first use rather than bundled), a higher `maxModelSpeed` (less audio to make), or a
   lighter model such as Piper for the top speeds.
3. **Size.** 106 MB is allowed in the Web Store but large. Option: ship without the model and
   download it on first use. That needs `unlimitedStorage` or the Cache API, and a privacy
   policy line.
4. **Store paperwork** if this ships: new permissions (`ttsEngine` and `offscreen`) in
   CHROMEWEBSTORE.md and docs/privacy-policy.md. No text leaves the device.
5. Words are turned into sounds one at a time, so context is lost: "read" is always present
   tense, and "the" is never "thee" before a vowel. The model's intonation still uses the
   whole sentence.
6. Only tested headless. Needs a listen on real hardware, and a try on a Mac and a Chromebook
   for speed.
