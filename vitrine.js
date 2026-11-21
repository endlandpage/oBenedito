(() => {
  const picker = document.querySelector('.dish-picker');
  const showcase = picker.closest('.dish-showcase');
  const inner = showcase.querySelector('.dish-inner');
  const announcement = document.getElementById('dish-announcement');
  const dishes = [
    { id: 'bene-cheddar', name: 'Bene Cheddar', thumb: 'assets/vitrine-cheddar.webp' },
    { id: 'hamburguer-o-benedito', name: 'O Benedito', thumb: 'assets/vitrine-benedito.webp' },
    { id: 'smash-duplo', name: 'Bene Rodeio', thumb: 'assets/vitrine-smash-duplo.svg' },
    { id: 'menu', name: 'Trio Bene', thumb: 'assets/vitrine-trio.webp' },
  ].map(dish => ({ ...dish, panel: document.getElementById(dish.id) }));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = dishes[0];
  const alternatives = dishes.slice(1);
  let entrance;
  let travel = 0;
  let stickyTop = 0;
  let progress;
  let scrollFrame = 0;

  function updateScroll({ force = false, notify = true } = {}) {
    if (!travel || reducedMotion.matches) return;
    const offset = stickyTop - showcase.getBoundingClientRect().top;
    const next = Math.min(1, Math.max(0, offset / travel));
    if (!force && next === progress) return;
    progress = next;
    if (notify) active.panel.dispatchEvent(new CustomEvent('dishscroll', { detail: progress }));
  }

  function onScroll() {
    if (!travel || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateScroll(); });
  }

  function measureScroll() {
    if (reducedMotion.matches) {
      travel = 0;
      return;
    }
    inner.style.setProperty('--dish-inner-height', `${inner.offsetHeight}px`);
    stickyTop = Number.parseFloat(getComputedStyle(inner).top) || 0;
    travel = showcase.offsetHeight - inner.offsetHeight;
    updateScroll();
  }

  function select(dish, announce = true) {
    if (dish === active) return;
    entrance?.cancel();
    active.panel.hidden = true;
    active.panel.dispatchEvent(new Event('dishchange'));

    const slot = alternatives.indexOf(dish);
    alternatives[slot] = active;
    updateTile(picker.children[slot], active);

    active = dish;
    dish.panel.hidden = false;
    dish.panel.dispatchEvent(new Event('dishchange'));
    updateScroll({ force: true });
    if (!announce) return;
    announcement.textContent = `${dish.name} em destaque.`;
    if (!reducedMotion.matches) {
      entrance = dish.panel.animate([
        { opacity: .55, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 220, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    }
  }

  function updateTile(button, dish) {
    button.querySelector('img').src = dish.thumb;
    button.querySelector('span').textContent = dish.name;
  }

  alternatives.forEach((dish, slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    const picture = new Image(64, 64);
    picture.alt = '';
    button.append(picture, document.createElement('span'));
    updateTile(button, dish);
    button.addEventListener('click', () => {
      select(alternatives[slot]);
      if (dishes.some(item => location.hash === `#${item.id}`)) {
        history.replaceState(history.state, '', `#${active.id}`);
      }
    });
    picker.append(button);
  });
  picker.hidden = false;

  showcase.classList.add('has-scroll-reveal');
  showcase.addEventListener('click', event => {
    if (event.target.closest('.bene-toggle, .tb-expand, .tb-play, .tb-reset')) {
      // Focus can scroll a control into view just before its click. Keep that scroll from overriding the click.
      updateScroll({ notify: false });
    }
  }, { capture: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measureScroll, { passive: true });
  reducedMotion.addEventListener('change', measureScroll);
  if ('ResizeObserver' in window) new ResizeObserver(measureScroll).observe(inner);
  measureScroll();

  function showLinkedDish() {
    const dish = dishes.find(item => location.hash === `#${item.id}`);
    if (!dish) return;
    select(dish, false);
    showcase.scrollIntoView({ behavior: 'instant' });
  }

  window.addEventListener('hashchange', showLinkedDish);
  showLinkedDish();
})();
