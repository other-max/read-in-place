# Third-party code and data in src/voice

- `ort.wasm.min.mjs`, `ort-wasm-simd-threaded.*`: ONNX Runtime Web 1.31.1, MIT License,
  Copyright (c) Microsoft Corporation.
- `phonemizer.js`: phonemizer 1.2.1 by Joshua Lochner, Apache License 2.0 (`LICENSE-phonemizer`).
  It embeds a WebAssembly build of eSpeak NG, which is GPL-3.0-or-later. Glint Reader
  is released under GPL-3.0 for this reason. See `THIRD_PARTY_NOTICES.md` at the repo root.
- `../model/kokoro.onnx`: Kokoro-82M v1.0 (hexgrad), Apache License 2.0, from the
  onnx-community/Kokoro-82M-v1.0-ONNX 8-bit build, with the per-sound durations added as an
  extra output by `scripts/fetch-voice.sh`.
- `../voices/*.bin`: Kokoro-82M voice styles, Apache License 2.0.
- Text normalization in `../kokoro.js` follows kokoro-js 1.2.1 by Joshua Lochner, Apache License 2.0.
