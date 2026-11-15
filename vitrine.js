(() => {
  const picker = document.querySelector('.dish-picker');
  const announcement = document.getElementById('dish-announcement');
  const dishes = [
    { id: 'bene-cheddar', name: 'Bene Cheddar', thumb: 'assets/vitrine-cheddar.webp' },
    { id: 'hamburguer-o-benedito', name: 'O Benedito', thumb: 'assets/vitrine-benedito.webp' },
    { id: 'menu', name: 'Trio Bene', thumb: 'assets/vitrine-trio.webp' },
  ].map(dish => ({ ...dish, panel: document.getElementById(dish.id) }));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = dishes[0];
  const alternatives = dishes.slice(1);
  let entrance;

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

  function showLinkedDish() {
    const dish = dishes.find(item => location.hash === `#${item.id}`);
    if (!dish) return;
    select(dish, false);
    dish.panel.scrollIntoView({ behavior: 'instant' });
  }

  window.addEventListener('hashchange', showLinkedDish);
  showLinkedDish();
})();
