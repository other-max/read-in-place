// Small status pill in the corner (speed, paused). Shadow DOM so page styles can't touch it.
(() => {
  const R = (globalThis.__rip ||= {});
  if (R.hud) return;
  let host, pill, timer;

  const CSS_TEXT = `
    .pill { font: 600 13px/1.2 -apple-system, system-ui, sans-serif; color: #fff;
      background: rgba(24, 24, 24, .9); padding: 7px 12px; border-radius: 999px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, .25); transition: opacity .4s; white-space: nowrap; }
    .dim { opacity: .35; }`;

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('rip-hud');
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;' +
      'z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS_TEXT}</style><div class="pill"></div>`;
    pill = root.querySelector('.pill');
    document.documentElement.appendChild(host);
  }

  R.hud = {
    show(text, { sticky = false } = {}) {
      mount();
      pill.textContent = text;
      pill.classList.remove('dim');
      clearTimeout(timer);
      if (!sticky) timer = setTimeout(() => pill.classList.add('dim'), 1600);
    },
    text: () => (host?.isConnected ? pill.textContent : ''),
    hide() {
      clearTimeout(timer);
      host?.remove();
      host = null;
    },
    isHud: n => !!host && (n === host || host.contains(n)),
  };
})();
