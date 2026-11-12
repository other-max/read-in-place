#!/bin/sh
# Zips src/ into dist/glint-reader-<version>.zip for the Chrome Web Store or sharing.
set -e
cd "$(dirname "$0")/.."
v=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
mkdir -p dist
rm -f "dist/glint-reader-$v.zip"
test -f src/voice/model/kokoro.onnx || { echo "Missing voice model. Run scripts/fetch-voice.sh first." >&2; exit 1; }
(cd src && zip -qr "../dist/glint-reader-$v.zip" . -x '.*')
# License texts ship at the root of the package (GPL-3.0 needs them with every copy).
zip -qj "dist/glint-reader-$v.zip" LICENSE THIRD_PARTY_NOTICES.md
echo "dist/glint-reader-$v.zip"
