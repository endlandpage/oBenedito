(() => {
const cheddar = {
  id: 'bene-cheddar',
  name: 'Bene Cheddar',
  description: 'pão brioche, cebola caramelizada, queijo cheddar e hambúrguer de 160 g de blend de costela',
  sprite: { width: 887, height: 1774 },
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

function burgerFrame(progress, stageWidth, stageHeight, ingredients, sprite) {
  const p = clamp(progress);
  const small = stageWidth < 470;
  const ratios = ingredients.map(i => (i.end - i.start) / sprite.width);
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  const gap = small ? 9 : 14;
  const padding = small ? 34 : 56;
  const closedWidth = Math.min(stageWidth * .94, 590, (stageHeight - 40) / .94);
  const gapTotal = gap * (ingredients.length - 1);
  const openWidth = Math.min(stageWidth * .64, 350, (stageHeight - padding - gapTotal) / (ratioSum * .8));
  const width = mix(closedWidth, openWidth, p);
  const scaleY = mix(1, .8, p);
  const total = ratioSum * openWidth * .8 + gapTotal;
  let cursor = -total / 2;
  const layers = ingredients.map((item, index) => {
    const height = ratios[index] * openWidth * .8;
    const openY = cursor + height / 2;
    cursor += height + gap;
    return {
      width,
      x: (index % 2 ? -1 : 1) * (small ? 18 : 12) * p,
      y: mix(item.assembled * closedWidth, openY, p),
      z: (3 - index) * 3 * p,
      turn: item.turn * p,
      scaleY,
      labelOpacity: clamp((p - .48) / .4),
    };
  });
  return layers;
}


function mountBurger({ id, name, description, ingredients, sprite }) {
  const hero = document.getElementById(id);
  const stage = hero.querySelector('.burger-stage');
  const toggle = hero.querySelector('.bene-toggle');
  const layers = [...hero.querySelectorAll('.burger-layer')];
  const labels = [...hero.querySelectorAll('.ingredient-label')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const status = hero.querySelector('.bene-sr-status');
  const toggleText = hero.querySelector('.bene-toggle-text');
  if (layers.length !== ingredients.length || labels.length !== ingredients.length) return;

  let width = 0, height = 0, target = 0, current = 0;
  let frameRequest = 0, visible = true, initialized = false, loading = false;
  let tiltX = 0, tiltY = 0, nextTiltX = 0, nextTiltY = 0;

  layers.forEach((layer, i) => {
    const item = ingredients[i];
    const crop = layer.querySelector('.ingredient-crop');
    crop.style.aspectRatio = `${sprite.width} / ${item.end - item.start}`;
    crop.querySelector('img').style.transform = `translateY(${-100 * item.start / sprite.height}%)`;
    layer.style.zIndex = String(ingredients.length - i);
  });

  function render() {
    frameRequest = 0;
    if (hero.hidden || !visible || !initialized || !width || !height) return;
    const amount = reducedMotion.matches ? 1 : .13;
    current += (target - current) * amount;
    tiltX += (nextTiltX - tiltX) * amount;
    tiltY += (nextTiltY - tiltY) * amount;
    if (Math.abs(target - current) < .0005) current = target;
    const frame = burgerFrame(current, width, height, ingredients, sprite);
    hero.style.setProperty('--open', current.toFixed(4));
    stage.style.setProperty('--tilt-x', `${tiltX.toFixed(3)}deg`);
    stage.style.setProperty('--tilt-y', `${tiltY.toFixed(3)}deg`);
    frame.forEach((layer, i) => {
      layers[i].style.width = `${layer.width.toFixed(2)}px`;
      layers[i].style.transform = `translate(-50%,-50%) translate3d(${layer.x.toFixed(2)}px,${layer.y.toFixed(2)}px,${layer.z.toFixed(2)}px) rotate(${layer.turn.toFixed(2)}deg) scaleY(${layer.scaleY.toFixed(4)})`;
      labels[i].style.top = `${height / 2 + layer.y}px`;
      labels[i].style.opacity = String(layer.labelOpacity);
    });
    if (Math.abs(target - current) > .0005 || Math.abs(nextTiltX - tiltX) > .015 || Math.abs(nextTiltY - tiltY) > .015) requestRender();
  }

  function requestRender() {
    if (!frameRequest && initialized && visible && !hero.hidden) frameRequest = requestAnimationFrame(render);
  }

  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    requestRender();
  }

  toggle.addEventListener('click', () => {
    target = 1 - target;
    toggle.setAttribute('aria-expanded', String(Boolean(target)));
    toggleText.textContent = target ? 'Montar o hambúrguer' : 'Ver por dentro';
    status.textContent = target ? `Ingredientes separados: ${description}.` : `Hambúrguer ${name} montado.`;
    requestRender();
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
    hero.classList.add('is-ready');
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

  function loadPictures() {
    if (loading) return;
    loading = true;
    const pictures = layers.map(layer => layer.querySelector('img'));
    if (sprite.src) pictures.forEach(img => { img.src = sprite.src; });
    Promise.all(pictures.map(img => img.decode())).then(init).catch(() => { loading = false; });
  }

  hero.addEventListener('dishchange', () => {
    nextTiltX = nextTiltY = 0;
    if (hero.hidden) return;
    if (initialized) resize();
    else loadPictures();
  });
  if (!hero.hidden) loadPictures();
}

mountBurger(cheddar);
mountBurger(benedito);
})();
