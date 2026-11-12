# Third-party notices

Glint Reader is Copyright (C) 2026 Navica LLC. It is free software, released under the GNU
General Public License, version 3 or later. See `LICENSE`.

The built-in voices (`src/voice/`) include the third-party code and data below. Each keeps its
own license. All of them can be shipped together under GPL-3.0.

| Component | Version | License | Files |
|---|---|---|---|
| eSpeak NG (inside phonemizer.js) | 1.52-dev, see below | GPL-3.0-or-later | `src/voice/vendor/phonemizer.js` |
| Emscripten runtime and musl libc (inside phonemizer.js) | Emscripten 3.1.30 | MIT | `src/voice/vendor/phonemizer.js` |
| phonemizer.js by Joshua Lochner | 1.2.1 | Apache-2.0 | `src/voice/vendor/phonemizer.js` |
| ONNX Runtime Web, Microsoft | 1.31.1 | MIT | `src/voice/vendor/ort*` |
| Kokoro-82M model by hexgrad | v1.0, 8-bit ONNX | Apache-2.0 | `src/voice/model/kokoro.onnx` |
| Kokoro-82M voice styles | v1.0 | Apache-2.0 | `src/voice/voices/*.bin` |
| kokoro-js text normalization by Joshua Lochner | 1.2.1 | Apache-2.0 | adapted in `src/voice/kokoro.js` |

## Source code

Glint Reader's own code ships as plain, readable JavaScript, so the package is its own source.
The full repository is at https://github.com/other-max/read-in-place.

`phonemizer.js` contains a compiled WebAssembly build of eSpeak NG. Its source:

- phonemizer.js 1.2.1: https://github.com/xenova/phonemizer.js, commit `6835144b7ee9`
  (npm package `phonemizer@1.2.1`, byte for byte the same as the vendored file). This
  archive holds the wrapper, the Emscripten worker, and the packed eSpeak NG data. The
  embedded eSpeak NG parts are GPL-3.0-or-later.
- eSpeak NG C source: https://github.com/espeak-ng/espeak-ng, commit `e1044031` (1.52-dev,
  2024-06-09). phonemizer.js doesn't record which commit it built, so this is the closest
  match: the packed data matches master from `890071ff` through `b864eac5`, and the engine
  code is the same across that range except for one small change in `b864eac5`. The
  Emscripten build lives in its `emscripten/` folder. The tree also bundles ucd-tools,
  which is GPL-3.0.

A copy of both source trees is attached to each Glint Reader release on GitHub, so it stays
available even if the upstream projects move. You can also ask for it at max@navica.llc.

The model file is changed by `scripts/fetch-voice.sh`, which adds one extra output (the
length of each sound). The original model is
https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX.

## MIT License

This text covers ONNX Runtime Web, Copyright (c) Microsoft Corporation; the Emscripten
runtime, Copyright (c) 2010-2014 Emscripten authors (also offered under the UIUC license);
and musl libc, Copyright (c) 2005-2020 Rich Felker, et al.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Apache License 2.0

The full text is in `src/voice/vendor/LICENSE-phonemizer`. It covers phonemizer.js, the
Kokoro-82M model and voices, and the kokoro-js code adapted in `src/voice/kokoro.js`.
Copyright holders: Joshua Lochner (phonemizer.js, kokoro-js) and hexgrad (Kokoro-82M).
