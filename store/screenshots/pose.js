// Poses the real content scripts for a screenshot: reading at a chosen word, frozen there.
// Query: el (block id), word (text to land on), rate, cap, paused, open (hover controls), msg,
// cursor (draw a pointer on the word), top (leave the page scrolled to the top), scroll.
// render.sh opens the corner control's shadow root in its work copy so `open` can style it.
(async () => {
  const q = new URLSearchParams(location.search);
  const R = globalThis.__rip, P = R.platform, C = globalThis.RIP_COMMON;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // The highlight colors the service worker would inject with insertCSS.
  const style = document.createElement('style');
  style.textContent = C.cssFor(C.DEFAULTS);
  document.head.append(style);

  // A silent voice that never moves on, so the word stays put.
  P.speak = () => {};
  P.fake.cap = Number(q.get('cap') || 4);
  P._store.rate = Number(q.get('rate') || 1);

  const el = document.getElementById(q.get('el') || 'p1');
  if (!q.has('top')) el.scrollIntoView({ block: 'center' });
  await R.reader.start();
  const word = q.get('word');
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n; word && (n = tw.nextNode());) {
    const i = n.data.indexOf(word);
    if (i >= 0) { R.reader.jumpTo(n, i); break; }
  }
  await wait(30);
  if (!q.has('top')) el.scrollIntoView({ block: 'center' });
  if (q.has('paused')) R.reader.pause();
  clearTimeout(R.reader.st.est);
  clearInterval(R.reader.st.beat);
  if (q.get('msg')) R.hud.message(q.get('msg'), 1e8);

  // Keep the pill solid, and optionally show it as it looks on hover.
  const root = document.querySelector('rip-hud')?.shadowRoot;
  if (root) {
    const s = document.createElement('style');
    s.textContent = '.card.dim{opacity:1!important}' + (q.has('open')
      ? '.card{border-radius:14px;padding-top:6px;padding-left:6px}.card .x{display:inline-flex}' : '');
    root.append(s);
  }
  if (q.has('scroll')) window.scrollTo(0, Number(q.get('scroll')));

  // A pointer over the current word, for the click-to-start shot.
  if (q.has('cursor')) {
    await wait(30);
    const r = [...CSS.highlights.get('rip-word')][0].getBoundingClientRect();
    const c = document.createElement('div');
    c.style.cssText = `position:fixed;left:${r.left + r.width * 0.55}px;top:${r.top + r.height * 0.55}px;z-index:2147483646;pointer-events:none`;
    c.innerHTML = '<svg width="26" height="32" viewBox="0 0 26 32"><path d="M2 2v24l6.5-6 4.5 10 4-1.8-4.4-9.8H22z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.body.append(c);
  }
})();
