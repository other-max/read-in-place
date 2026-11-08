# Read in Place

Chrome MV3 extension that reads pages aloud in place with live word highlighting.
Plan and decisions: `notes/PLAN.md`. Research: `notes/research.md`.

- No dependencies, no bundler, plain JS. Load `src/` unpacked.
- Never mutate page DOM for highlighting. Use the CSS Custom Highlight API.
- Bump `version` in `src/manifest.json` for every hand-off; tag releases `v<version>`.
