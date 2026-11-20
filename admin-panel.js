(() => {
  'use strict';
  window.BeneAdmin = { mount(root) {
    const $ = id => root.getElementById(id);
    const api = window.BeneAdminAPI;
    const categories = { comida: 'Comida', drinks: 'Drinks', sobremesa: 'Sobremesas', ambiente: 'Ambiente', identidade: 'Identidade' };
    const seed = JSON.parse($('seed-data').textContent);
    const key = 'benedito.gallery.demo.v1';
    function loadDemo() {
      try {
        const d = JSON.parse(localStorage.getItem(key));
        if (d?.version !== 1 || !Array.isArray(d.photos)) return structuredClone(seed);
        return seed.map(s => {
          const p = d.photos.find(v => v.id === s.id);
          return p ? { ...s, title: String(p.title || s.title).slice(0,70), caption: String(p.caption || '').slice(0,240),
            alt: String(p.alt || s.alt).slice(0,300), category: categories[p.category] ? p.category : s.category,
            visible: p.visible !== false, position: Number.isFinite(p.position) ? p.position : s.position, deleted: p.deleted === true } : s;
        }).filter(p => !p.deleted).sort((a,b) => a.position-b.position);
      } catch { return structuredClone(seed); }
    }
    let photos = api ? [] : loadDemo(), revision = 0, filter = 'all', dirty = false, busy = false, editing = null;
    let toastTimer, objectUrls = [], queue = [], disabledControls = [], mustReload = false;
    function el(tag, cls, text) {
      const n = document.createElement(tag); if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text; return n;
    }
    function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
    function markDirty() { dirty = true; $('save').disabled = false; $('save-state').textContent = 'Alterações não salvas'; }
    function setBusy(value) {
      busy = value; $('app').setAttribute('aria-busy', String(value));
      if (value) {
        disabledControls = [...root.querySelectorAll('button,input,select,textarea')].map(n => [n,n.disabled]);
        disabledControls.forEach(([n]) => n.disabled = true);
      } else { disabledControls.forEach(([n,disabled]) => n.disabled = disabled); disabledControls = []; }
    }
    function action(text, label, fn) { const b = el('button','btn',text); b.type = 'button'; b.setAttribute('aria-label',label); b.onclick = fn; return b; }
    function accept(data) { photos = data.photos; revision = data.revision; dirty = false; mustReload = false; $('save').disabled = true; $('save-state').textContent = 'Salvo no armazenamento'; }
    function render() {
      $('total').textContent = photos.length; $('visible-count').textContent = photos.filter(p => p.visible).length;
      $('category-count').textContent = new Set(photos.map(p => p.category)).size; $('tabs').replaceChildren();
      for (const [value,label] of Object.entries({ all:'Todas', ...categories })) {
        const b = action(label,'Filtrar: '+label,() => { filter = value; render(); });
        b.className = 'tab'; b.setAttribute('aria-pressed',String(filter === value)); $('tabs').append(b);
      }
      const q = $('search').value.trim().toLocaleLowerCase('pt-BR');
      const items = photos.filter(p => (filter === 'all' || p.category === filter) && [p.title,p.caption].join(' ').toLocaleLowerCase('pt-BR').includes(q));
      $('results').textContent = items.length+' de '+photos.length+' fotos'; $('empty').hidden = !!items.length; $('cards').replaceChildren();
      for (const p of items) {
        const card = el('article','card'+(p.visible ? '' : ' off')), media = el('div','card-media'), img = el('img');
        img.src = p.src; img.alt = p.alt; img.dataset.photo = p.id; img.loading = 'lazy'; media.append(img,el('span','badge',categories[p.category]));
        const body = el('div','card-body'); body.append(el('h3','',p.title),el('p','',p.caption || 'Sem legenda'));
        const foot = el('div','card-footer'), moves = el('div','move'), index = photos.indexOf(p);
        for (const [delta,label] of [[-1,'↑'],[1,'↓']]) {
          const b = action(label,(delta < 0 ? 'Mover para cima: ' : 'Mover para baixo: ')+p.title,() => {
            [photos[index],photos[index+delta]] = [photos[index+delta],photos[index]];
            photos.forEach((v,i) => v.position = i); markDirty(); render();
          }); b.disabled = index+delta < 0 || index+delta >= photos.length; moves.append(b);
        }
        foot.append(action('Editar','Editar '+p.title,() => openEdit(p.id)),el('span','badge'+(p.visible ? ' green' : ''),p.visible ? 'Visível' : 'Oculta'),moves);
        body.append(foot); card.append(media,body); $('cards').append(card);
      }
    }
    function openEdit(id) {
      editing = id; const p = photos.find(p => p.id === id); $('edit-img').src = p.src; $('edit-img').dataset.photo = p.id;
      for (const k of ['title','caption','alt','category']) $(k).value = p[k];
      $('visible').checked = p.visible; $('edit').showModal();
    }
    function confirmAction(title,message,fn) { $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-yes').onclick = () => { $('confirm').close(); fn(); }; $('confirm').showModal(); }
    function showLogin() {
      photos = api ? [] : loadDemo(); dirty = false; $('app').hidden = true; $('login').hidden = false;
      $('password').value = ''; $('cards').replaceChildren(); $('save').disabled = true;
      $('save-state').textContent = 'Sem alterações'; $('email').focus();
    }
    $('confirm-no').onclick = () => $('confirm').close();
    for (const [value,label] of Object.entries(categories)) { const option = el('option','',label); option.value = value; $('category').append(option); }
    $('explore').onclick = async () => {
      if (busy) return;
      if (!api) { $('login').hidden = true; $('app').hidden = false; render(); $('search').focus(); return; }
      if (!$('email').reportValidity() || !$('password').reportValidity()) return;
      setBusy(true);
      try {
        const data = await api.login($('email').value.trim(),$('password').value); accept(data);
        $('login').hidden = true; $('app').hidden = false; $('password').value = ''; setBusy(false); render(); $('search').focus();
      } catch (error) { setBusy(false); toast(error.message); $('password').value = ''; $('password').focus(); }
    };
    $('exit').onclick = () => {
      const leave = async () => { if (api) { setBusy(true); try { await api.logout(); } catch { toast('A sessão local foi encerrada. Não foi possível confirmar a saída no servidor.'); } finally { setBusy(false); } } showLogin(); };
      if (dirty) confirmAction('Sair do painel?','As alterações ainda não salvas serão descartadas.',leave); else leave();
    };
    $('edit-form').onsubmit = e => {
      e.preventDefault(); const title = $('title').value.trim(), alt = $('alt').value.trim();
      if (!title || !alt) { toast('Preencha o nome e a descrição da foto.'); return; }
      Object.assign(photos.find(p => p.id === editing),{title,alt,caption:$('caption').value.trim(),category:$('category').value,visible:$('visible').checked});
      markDirty(); render(); $('edit').close(); toast('Foto ajustada. Salve a galeria para aplicar.');
    };
    $('remove').onclick = () => confirmAction('Remover esta foto da galeria?',api ? 'A remoção será aplicada ao salvar. Uma foto já publicada pode continuar acessível por link e em caches.' : 'A foto será removida somente desta demonstração.',() => { photos = photos.filter(p => p.id !== editing); markDirty(); render(); $('edit').close(); });
    $('save').onclick = async () => {
      if (busy) return; if (mustReload) { toast('Recarregue os dados antes de salvar ou enviar novas fotos.'); return; } photos.forEach((p,i) => p.position = i); setBusy(true);
      try {
        if (api) accept(await api.save(revision,photos));
        else { localStorage.setItem(key,JSON.stringify({version:1,photos:seed.map(s => photos.find(p => p.id === s.id) || {id:s.id,deleted:true})})); dirty = false; }
        setBusy(false); $('save').disabled = true; $('save-state').textContent = api ? 'Salvo no armazenamento' : 'Salvo neste navegador'; render();
        toast(api ? 'Galeria salva no ambiente de testes.' : 'Rascunho salvo neste navegador. O site não foi alterado.');
        if (api) window.dispatchEvent(new Event('bene:gallery-updated'));
      } catch (error) { setBusy(false); $('save').disabled = false; toast(error.message); }
    };
    $('reset').onclick = () => confirmAction(api ? 'Recarregar a galeria?' : 'Restaurar a demonstração?',api ? 'Os ajustes ainda não salvos serão descartados.' : 'Os ajustes locais serão descartados.',async () => {
      setBusy(true); try {
        if (api) accept(await api.load()); else { localStorage.removeItem(key); photos = structuredClone(seed); dirty = false; }
        filter = 'all'; $('search').value = ''; setBusy(false); $('save').disabled = true; render(); toast('Galeria recarregada.');
      } catch (error) { setBusy(false); toast(error.message); }
    });
    $('search').oninput = render; $('clear').onclick = () => { filter = 'all'; $('search').value = ''; render(); };
    $('preview').onclick = () => {
      $('preview-grid').replaceChildren(); const shown = photos.filter(p => p.visible);
      for (const p of shown) { const f = el('figure'), img = el('img'); img.src = p.src; img.alt = p.alt; img.dataset.photo = p.id; f.append(img,el('figcaption','',p.title+(p.caption ? ' · '+p.caption : ''))); $('preview-grid').append(f); }
      if (!shown.length) $('preview-grid').append(el('p','','Nenhuma foto visível.')); $('gallery-preview').showModal();
    };
    const send = $('upload').querySelector('.modal-footer .primary'); send.id = 'send-files';
    function clearQueue() { objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; queue = []; $('queue').replaceChildren(); $('files').value = ''; $('file-feedback').textContent = ''; send.disabled = true; }
    $('add').onclick = () => { if (mustReload) { toast('A última operação pode ter sido concluída. Recarregue os dados antes de enviar novamente.'); return; } if (api && dirty) { toast('Salve ou recarregue os ajustes antes de adicionar fotos.'); return; } clearQueue(); $('upload').showModal(); };
    $('upload').addEventListener('close',clearQueue); $('upload').addEventListener('cancel',e => { if (busy) e.preventDefault(); });
    $('files').onchange = () => {
      objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; $('queue').replaceChildren();
      const all = [...$('files').files]; queue = all.slice(0,10).filter(f => ['image/jpeg','image/png','image/webp'].includes(f.type) && f.size > 0 && f.size <= 15*1024*1024);
      $('file-feedback').textContent = queue.length+' foto(s) selecionada(s).'+(queue.length !== all.length ? ' Alguns arquivos foram ignorados por tipo, tamanho ou limite de 10 fotos.' : '');
      for (const f of queue) { const url = URL.createObjectURL(f); objectUrls.push(url); const figure = el('figure'), img = el('img'); img.src = url; img.alt = 'Prévia de '+f.name; figure.append(img,el('figcaption','',f.name)); $('queue').append(figure); }
      send.disabled = !api || !queue.length;
    };
    send.onclick = async () => {
      if (!api || busy || !queue.length) return; const files = [...queue]; let done = 0; setBusy(true);
      try {
        for (const file of files) { accept(await api.upload(file)); done++; $('file-feedback').textContent = `${done} de ${files.length} foto(s) enviada(s).`; }
        setBusy(false); render(); $('upload').close(); toast('Fotos enviadas e ocultas. Edite os detalhes e salve para mostrar na galeria.');
      } catch (error) {
        setBusy(false); render(); mustReload = true; $('save').disabled = true; $('save-state').textContent = 'Recarregue os dados'; $('upload').close();
        toast(`${done} foto(s) confirmada(s). A última operação pode ter sido concluída. Recarregue os dados antes de reenviar. ${error.message}`);
      }
    };
    root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { if (!busy) b.closest('dialog').close(); });
    window.addEventListener('beforeunload',e => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } });
    if (api) {
      const login = $('login'); login.querySelector('.badge').textContent = 'ADMINISTRAÇÃO / TESTES';
      login.querySelector('.notice').textContent = 'Entre com a conta autorizada para administrar a galeria. Este é o ambiente de testes da Miralto.';
      for (const id of ['email','password']) { $(id).disabled = false; $(id).required = true; $(id).addEventListener('keydown',e => { if (e.key === 'Enter') { e.preventDefault(); $('explore').click(); } }); }
      $('email').placeholder = 'seu@email.com'; $('email').autocomplete = 'username';
      $('password').placeholder = 'Sua senha do painel'; $('password').autocomplete = 'current-password'; $('explore').textContent = 'Entrar no painel ↗';
      $('exit').textContent = 'Sair do painel'; $('app').querySelector('.avatar small').textContent = 'Ambiente de testes';
      $('app').querySelector('header .badge').textContent = 'TESTES MIRALTO';
      $('app').querySelector('.notice>span').textContent = 'As alterações salvas são compartilhadas no ambiente de testes. Fotos publicadas ficam acessíveis por link.';
      $('save').textContent = 'Salvar galeria'; $('reset').textContent = 'Recarregar dados';
      $('upload').querySelector('.notice').textContent = 'As fotos são validadas no servidor e entram ocultas. Depois de enviar, edite os detalhes e salve a visibilidade.';
      send.textContent = 'Enviar fotos'; $('upload').querySelector('.modal-footer [data-close]').textContent = 'Cancelar';
      window.addEventListener('bene:session-ended',() => { root.querySelectorAll('dialog[open]').forEach(d => d.close()); showLogin(); });
      let lastRenewal = 0, renewing = false;
      async function renewImages() {
        if (busy || renewing || $('app').hidden || Date.now()-lastRenewal < 30000) return;
        renewing = true; lastRenewal = Date.now();
        try {
          const data = await api.load(); const fresh = new Map(data.photos.map(p => [p.id,p.src]));
          photos.forEach(p => { if (fresh.has(p.id)) p.src = fresh.get(p.id); });
          root.querySelectorAll('img[data-photo]').forEach(img => { if (fresh.has(img.dataset.photo)) img.src = fresh.get(img.dataset.photo); });
        } catch { /* Recarregar dados continua disponível; a API encerra sessões expiradas. */ }
        finally { renewing = false; }
      }
      setInterval(renewImages, 230000);
      root.addEventListener('error',e => { if (e.target.matches?.('img[data-photo]')) renewImages(); },true);
    }
  } };
})();
