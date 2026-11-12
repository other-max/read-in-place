# Chrome Web Store launch

Everything needed to list the extension, and what is still open.

## Decisions

1. **Name: Glint Reader** (chosen 2026-11-09, formerly Read in Place). Always pair it with
   "reads ... aloud", so it isn't mistaken for a reader-mode tool. The store shows the manifest
   `name`, so `name` is the full store title, "Glint Reader: reads any web page aloud, word by
   word" (52 characters). `short_name` is "Glint Reader", for places Chrome has less room.
2. **Landing page path:** `navica.llc/tools/glint-reader/`, live from `navica-marketing` PR #86.
3. **Contact:** max@navica.llc. The privacy@ and support@ aliases aren't set up.
4. **Website content** box on the Privacy tab: still open. See [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md).

## Renaming (done in 0.2.0)

Changed: `src/manifest.json` (`name`, `short_name`, `action.default_title`, `homepage_url`),
the options page title, heading, and test sentence, the service worker's console message, the
test page title, `store/description.txt`, `store/screenshots/*.html` (then re-rendered),
`site/index.html`, `docs/privacy-policy.md`, `docs/store-privacy-tab.md`, `README.md`,
`CLAUDE.md`, `notes/PLAN.md`, and the zip name in `scripts/package.sh`.

Left alone on purpose: the GitHub repository and local folder names (`read-in-place`), and the
internal `rip` prefixes (`__rip`, `rip-hud`, `rip-word`). Users never see them.

## Store listing fields

All dashboard text, assets, permission justifications, and data use answers are in
[CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md).

## Before submitting

- [x] Name chosen and applied everywhere (see Renaming)
- [x] Manifest: bump `version` (0.2.0), add `homepage_url`, and set `description` to the summary
- [ ] Test by hand from `src/` unpacked: shortcut, toolbar icon, settings, measure top speed.
  On Linux, use Google's .deb Chrome, not the Flatpak, which has no voices.
- [ ] Test suite passes (`test/index.html?auto`)
- [x] Landing page and privacy page live on navica.llc (`navica-marketing` PR #86)
- [ ] Decide the Website content box (decision 4)
- [ ] `scripts/package.sh`, upload the zip, fill the listing and Privacy tab, submit for review

## Later

- Automate uploads the way the Karbon timer does (tag, then the Release workflow submits it).
  Only one service account can be added per publisher, so reuse the timer's account, or
  upload by hand.
