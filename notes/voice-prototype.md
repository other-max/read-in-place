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
  pitch kept (`preservesPitch`). Chrome doesn't mute this up to 16x. Built-in voices skip
  speed measurement because their speed is exact.
- When the reader speaks a sentence, the service worker also sends the next one to be made
  ahead of time. Restarting from a word after a pause or a speed change reuses audio already
  made for that sentence: it seeks to the word and changes the playback rate, so there is no
  wait.

## Measurements (16-core Linux desktop, headless Chromium 156)

| | |
|---|---|
| Model load | about 2 s |
| First audio after a fresh install | about 5 s |
| Making speech, 1x (4 threads / 8 threads) | 0.57 / 0.47 s of work per second of audio |
| Keeps up with reading, with prefetch | up to about 3x. At 4x there are 0.4 to 1 s gaps between some sentences |
| Package size | 106 MB unpacked (model 92 MB, runtime 15 MB, eSpeak 1.3 MB) |

Samples recorded through Chrome's own playback are in `dist/voice-samples/` (gitignored):
Heart at 1x to 5x, Heart at 3x with only the model sped up and with only playback sped up,
and the other three voices at 3x. They are worth comparing by ear to pick `maxModelSpeed`.

## Open issues before shipping

1. **License.** The `phonemizer` package is Apache 2.0, but it embeds eSpeak NG, which is
   GPL-3.0. Shipping it likely means releasing the extension under the GPL, or swapping in a
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
