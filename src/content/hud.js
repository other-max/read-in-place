// Corner control. Collapsed: play/pause and speed. On hover: pause, speed -/+, settings, stop,
// each with its key hint. Closed Shadow DOM so page styles can't reach it.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.hud) return;

  const ICON = {
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7z"/></svg>',
    gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm6.3 3.6-.1-2.2 1.3-1.1-1.5-2.6-1.6.5-1.8-1.1L10.3 1H7.7l-.4 1.6-1.8 1.1-1.6-.5-1.5 2.6 1.3 1.1-.1 2.2-1.2 1.1 1.5 2.6 1.6-.5 1.8 1.1.4 1.6h2.6l.4-1.6 1.8-1.1 1.6.5 1.5-2.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  const CSS_TEXT = `
    :host { all: initial; }
    .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex;
      flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: none;
      font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #f5f5f4; -webkit-font-smoothing: antialiased; }
    .msg { background: rgba(24,24,24,.92); padding: 7px 12px; border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,.25); max-width: 280px; }
    .msg:empty { display: none; }
    .card { pointer-events: auto; background: rgba(24,24,24,.92); border-radius: 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,.28); transition: opacity .4s; padding: 4px 6px;
      display: grid; grid-template-columns: repeat(6, auto); align-items: center;
      justify-items: center; column-gap: 2px; }
    .card[hidden] { display: none; }
    .card.dim:not(:hover):not(:focus-within) { opacity: .4; }
    .x { display: none; }
    .card:hover, .card:focus-within { border-radius: 14px; padding: 6px 8px 6px; }
    .card:hover .x, .card:focus-within .x { display: inline-flex; }
    .hints { display: contents; }
    .hints > * { margin-bottom: 4px; }
    button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex;
      align-items: center; justify-content: center; border-radius: 999px; color: #f5f5f4;
      height: 28px; min-width: 28px; }
    button:hover { background: rgba(255,255,255,.14); }
    button:focus-visible { outline: 2px solid #7aa7ff; outline-offset: 1px; }
    button:disabled { opacity: .35; cursor: default; background: none; }
    button svg { width: 14px; height: 14px; fill: currentColor; }
    .rate { font-weight: 600; min-width: 40px; padding: 0 4px 0 2px; text-align: center;
      font-variant-numeric: tabular-nums; }
    .step { font-size: 18px; font-weight: 600; }
    kbd { font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #b5b5b0;
      border: 1px solid rgba(255,255,255,.25); border-radius: 4px; padding: 2px 4px; }`;

  // Six columns: pause, slower, speed, faster, settings, stop. Row 1 is key hints.
  const HTML = `
    <div class="wrap">
      <div class="msg" role="status" aria-live="polite"></div>
      <div class="card" hidden>
        <div class="hints">
          <kbd class="x">Space</kbd><kbd class="x">-</kbd><span class="x"></span>
          <kbd class="x">=</kbd><span class="x"></span><kbd class="x">Esc</kbd>
        </div>
        <button class="pp"></button>
        <button class="slower step x" aria-label="Slower">&minus;</button>
        <span class="rate"></span>
        <button class="faster step x" aria-label="Faster">+</button>
        <button class="settings x" aria-label="Settings" title="Settings">${ICON.gear}</button>
        <button class="stop x" aria-label="Stop" title="Stop (Esc)">${ICON.stop}</button>
      </div>
    </div>`;

  let host, $, timer, msgTimer, actions = {};
  let view = { mode: 'off', rate: 1, min: 0.5, max: 4 };

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('rip-hud');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS_TEXT}</style>${HTML}`;
    $ = sel => root.querySelector(sel);
    const on = (sel, fn) => $(sel).addEventListener('click', e => {
      e.stopPropagation();
      fn();
    });
    on('.pp', () => actions.togglePause?.());
    on('.slower', () => actions.slower?.());
    on('.faster', () => actions.faster?.());
    on('.settings', () => actions.settings?.());
    on('.stop', () => actions.stop?.());
    // Keep focus and selection on the page so keyboard shortcuts keep working.
    root.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    document.documentElement.appendChild(host);
    render();
  }

  const fmt = r => `${(Math.round(r * 100) / 100)}x`;

  function render() {
    if (!host) return;
    const card = $('.card');
    card.hidden = view.mode === 'off';
    if (view.mode === 'off') return;
    const paused = view.mode === 'paused';
    $('.pp').innerHTML = paused ? ICON.play : ICON.pause;
    $('.pp').setAttribute('aria-label', paused ? 'Resume (Space)' : 'Pause (Space)');
    $('.pp').title = paused ? 'Resume (Space)' : 'Pause (Space)';
    $('.rate').textContent = fmt(view.rate);
    $('.slower').disabled = view.rate <= view.min + 1e-9;
    $('.faster').disabled = view.rate >= view.max - 1e-9;
    $('.faster').title = view.rate >= view.max - 1e-9 ? `${fmt(view.max)} is this voice's top speed` : 'Faster (=)';
    $('.slower').title = 'Slower (-)';
    // Fade back after a change, but stay solid while paused so it's easy to find.
    card.classList.remove('dim');
    clearTimeout(timer);
    if (!paused) timer = setTimeout(() => card.classList.add('dim'), 1600);
  }

  R.hud = {
    bind(a) { actions = a; },
    update(v) { view = { ...view, ...v }; mount(); render(); },
    message(text, ms = 2200) {
      mount();
      $('.msg').textContent = text;
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => { if ($) $('.msg').textContent = ''; }, ms);
    },
    // Summary for tests and debugging.
    text() {
      if (!host?.isConnected) return '';
      const m = $('.msg').textContent;
      if (m) return m;
      if (view.mode === 'off') return '';
      return `${view.mode === 'paused' ? 'Paused' : 'Reading'} · ${fmt(view.rate)}`.replace(/x$/, 'x');
    },
    hide() {
      clearTimeout(timer);
      clearTimeout(msgTimer);
      host?.remove();
      host = null;
      $ = null;
      view = { ...view, mode: 'off' };
    },
    isHud: n => !!host && (n === host || host.contains(n)),
    // Test hooks: the shadow root is closed, so tests reach controls through these.
    _click: sel => $?.(sel)?.click(),
    _el: sel => $?.(sel),
  };
})();
