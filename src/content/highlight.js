// Paints the spoken word and sentence with the CSS Custom Highlight API. No DOM changes.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.hl) return;
  let word, sent;

  function ensure() {
    if (!word) {
      word = new Highlight();
      sent = new Highlight();
      word.priority = 2;
      sent.priority = 1;
    }
    // Re-register every time in case the page cleared the registry.
    if (CSS.highlights.get('rip-word') !== word) CSS.highlights.set('rip-word', word);
    if (CSS.highlights.get('rip-sentence') !== sent) CSS.highlights.set('rip-sentence', sent);
  }

  R.hl = {
    sentence(r) { ensure(); sent.clear(); if (r) sent.add(r); },
    word(r) { ensure(); word.clear(); if (r) word.add(r); },
    clear() {
      word?.clear();
      sent?.clear();
      CSS.highlights.delete('rip-word');
      CSS.highlights.delete('rip-sentence');
    },
  };
})();
