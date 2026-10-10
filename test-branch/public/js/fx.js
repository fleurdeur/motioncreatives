// Background: Qingxiao wallpaper art on every page; flying swords + wind streaks on the home page only
// (tool pages keep the page light so the tracer has the full CPU).
(()=>{
const body=document.body,calm=body.classList.contains('tool');
const sprite='<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gb" x1="0" x2="1"><stop offset="0" stop-color="#bff6ff"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#5fd3e8"/></linearGradient><symbol id="jian" viewBox="0 0 24 170"><path d="M12 0L17 18 16 104H8L7 18Z" fill="url(#gb)" stroke="#2bb8cf" stroke-width=".6"/><path d="M12 6V100" stroke="#35c5d9" stroke-width=".8" opacity=".7"/><rect x="3" y="104" width="18" height="4" rx="2" fill="#7fe0ff"/><rect x="10" y="108" width="4" height="26" rx="1.5" fill="#1b3b45"/><circle cx="12" cy="138" r="3.2" fill="#7fe0ff"/><path d="M12 141C9 152 15 156 11 168" stroke="#6ef0c8" stroke-width="1.2" fill="none"/></symbol></defs></svg>';
body.insertAdjacentHTML('afterbegin',(calm?'':sprite)+'<div id="art" aria-hidden="true"><img src="/qingxiao.webp" alt=""></div>'+(calm?'':'<canvas id="wind" aria-hidden="true"></canvas><div id="fx" aria-hidden="true"></div>'));
const artImg=document.querySelector('#art img');if(artImg)artImg.onerror=()=>artImg.parentNode.remove();
})();
(()=>{
const fx=document.getElementById('fx'),cv=document.getElementById('wind'),art=document.getElementById('art');
if(!fx||!cv)return;
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches,small=innerWidth<700;
const cx=cv.getContext('2d');let W,H;
const size=()=>{const d=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0)};
size();addEventListener('resize',size);
const R=(a,b)=>a+Math.random()*(b-a),mod=(v,m)=>((v%m)+m)%m;
/* flying swords */
const defs=[[.12,.2,.9,28],[.86,.16,.7,-20],[.7,.55,1.25,18],[.2,.7,.8,-32],[.5,.12,.55,8],[.92,.78,.6,-12],[.38,.9,1,24]].slice(0,small?4:7);
const S=defs.map(([x,y,d,a])=>{const e=document.createElement('div'),h=90+d*80;e.className='fs';e.style.width=h*.141+'px';e.style.height=h+'px';e.style.opacity=.35+.5*Math.min(d,1);e.innerHTML='<svg viewBox="0 0 24 170"><use href="#jian"/></svg>';fx.append(e);return{e,x,y,d,a,h,ph:R(0,6.28),cx:null,cy:0,ca:a}});
/* wind streaks */
const N=small?34:72,TR=18;
const spawn=init=>({x:init?R(0,W):-40,y:R(0,H),z:R(.4,1.4),s:0,tr:[],ph:R(0,6.28),jade:Math.random()<.25,s0:R(1.2,3.2)});
const P=Array.from({length:N},()=>spawn(true));
const m={x:innerWidth/2,y:innerHeight/2,on:false};
let sy=scrollY,vel=0,gust=0,gx=0,gy=0,t=0,idle=false;
const fb=document.querySelector('[data-go=fx]');if(fb)fb.setAttribute('aria-pressed',document.documentElement.dataset.fx!=='off');
addEventListener('pointermove',e=>{m.x=e.clientX;m.y=e.clientY;m.on=true},{passive:true});
document.addEventListener('pointerleave',()=>{m.on=false});
addEventListener('pointerdown',e=>{gust=1;gx=e.clientX;gy=e.clientY},{passive:true});
function frame(ts){
  /* pause (and clear the wind) while effects are off or a tool is open */
  if(document.documentElement.dataset.fx==='off'||document.body.classList.contains('tool')){
    if(!idle){cx.clearRect(0,0,W,H);idle=true}
    if(!rm)setTimeout(()=>requestAnimationFrame(frame),300);
    return;
  }
  idle=false;
  t=ts/1000;const ny=scrollY;vel+=((ny-sy)-vel)*.18;sy=ny;gust*=.94;
  for(const s of S){
    const w=s.h*.141,py=mod(s.y*H-sy*.28*s.d,H+240)-120,px=s.x*W+Math.sin(t*.6+s.ph)*18*s.d+(m.x-W/2)*.03*s.d;
    let ang=s.a+Math.sin(t*.5+s.ph)*6-vel*.35*s.d,tx=px,ty=py+Math.sin(t*.9+s.ph)*10*s.d;
    const dx=m.x-px,dy=m.y-py,dist=Math.hypot(dx,dy);
    if(m.on&&dist<420){const aim=Math.atan2(dy,dx)*180/Math.PI+90,k=(1-dist/420)*.65;ang+=(((aim-ang+540)%360)-180)*k}
    if(gust>.02){const ox=px-gx,oy=py-gy,od=Math.hypot(ox,oy)+1,f=gust*260/(1+od/200);tx+=ox/od*f;ty+=oy/od*f;ang+=gust*40*s.d}
    if(s.cx===null){s.cx=tx;s.cy=ty;s.ca=ang}
    s.cx+=(tx-s.cx)*.12;s.cy+=(ty-s.cy)*.12;s.ca+=(ang-s.ca)*.12;
    s.e.style.transform='translate3d('+(s.cx-w/2)+'px,'+(s.cy-s.h/2)+'px,0) rotate('+s.ca+'deg) rotateY('+Math.sin(t*.7+s.ph)*35+'deg)';
  }
  cx.clearRect(0,0,W,H);cx.lineCap='round';
  const light=document.documentElement.dataset.theme==='light';
  for(const p of P){
    let vx=p.s0*p.z*(1+gust*3)+Math.min(Math.abs(vel),60)*.06*p.z,vy=Math.sin(p.x*.006+t*.8+p.ph)*.9*p.z-vel*.55*p.z;
    let dx=p.x-m.x,dy=p.y-m.y,d=Math.hypot(dx,dy)+.01;
    if(m.on&&d<200){const f=(1-d/200)*3.5;vx+=dx/d*f-dy/d*f*1.2;vy+=dy/d*f+dx/d*f*1.2}
    if(gust>.02){dx=p.x-gx;dy=p.y-gy;d=Math.hypot(dx,dy)+1;const f=gust*14/(1+d/120);vx+=dx/d*f;vy+=dy/d*f}
    p.x+=vx;p.y+=vy;p.tr.push(p.x,p.y);if(p.tr.length>TR*2)p.tr.splice(0,2);
    if(p.x>W+80||p.y<-80||p.y>H+80){Object.assign(p,spawn(false))}
    if(p.tr.length<4)continue;
    cx.beginPath();cx.moveTo(p.tr[0],p.tr[1]);for(let i=2;i<p.tr.length;i+=2)cx.lineTo(p.tr[i],p.tr[i+1]);
    cx.strokeStyle='rgba('+(light?'14,116,144':p.jade?'110,240,200':'127,224,255')+','+(.1+.22*p.z+gust*.25)+')';
    cx.lineWidth=.8+p.z*.9;cx.stroke();
  }
  if(art)art.style.setProperty('--fa',Math.max(.15,1-sy/H*.85));if(art)art.style.transform='translate3d('+(-(m.x/W-.5)*24)+'px,'+(-sy*.04)+'px,0)';
  if(!rm)requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
