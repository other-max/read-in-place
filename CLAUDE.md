# Glint Reader

Chrome MV3 extension (formerly Read in Place) that reads pages aloud in place with live word highlighting.
Design and decisions: `notes/PLAN.md`. Research: `notes/research.md`.

- No dependencies, no bundler, plain JS. Load `src/` unpacked.
- Never change the page DOM for highlighting. Use the CSS Custom Highlight API. The only
  element added to a page is the `<rip-hud>` host, outside `<body>`.
- Content scripts are injected in the order listed in `CONTENT_FILES` (`src/shared/common.js`).
  Each file attaches to `globalThis.__rip` and guards against double injection.
- Content code talks to the extension only through `R.platform`, so tests can fake it.
  Add new messages to `content/platform.js`, `test/fake-platform.js`, and the service worker.
- Corner controls must not move under the pointer when they open. Check with a real hover.
- Run the test page (README) after any content-script change. All tests must pass.
- Bump `version` in `src/manifest.json` and the README status for every hand-off; tag
  releases `v<version>`.
- Store listing: `CHROMEWEBSTORE.md` holds all dashboard text. Update it (version history, permissions,
  data use) with every user-facing change. Launch record: `docs/LAUNCH.md`. Any change to
  permissions, storage, or what text leaves the device also needs `docs/privacy-policy.md`.
- After any UI or copy change, rerun `store/screenshots/render.sh`. It also refreshes
  `site/img/`.
- Writing style for user-facing copy: no em dashes, Oxford comma, short plain sentences.
