(() => {
  'use strict';
  const $ = q => document.querySelector(q);
  const menuButton = $('#menu-toggle'), nav = $('#nav');
  menuButton.addEventListener('click',() => {
    const open = nav.classList.toggle('open'); menuButton.setAttribute('aria-expanded',String(open));
    menuButton.setAttribute('aria-label',open ? 'Fechar menu' : 'Abrir menu');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click',() => { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded','false'); menuButton.setAttribute('aria-label','Abrir menu'); }));
  $('#year').textContent = new Date().getFullYear();
  const grid = $('#gallery-grid'), filters = $('.filters'), dialog = $('#lightbox'), img = $('#lightbox-photo');
  let tiles = [...grid.querySelectorAll('.gallery-tile')], current = tiles.slice(), index = 0, opener = null, category = 'todos';
  function applyFilter() {
    current = tiles.filter(t => category === 'todos' || t.dataset.category === category);
    tiles.forEach(t => t.hidden = !current.includes(t)); grid.classList.toggle('filtered',category !== 'todos');
    filters.querySelectorAll('button').forEach(b => { b.classList.toggle('selected',b.dataset.filter === category); b.setAttribute('aria-pressed',String(b.dataset.filter === category)); });
  }
  filters.addEventListener('click',e => { const b = e.target.closest('button'); if (b && filters.contains(b)) { category = b.dataset.filter; applyFilter(); } });
  function show(n) {
    if (!current.length) return; index = (n+current.length)%current.length;
    const tile = current[index]; img.src = tile.dataset.full; img.alt = tile.querySelector('img').alt;
    $('#lightbox-title').textContent = tile.dataset.label; $('#gallery-count').textContent = `${index+1} / ${current.length}`;
  }
  grid.addEventListener('click',e => { const tile = e.target.closest('.gallery-tile'); if (!tile || !grid.contains(tile)) return; opener = tile; show(current.indexOf(tile)); dialog.showModal(); });
  $('#close-lightbox').addEventListener('click',() => dialog.close());
  $('#prev-photo').addEventListener('click',() => show(index-1)); $('#next-photo').addEventListener('click',() => show(index+1));
  dialog.addEventListener('click',e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close',() => { if (opener?.isConnected) opener.focus(); });
  document.addEventListener('keydown',e => {
    if (e.key === 'Escape') { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded','false'); }
    if (dialog.open) { if (e.key === 'ArrowLeft') show(index-1); if (e.key === 'ArrowRight') show(index+1); }
  });
  function galleryStatus(message, retry = false) {
    if (dialog.open) dialog.close(); grid.replaceChildren(); tiles = []; current = [];
    const status = document.createElement('p'); status.setAttribute('role','status'); status.style.gridColumn = '1 / -1'; status.textContent = message;
    if (retry) {
      const button = document.createElement('button'); button.className = 'btn'; button.textContent = 'Tentar novamente';
      button.addEventListener('click',() => window.dispatchEvent(new Event('bene:gallery-updated'))); status.append(document.createElement('br'),button);
    }
    grid.append(status);
  }
  window.addEventListener('bene:gallery-loading',() => galleryStatus('Carregando a galeria…'));
  window.addEventListener('bene:gallery-unavailable',() => galleryStatus('Não foi possível carregar a galeria agora. ',true));
  window.addEventListener('bene:gallery-data',e => {
    const photos = e.detail, labels = {todos:'TUDO',comida:'COMIDA',drinks:'DRINKS',sobremesa:'SOBREMESAS',ambiente:'AMBIENTE',identidade:'IDENTIDADE'};
    if (dialog.open) dialog.close(); grid.replaceChildren(); grid.classList.add('is-managed');
    photos.forEach((p,i) => {
      const button = document.createElement('button'); button.className = 'gallery-tile';
      button.dataset.category = p.category; button.dataset.full = p.src; button.dataset.label = p.title+(p.caption ? ' · '+p.caption : '');
      const photo = document.createElement('img'); photo.src = p.src; photo.alt = p.alt; photo.loading = 'lazy';
      const photoFrame=document.createElement('span');photoFrame.className='gallery-photo-frame';photoFrame.append(photo);
      const c=p.crop;
      if(c && ['x','y','zoom'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])) && c.x>=0&&c.x<=100&&c.y>=0&&c.y<=100&&c.zoom>=1&&c.zoom<=3){
        photo.style.setProperty('--photo-zoom',c.zoom);photo.style.setProperty('--photo-x',c.x+'%');photo.style.setProperty('--photo-y',c.y+'%');
      }
      const number = document.createElement('span'); number.className = 'g-index'; number.textContent = `${String(i+1).padStart(2,'0')} / ${labels[p.category] || ''}`;
      const title = document.createElement('strong'); title.textContent = p.title;
      const expand = document.createElement('span'); expand.className = 'g-expand'; expand.textContent = '↗'; expand.setAttribute('aria-hidden','true');
      button.append(photoFrame,number,title,expand); grid.append(button);
    });
    filters.replaceChildren();
    for (const [value,label] of Object.entries(labels)) {
      const count = value === 'todos' ? photos.length : photos.filter(p => p.category === value).length;
      if (!count && value !== 'todos') continue;
      const button = document.createElement('button'); button.dataset.filter = value; button.append(document.createTextNode(label+' '));
      const sup = document.createElement('sup'); sup.textContent = String(count).padStart(2,'0'); button.append(sup); filters.append(button);
    }
    if (!filters.querySelector(`[data-filter="${category}"]`)) category = 'todos';
    tiles = [...grid.querySelectorAll('.gallery-tile')]; applyFilter();
    if (!photos.length) galleryStatus('Ainda não há fotos publicadas.');
  });
  const featureDefaults=[...document.querySelectorAll('.iconic-cards figure')].map(figure=>({figure,img:figure.querySelector('img'),src:figure.querySelector('img').getAttribute('src'),alt:figure.querySelector('img').alt,caption:figure.querySelector('figcaption').textContent}));
  function applySiteSettings(data){
    const settings=data?.settings;if(!settings)return;
    featureDefaults.forEach((entry,index)=>{
      const id=index===0?settings.feature_one_id:settings.feature_two_id;
      const photo=data.photos?.find(p=>p.id===id);
      entry.img.src=photo?.src||entry.src;entry.img.alt=photo?.alt||entry.alt;
      entry.figure.querySelector('figcaption').textContent=photo?.title||entry.caption;
    });
  }
  window.addEventListener('bene:site-data',e=>applySiteSettings(e.detail));
  if(window.BeneSiteData)applySiteSettings(window.BeneSiteData);
})();
