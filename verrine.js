(() => {
 'use strict';
 const panel=document.getElementById('verrine-o-benedito');if(!panel)return;
 const stage=panel.querySelector('.verrine-stage'),poster=stage.querySelector('img');
 const play=panel.querySelector('.verrine-play'),reset=panel.querySelector('.verrine-reset');
 const text=play.querySelector('span'),status=panel.querySelector('[role="status"]');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let viewer,pending,loaded=false,visible=true,playing=!reduced.matches;
 play.disabled=reset.disabled=true;
 function sync(){
  if(viewer)viewer.autoRotate=loaded&&playing&&visible&&!panel.hidden&&!document.hidden;
  play.setAttribute('aria-pressed',String(playing));text.textContent=playing?'Pausar giro':'Girar taça';
 }
 async function load(){
  if(pending)return pending;
  if(poster.dataset.src){poster.src=poster.dataset.src;delete poster.dataset.src}
  status.textContent='Carregando taça 3D…';stage.setAttribute('aria-busy','true');
  pending=(async()=>{
   await import('./model-viewer.min.js');await customElements.whenDefined('model-viewer');
   viewer=document.createElement('model-viewer');
   viewer.setAttribute('alt','Modelo 3D do Verrine O Benedito. Arraste para girar ou use as setas do teclado.');
   viewer.setAttribute('camera-controls','');viewer.setAttribute('disable-pan','');
   viewer.setAttribute('touch-action','pan-y');viewer.setAttribute('interaction-prompt','none');
   viewer.setAttribute('camera-orbit','0deg 78deg 105%');viewer.setAttribute('field-of-view','22deg');
   viewer.setAttribute('min-camera-orbit','auto 15deg 80%');viewer.setAttribute('max-camera-orbit','auto 160deg 180%');
   viewer.setAttribute('environment-image','assets/verrine-estudio.hdr');viewer.setAttribute('shadow-intensity','.085');viewer.setAttribute('exposure','1');
   viewer.setAttribute('rotation-per-second','18deg');viewer.setAttribute('auto-rotate-delay','1000');
   const ready=new Promise((resolve,reject)=>{viewer.addEventListener('load',resolve,{once:true});viewer.addEventListener('error',()=>reject(Error('Não foi possível abrir o modelo 3D')),{once:true})});
   viewer.src='assets/verrine-360.glb';stage.prepend(viewer);await ready;
   loaded=true;stage.classList.add('verrine-ready');poster.hidden=true;stage.removeAttribute('aria-busy');
   play.disabled=reset.disabled=false;status.textContent='Taça 3D pronta. Arraste para girar.';sync();
  })().catch(error=>{console.error(error);viewer?.remove();viewer=null;poster.hidden=false;stage.removeAttribute('aria-busy');status.textContent='A visualização 3D não carregou. A foto da sobremesa continua disponível.';pending=null});
  return pending;
 }
 play.addEventListener('click',()=>{playing=!playing;sync()});
 reset.addEventListener('click',()=>{viewer.cameraOrbit='0deg 78deg 105%';viewer.jumpCameraToGoal();playing=false;sync()});
 panel.addEventListener('dishchange',()=>{if(!panel.hidden)load();sync()});
 document.addEventListener('visibilitychange',sync);
 reduced.addEventListener('change',()=>{if(reduced.matches)playing=false;sync()});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()}).observe(stage);
 if(!panel.hidden)load();
})();
