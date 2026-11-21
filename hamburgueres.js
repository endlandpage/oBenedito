(() => {
const cheddar = {
  id: 'bene-cheddar',
  name: 'Bene Cheddar',
  description: 'pão brioche, cebola caramelizada, queijo cheddar e hambúrguer de 160 g de blend de costela',
  sprite: { width: 887, height: 1774, src: 'assets/bene-cheddar-camadas.webp' },
  ingredients: [
    { start: 20, end: 372, assembled: -.27, turn: -5 },
    { start: 382, end: 651, assembled: -.09, turn: 4 },
    { start: 656, end: 933, assembled: .02, turn: -4 },
    { start: 933, end: 1227, assembled: .105, turn: 3 },
    { start: 1442, end: 1760, assembled: .24, turn: -3 },
  ],
};
const benedito = {
  id: 'hamburguer-o-benedito',
  name: 'O Benedito',
  description: 'pão brioche, bacon, banana-da-terra, queijo coalho e hambúrguer de 140 g',
  sprite: { width: 1024, height: 1536, src: 'assets/o-benedito-camadas.webp' },
  ingredients: [
    { start: 7, end: 397, assembled: -.255, turn: -5 },
    { start: 414, end: 612, assembled: -.061, turn: 4 },
    { start: 627, end: 917, assembled: .034, turn: -4 },
    { start: 920, end: 1112, assembled: .132, turn: 3 },
    { start: 1115, end: 1348, assembled: .229, turn: -3 },
    { start: 1351, end: 1536, assembled: .338, turn: 3 },
  ],
};
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const mix = (a, b, t) => a + (b - a) * t;

function burgerGeometry(stageWidth, stageHeight, ingredients, sprite) {
  const small = stageWidth < 470;
  const ratios = ingredients.map(i => (i.end - i.start) / sprite.width);
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  const gap = small ? 9 : 14;
  const padding = small ? 34 : 56;
  const closedWidth = Math.min(stageWidth * .94, 590, (stageHeight - 40) / .94);
  const gapTotal = gap * (ingredients.length - 1);
  const openWidth = Math.min(stageWidth * .64, 350, (stageHeight - padding - gapTotal) / (ratioSum * .8));
  const total = ratioSum * openWidth * .8 + gapTotal;
  let cursor = -total / 2;
  const layers = ingredients.map((item, index) => {
    const height = ratios[index] * openWidth * .8;
    const openY = cursor + height / 2;
    cursor += height + gap;
    return {
      x: (index % 2 ? -1 : 1) * (small ? 18 : 12),
      assembledY: item.assembled * closedWidth,
      openY,
      z: (3 - index) * 3,
      turn: item.turn,
    };
  });
  return { closedWidth, openScale: openWidth / closedWidth, layers };
}


function mountBurger({ id, name, description, ingredients, sprite }) {
  const hero = document.getElementById(id);
  const stage = hero.querySelector('.burger-stage');
  const stack = stage.querySelector('.burger-stack');
  const toggle = hero.querySelector('.bene-toggle');
  const layers = [...hero.querySelectorAll('.burger-layer')];
  const pictures = layers.map(layer => layer.querySelector('img'));
  const labels = [...hero.querySelectorAll('.ingredient-label')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const status = hero.querySelector('.bene-sr-status');
  const toggleText = hero.querySelector('.bene-toggle-text');
  if (layers.length !== ingredients.length || labels.length !== ingredients.length) return;

  let geometry, target = 0, current = 0;
  let frameRequest = 0, visible = true, initialized = false, loading = false;
  let tiltX = 0, tiltY = 0, nextTiltX = 0, nextTiltY = 0;

  layers.forEach((layer, i) => {
    const item = ingredients[i];
    const crop = layer.querySelector('.ingredient-crop');
    crop.style.aspectRatio = `${sprite.width} / ${item.end - item.start}`;
    pictures[i].style.transform = `translateY(${-100 * item.start / sprite.height}%)`;
    layer.style.zIndex = String(ingredients.length - i);
  });

  function render() {
    frameRequest = 0;
    if (hero.hidden || !visible || !initialized || !geometry) return;
    const amount = reducedMotion.matches ? 1 : .13;
    current += (target - current) * amount;
    tiltX += (nextTiltX - tiltX) * amount;
    tiltY += (nextTiltY - tiltY) * amount;
    if (Math.abs(target - current) < .0005) current = target;
    hero.style.setProperty('--open', current.toFixed(4));
    stack.style.transform = `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
    const scale = mix(1, geometry.openScale, current);
    const scaleY = scale * mix(1, .8, current);
    const labelOpacity = clamp((current - .48) / .4);
    geometry.layers.forEach((layer, i) => {
      const y = mix(layer.assembledY, layer.openY, current);
      layers[i].style.transform = `translate(-50%,-50%) translate3d(${layer.x * current}px,${y}px,${layer.z * current}px) rotate(${layer.turn * current}deg) scale(${scale},${scaleY})`;
      labels[i].style.transform = `translateY(-50%) translateY(${y}px)`;
      labels[i].style.opacity = String(labelOpacity);
    });
    hero.classList.add('is-ready');
    if (Math.abs(target - current) > .0005 || Math.abs(nextTiltX - tiltX) > .015 || Math.abs(nextTiltY - tiltY) > .015) requestRender();
  }

  function requestRender() {
    if (!frameRequest && initialized && visible && !hero.hidden) frameRequest = requestAnimationFrame(render);
  }

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    geometry = burgerGeometry(width, height, ingredients, sprite);
    layers.forEach(layer => { layer.style.width = `${geometry.closedWidth}px`; });
    requestRender();
  }

  function setTarget(progress) {
    target = progress;
    const expanded = target >= .5;
    if (toggle.getAttribute('aria-expanded') !== String(expanded)) {
      toggle.setAttribute('aria-expanded', String(expanded));
      toggleText.textContent = expanded ? 'Montar o hambúrguer' : 'Ver por dentro';
    }
    requestRender();
  }

  hero.addEventListener('dishscroll', event => {
    if (!reducedMotion.matches) setTarget(event.detail);
  });

  toggle.addEventListener('click', () => {
    setTarget(target >= .5 ? 0 : 1);
    status.textContent = target ? `Ingredientes separados: ${description}.` : `Hambúrguer ${name} montado.`;
  });

  stage.addEventListener('pointermove', event => {
    if (reducedMotion.matches || coarsePointer.matches) return;
    const bounds = stage.getBoundingClientRect();
    nextTiltY = ((event.clientX - bounds.left) / bounds.width - .5) * 7;
    nextTiltX = -((event.clientY - bounds.top) / bounds.height - .5) * 5;
    requestRender();
  });
  stage.addEventListener('pointerleave', () => { nextTiltX = nextTiltY = 0; requestRender(); });

  function init() {
    if (initialized) return;
    initialized = true;
    current = target;
    resize();
    addEventListener('resize', resize, { passive: true });
    reducedMotion.addEventListener('change', () => { nextTiltX = nextTiltY = 0; resize(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) resize();
      }, { rootMargin: '150px' }).observe(hero);
    }
  }

  function loadPictures(priority = 'auto') {
    if (loading) return;
    loading = true;
    pictures[0].fetchPriority = priority;
    pictures[0].src = sprite.src;
    pictures[0].decode().then(() => {
      pictures.slice(1).forEach(img => { img.src = sprite.src; });
      init();
    }).catch(() => { loading = false; });
  }

  hero.addEventListener('dishchange', () => {
    nextTiltX = nextTiltY = 0;
    if (hero.hidden) return;
    if (initialized) resize();
    else loadPictures();
  });
  if (!hero.hidden) loadPictures();
  else if (!navigator.connection?.saveData) window.addEventListener('load', () => loadPictures('low'), { once: true });
}

mountBurger({"id":"smash-duplo","name":"Bene Rodeio","description":"dois smash de 80 g de blend de costela, cebola empanada, bacon, queijo, barbecue e pão; maionese da casa à parte","sprite":{"width":1024,"height":1536,"src":"assets/smash-duplo-camadas.webp"},"ingredients":[{"start":0,"end":210,"assembled":-0.44,"turn":-3},{"start":210,"end":554,"assembled":-0.25,"turn":3},{"start":554,"end":765,"assembled":-0.08,"turn":-3},{"start":765,"end":975,"assembled":0.025,"turn":3},{"start":975,"end":1125,"assembled":0.13,"turn":-3},{"start":1125,"end":1290,"assembled":0.23,"turn":3},{"start":1290,"end":1536,"assembled":0.35,"turn":-3}]});
mountBurger(cheddar);
mountBurger(benedito);
})();
