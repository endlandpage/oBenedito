(() => {
  'use strict';
  const config = window.BENE_BACKEND;
  if (!config?.allowedHosts?.includes(location.hostname)) return;
  const base = new URL(config.url);
  let session = null;
  const expired = () => {
    session = null;
    window.dispatchEvent(new Event('bene:session-ended'));
  };
  async function request(path, options = {}, authenticated = false) {
    if (authenticated && (!session || Date.now() >= session.expiresAt)) {
      expired();
      throw new Error('Sua sessão terminou. Entre novamente.');
    }
    const headers = new Headers(options.headers);
    headers.set('apikey', config.publicKey);
    if (authenticated) headers.set('Authorization', `Bearer ${session.token}`);
    let response;
    try {
      response = await fetch(new URL(path, base), {
        ...options, headers, credentials: 'omit',
        signal: AbortSignal.timeout(options.body instanceof FormData ? 60000 : 20000),
      });
    } catch {
      throw new Error('Não foi possível conectar. Confira a internet e tente novamente.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (authenticated && response.status === 401) expired();
      const message = response.status === 409
        ? 'A galeria mudou em outra sessão. Recarregue os dados antes de salvar.'
        : response.status === 401 ? 'Confira o e-mail e a senha, ou entre novamente.'
        : response.status === 403 ? 'Esta conta não tem acesso à administração.'
        : response.status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente novamente.'
        : typeof data.error === 'string' && data.error.length < 200 ? data.error
        : 'A operação não foi concluída. Tente novamente.';
      throw new Error(message);
    }
    return data;
  }
  function safePhoto(photo) {
    const src = new URL(photo.src, location.href);
    if (src.username || src.password ||
      !((src.origin === location.origin && /^\/assets\/[a-z0-9-]+\.webp$/.test(src.pathname)) ||
        (src.origin === base.origin && src.protocol === 'https:' && src.pathname.startsWith('/storage/v1/object/')))) {
      throw new Error('A galeria retornou um endereço de imagem inválido.');
    }
    return { ...photo, src: src.href };
  }
  function gallery(data) {
    if (!Array.isArray(data.photos) || !Number.isInteger(data.revision)) throw new Error('Resposta inválida da galeria.');
    return { photos: data.photos.map(safePhoto), revision: data.revision };
  }
  window.BeneAdminAPI = Object.freeze({
    async login(email, password) {
      session = null;
      const data = await request('/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      session = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
      try { return gallery(await request('/functions/v1/bene-admin', {}, true)); }
      catch (error) { await this.logout().catch(() => {}); throw error; }
    },
    async logout() {
      try { if (session) await request('/auth/v1/logout?scope=local', { method: 'POST' }, true); }
      finally { expired(); }
    },
    async load() { return gallery(await request('/functions/v1/bene-admin', {}, true)); },
    async save(revision, photos) {
      const fields = photos.map(({ id, title, caption, alt, category, visible, position, crop }) =>
        ({ id, title, caption, alt, category, visible, position, ...(crop!==undefined?{crop}:{} ) }));
      return gallery(await request('/functions/v1/bene-admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', revision, photos: fields }),
      }, true));
    },
    async upload(file) {
      let bitmap;
      try { bitmap = await createImageBitmap(file); }
      catch { throw new Error('Não foi possível abrir essa imagem. Use JPG, PNG ou WebP válido.'); }
      let blob;
      try {
        const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('O navegador não conseguiu preparar a imagem.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
      } finally { bitmap.close(); }
      if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('A imagem ficou muito grande. Escolha uma versão menor.');
      const form = new FormData(); form.append('file', blob, 'foto.webp');
      return gallery(await request('/functions/v1/bene-admin', { method: 'POST', body: form }, true));
    },
    async publicPhotos() {
      const data = await request('/rest/v1/bene_gallery_public?select=*&order=position.asc');
      if (!Array.isArray(data)) throw new Error('Resposta inválida da galeria.');
      return data.map(safePhoto);
    },
  });
  async function refreshPublic() {
    window.dispatchEvent(new Event('bene:gallery-loading'));
    try {
      const photos = await window.BeneAdminAPI.publicPhotos();
      window.dispatchEvent(new CustomEvent('bene:gallery-data', { detail: photos }));
    } catch { window.dispatchEvent(new Event('bene:gallery-unavailable')); }
  }
  window.addEventListener('bene:gallery-updated', refreshPublic);
  refreshPublic();
})();
