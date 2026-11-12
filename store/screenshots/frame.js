// Wraps each .browser element in a browser window: tab strip, address bar, and the toolbar
// icon with its badge. The page itself goes in the element as an iframe.
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
for (const b of document.querySelectorAll('.browser')) {
  const d = b.dataset;
  const page = b.innerHTML;
  const badge = d.badge ? `<span class="badge"${d.badgeColor ? ` style="background:${d.badgeColor}"` : ''}>${d.badge}</span>` : '';
  b.innerHTML = `
    <div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab">${d.tab || ''}</div></div>
    <div class="toolbar">
      ${svg('M15 6l-6 6 6 6')}${svg('M9 6l6 6-6 6')}${svg('M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4')}
      <div class="addr">${svg('M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z')}${d.url || ''}</div>
      <div class="ext ${d.badge ? 'on' : ''}"><img src="../src/icons/icon32.png" alt="">${badge}</div>
      ${svg('M12 5h.01M12 12h.01M12 19h.01')}
    </div>
    <div class="viewport">${page}</div>`;
}
