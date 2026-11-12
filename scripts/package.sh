#!/bin/sh
# Zips src/ into dist/glint-reader-<version>.zip for the Chrome Web Store or sharing.
set -e
cd "$(dirname "$0")/.."
v=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
mkdir -p dist
rm -f "dist/glint-reader-$v.zip"
(cd src && zip -qr "../dist/glint-reader-$v.zip" . -x '.*')
echo "dist/glint-reader-$v.zip"
