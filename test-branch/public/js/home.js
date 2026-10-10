// Home page: filter chips, card tilt, entrance animation, splash screen.
(()=>{
const $$=(s,r=document)=>[...r.querySelectorAll(s)],$1=s=>document.querySelector(s);

/* status line: says how many files were made on the tool pages this visit */
try{const made=+sessionStorage.getItem('sa-made')||0;if(made)$1('#cur').textContent='DONE, '+made+' FILE'+(made>1?'S':'')+' MADE'}catch(e){}

/* filter chips */
$$('#chips button').forEach(b=>b.onclick=()=>{
  $$('#chips button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  $$('.card').forEach(c=>c.hidden=b.dataset.f!=='all'&&c.dataset.c!==b.dataset.f);
});

/* 3D tilt on cards + glare */
$$('.card').forEach(c=>{
  c.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    c.style.transition='transform .08s linear';
    c.style.transform='perspective(900px) rotateX('+((.5-y)*10)+'deg) rotateY('+((x-.5)*12)+'deg) translateZ(10px)';
    c.style.setProperty('--mx',x*100+'%');c.style.setProperty('--my',y*100+'%');
  });
  c.addEventListener('pointerleave',()=>{c.style.transition='transform .7s cubic-bezier(.16,1,.3,1)';c.style.transform=''});
});

/* splash */
(()=>{const t0=Date.now(),go=()=>setTimeout(()=>$1('#boot').classList.add('hide'),Math.max(0,1000-(Date.now()-t0)));document.readyState==='complete'?go():addEventListener('load',go)})();

/* motion: anime.js for entrances, Motion for scroll-linked + reveal */
const A=window.anime,M=window.Motion;
if(matchMedia('(prefers-reduced-motion:reduce)').matches||!A||!M||!M.animate||!M.inView)return;
const root=document.documentElement;
try{
  $$('.sh,.card,.term').forEach(e=>e.classList.add('rv'));
  const h=$1('#hero h1'),txt=h.textContent;h.setAttribute('aria-label',txt);h.textContent='';
  [...txt].forEach(c=>{const s=document.createElement('span');s.className='ch';s.setAttribute('aria-hidden','true');s.textContent=c;h.append(s)});
  root.classList.add('js');
  A.animate('.ch',{opacity:[0,1],y:[90,0],rotateX:[-80,0],delay:A.stagger(34,{start:950}),duration:1200,ease:'outExpo'});
  A.animate('.hero-in',{opacity:[0,1],y:[20,0],delay:A.stagger(110,{start:1500}),duration:900,ease:'outExpo'});
  M.animate('#dock',{opacity:[0,1],y:[60,0]},{delay:1.6,duration:.9,ease:[.16,1,.3,1]});
  M.inView('.rv',el=>{M.animate(el,{opacity:[0,1],y:[44,0]},{duration:.9,ease:[.16,1,.3,1]})},{margin:'0px 0px -8% 0px'});
  M.scroll(M.animate('.hc',{y:[0,-100],opacity:[1,0]}),{target:$1('#hero'),offset:['start start','end start']});
  $$('#chips button').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{
    const v=$$('#home .card').filter(c=>c.offsetParent);
    if(v.length)A.animate(v,{opacity:[0,1],y:[30,0],delay:A.stagger(70),duration:700,ease:'outExpo'});
  },0)));
}catch(e){root.classList.remove('js')}
})();
