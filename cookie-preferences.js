(() => {
  'use strict';
  const key = 'benedito.privacy.v1';
  const version = 1;
  let choice = null, opener = null;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored?.version === version && typeof stored.maps === 'boolean') choice = stored;
  } catch { /* Preference may remain only in this visit when storage is unavailable. */ }
  const dialog = document.createElement('dialog');
  dialog.id = 'cookie-dialog'; dialog.setAttribute('aria-labelledby','cookie-title');
  dialog.innerHTML = `<div class="cookie-dialog-head"><h2 id="cookie-title">Suas preferências</h2><button type="button" class="cookie-close" aria-label="Fechar preferências">×</button></div>
    <p>Você escolhe se quer carregar o mapa do Google. A navegação, a galeria e os links do cardápio continuam disponíveis com essa opção desativada.</p>
    <div class="cookie-option"><strong>Recursos necessários <small>sempre disponíveis</small></strong><p>A hospedagem e a galeria recebem dados técnicos para entregar o site. Guardamos sua escolha de privacidade neste navegador. Esses recursos não dependem da autorização do mapa.</p></div>
    <div class="cookie-option"><label for="cookie-maps"><input type="checkbox" id="cookie-maps">Google Maps (opcional)</label><p>Ao ativar, o Google recebe dados como IP e navegador e pode usar cookies e tecnologias semelhantes, conforme suas políticas.</p></div>
    <div class="cookie-actions"><button type="button" class="consent-button secondary" data-cookie-reject>Rejeitar opcionais</button><button type="button" class="consent-button" data-cookie-save>Salvar preferências</button></div><p id="cookie-save-status" role="status"></p><p><a href="cookies.html">Como usamos cookies</a> · <a href="privacidade.html">Privacidade</a></p>`;
  document.body.append(dialog);
  const checkbox = dialog.querySelector('#cookie-maps');
  function apply() {
    const allowed = choice?.maps === true;
    document.querySelectorAll('[data-map-src]').forEach(frame => {
      if (allowed) frame.setAttribute('src',frame.dataset.mapSrc);
      else frame.removeAttribute('src');
    });
    document.querySelectorAll('[data-map-placeholder]').forEach(el => { el.hidden = allowed; });
    document.querySelectorAll('[data-map-overlay]').forEach(el => { el.hidden = !allowed; });
    checkbox.checked = allowed;
  }
  function save(maps) {
    choice = { version, maps, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(key,JSON.stringify(choice)); }
    catch { /* The active visit still respects the chosen setting. */ }
    apply();
    if (dialog.open) dialog.close();
  }
  function open(button) {
    opener = button; checkbox.checked = choice?.maps === true;
    dialog.querySelector('#cookie-save-status').textContent = '';
    if (!dialog.open) dialog.showModal();
  }
  document.addEventListener('click',e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.matches('[data-cookie-open]')) open(button);
    if (button.matches('[data-cookie-reject]')) save(false);
    if (button.matches('[data-cookie-accept]')) save(true);
    if (button.matches('[data-cookie-save]')) save(checkbox.checked);
  });
  dialog.querySelector('.cookie-close').addEventListener('click',() => dialog.close());
  dialog.addEventListener('close',() => {
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus({preventScroll:true});
  });
  apply();
})();
