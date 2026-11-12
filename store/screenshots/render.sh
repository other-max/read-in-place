#!/bin/bash
# Renders the Chrome Web Store screenshots (1280x800) and promo tiles (440x280, 1400x560)
# to store/screenshots/out/. Copies src/ to a work folder, opens the corner control's shadow
# root and stubs chrome.* there, serves it locally, and shoots each page with headless Chrome.
# Works with a packaged or Flatpak Chrome on Linux (needs Python with Pillow) and on macOS.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
port="${PORT:-8797}"
# The work folder sits beside the script, since a Flatpak Chrome can't read /tmp.
tmp="$here/.work"
rm -rf "$tmp"; mkdir -p "$tmp/shots"
trap 'kill $server 2>/dev/null || true; rm -rf "$tmp"' EXIT

mac_chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -n "${CHROME:-}" ]; then chrome=("$CHROME")
elif [ -x "$mac_chrome" ]; then chrome=("$mac_chrome")
elif command -v google-chrome >/dev/null; then chrome=(google-chrome)
elif flatpak info com.google.Chrome >/dev/null 2>&1; then chrome=(flatpak run com.google.Chrome)
else echo "Chrome not found; set CHROME." >&2; exit 1; fi

cp -R "$root/src" "$tmp/src"
cp "$here"/*.html "$here"/*.css "$here"/*.js "$root/test/fake-platform.js" "$tmp/shots/"
# Shots only: open the shadow root so pose.js can keep the pill solid or show it hovered.
perl -pi -e "s/attachShadow\(\{ mode: 'closed' \}\)/attachShadow({ mode: 'open' })/" "$tmp/src/content/hud.js"
cp "$here/options-stub.js" "$tmp/src/options/"
perl -0pi -e 's#<script src="../shared/common.js">#<script src="options-stub.js"></script>\n  <script src="../shared/common.js">#' "$tmp/src/options/options.html"

# Off the Mac, system-ui falls back to a wide font, so name one closer to Segoe UI and SF first.
font="${FONT:-}"
[ -z "$font" ] && [ ! -x "$mac_chrome" ] && font="Open Sans"
if [ -n "$font" ]; then
  find "$tmp/src" "$tmp/shots" -type f \( -name '*.css' -o -name '*.html' -o -name '*.js' \) \
    -exec perl -pi -e "s/(?<![-\\w\"])system-ui/'$font', system-ui/g" {} +
fi

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$tmp" >/dev/null 2>&1 &
server=$!
sleep 1

# Scales the 2x render to the store's size and flattens it: 24-bit, no alpha.
flatten() { # in, out, width, height
  python3 -I -c 'import sys; from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").resize((int(sys.argv[3]), int(sys.argv[4])), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)' "$@"
}

mkdir -p "$here/out"
shoot() { # page, output name, width, height
  local png="$tmp/$2.png" w="${3:-1280}" h="${4:-800}"
  "${chrome[@]}" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$tmp/profile-$2" --window-size=$w,$h --force-device-scale-factor=2 \
    --virtual-time-budget=4000 --screenshot="$png" "http://127.0.0.1:$port/shots/$1" >/dev/null 2>&1
  flatten "$png" "$here/out/$2.png" "$w" "$h"
  echo "out/$2.png"
}
shoot shot1-read.html 1-read
shoot shot2-click.html 2-click
shoot shot3-speed.html 3-speed
shoot shot4-keys.html 4-keys
shoot shot5-settings.html 5-settings
shoot small.html small-tile 440 280
shoot marquee.html marquee 1400 560

# Landing page images: the browser window alone, at full 2x, from the shots above.
crop() { # shot, out name, bottom edge in 1x pixels
  python3 -I -c 'import sys; from PIL import Image
Image.open(sys.argv[1]).convert("RGB").crop((2*460, 2*50, 2*1232, 2*int(sys.argv[3]))).save(sys.argv[2], optimize=True)' \
    "$tmp/$1.png" "$here/out/$2.png" "$3"
  echo "out/$2.png"
}
crop 1-read site-hero 640
crop 2-click site-click 750
crop 3-speed site-speed 750
crop 5-settings site-settings 750

# The landing page uses the browser-only crops.
mkdir -p "$root/site/img"
cp "$here"/out/site-*.png "$root/site/img/"
