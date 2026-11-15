(() => {
  const launch = document.querySelector('.delivery-launch');
  const dialog = document.getElementById('delivery-dialog');
  const whats = document.querySelector('.bene-whats');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const shortcuts = [launch, whats];
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let next = 0;
  let pulseTimer;
  let closeTimer;

  launch.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener('close', () => launch.focus());
  launch.hidden = false;

  function clearPulse() {
    clearTimeout(closeTimer);
    shortcuts.forEach(shortcut => shortcut.removeAttribute('data-pulse'));
  }

  function pulse() {
    const shortcut = shortcuts[next];
    next = (next + 1) % shortcuts.length;
    if (!document.querySelector('dialog[open], body.bene-admin-open, .bene-hours[open]') &&
      !shortcuts.some(item => item.matches(':focus-visible')) &&
      !(hover.matches && shortcuts.some(item => item.matches(':hover')))) {
      shortcut.setAttribute('data-pulse', '');
      closeTimer = setTimeout(clearPulse, 3200);
    }
    pulseTimer = setTimeout(pulse, 12000);
  }

  function schedule() {
    clearTimeout(pulseTimer);
    clearPulse();
    if (!document.hidden && !reducedMotion.matches) pulseTimer = setTimeout(pulse, 4200);
  }

  shortcuts.forEach(shortcut => {
    shortcut.addEventListener('click', clearPulse);
    shortcut.addEventListener('focus', clearPulse);
    shortcut.addEventListener('pointerenter', () => { if (hover.matches) clearPulse(); });
  });
  document.getElementById('bene-hours').addEventListener('toggle', clearPulse);
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  schedule();
})();
