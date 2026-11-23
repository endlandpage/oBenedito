(() => {
  'use strict';
  const panel = document.getElementById('verrine-o-benedito');
  if (!panel) return;
  const stage = panel.querySelector('.verrine-stage');
  const assembled = panel.querySelector('.verrine-assembled');
  const pieces = [...panel.querySelectorAll('.verrine-piece')];
  const labels = [...panel.querySelectorAll('.verrine-label')];
  const button = panel.querySelector('.bene-toggle');
  const status = panel.querySelector('[role="status"]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let target = 0, current = 0, frame = 0, ready = false, pending;
  function draw() {
    frame = 0;
    if (panel.hidden || !ready) return;
    current = motion.matches ? target : current + (target-current)*.13;
    if (Math.abs(current-target)<.001) current=target;
    const h=stage.clientHeight;
    assembled.style.opacity=String(Math.max(0,1-current*3));
    assembled.style.transform=`translate(-50%,-50%) scale(${1-current*.06})`;
    const positions=[.21,-.04,-.34];
    pieces.forEach((piece,i)=>{
      piece.style.opacity=String(Math.min(1,current*2));
      piece.style.transform=`translate(-50%,-50%) translate3d(${(i===1?-.035:i===2?.025:0)*h*current}px,${h*(positions[i]*current+.01*(1-current))}px,0) scale(${.85+.15*current})`;
      labels[i].style.opacity=String(Math.max(0,(current-.55)/.45));
      labels[i].style.transform=`translateY(-50%) translateY(${positions[i]*h}px)`;
    });
    if (current!==target) schedule();
  }
  function schedule(){if(!frame&&!panel.hidden)frame=requestAnimationFrame(draw)}
  function setOpen(value){
    target=Math.max(0,Math.min(1,value));
    const open=target>.5;
    button.setAttribute('aria-pressed',String(open));
    button.querySelector('.bene-toggle-text').textContent=open?'Montar a taça':'Ver ingredientes';
    stage.setAttribute('aria-label',open?'Verrine em camadas: sorvete de creme, banana flambada com especiarias e taça de vidro.':'Verrine O Benedito montado em taça de vidro.');
    schedule();
  }
  function load(){
    if(pending)return pending;
    pending=Promise.all([...stage.querySelectorAll('img')].map(im=>{
      if(im.dataset.src){im.src=im.dataset.src;delete im.dataset.src}
      return im.decode();
    })).then(()=>{ready=true;button.disabled=false;stage.classList.add('verrine-ready');schedule()}).catch(()=>{
      status.textContent='Não foi possível carregar a animação. A sobremesa continua disponível no cardápio.';
      pending=null;
    });return pending;
  }
  button.disabled=true;
  button.addEventListener('click',()=>{setOpen(target>.5?0:1);status.textContent=target>.5?'Sorvete de creme e banana flambada com especiarias.':'Taça montada.'});
  panel.addEventListener('dishscroll',e=>setOpen(e.detail));
  panel.addEventListener('dishchange',()=>{if(panel.hidden){cancelAnimationFrame(frame);frame=0}else{load();schedule()}});
  new ResizeObserver(schedule).observe(stage);
  motion.addEventListener('change',()=>{current=target;schedule()});
  if(!panel.hidden)load();
})();
