#!/bin/sh
# Zips src/ into dist/read-in-place-<version>.zip for the Chrome Web Store or sharing.
set -e
cd "$(dirname "$0")/.."
v=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
mkdir -p dist
rm -f "dist/read-in-place-$v.zip"
(cd src && zip -qr "../dist/read-in-place-$v.zip" . -x '.*')
echo "dist/read-in-place-$v.zip"
