#!/bin/sh
# Downloads the Kokoro-82M voice model (8-bit, about 92 MB) and adds the per-sound
# durations as a second output, which the word highlighting needs.
# Writes src/voice/model/kokoro.onnx. Needs python3 (makes a throwaway venv for the onnx package).
set -e
cd "$(dirname "$0")/.."
out=src/voice/model/kokoro.onnx
url=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx
sum=fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL -o "$tmp/model.onnx" "$url"
echo "$sum  $tmp/model.onnx" | sha256sum -c -
python3 -m venv "$tmp/venv"
"$tmp/venv/bin/pip" -q install onnx
"$tmp/venv/bin/python" -I - "$tmp/model.onnx" "$out" <<'PY'
import onnx, sys
m = onnx.load(sys.argv[1])
name = '/encoder/Clip_output_0'  # rounded frames per sound, 600 samples each at 24 kHz
if name not in {o.name for o in m.graph.output}:
    m.graph.output.append(onnx.helper.make_empty_tensor_value_info(name))
onnx.save(m, sys.argv[2])
PY
echo "$out"
