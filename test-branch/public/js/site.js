// Nav dock shared by every page. Set <body data-page="home|tool|finder|library"> to choose the highlighted item.
(()=>{
const body=document.body,page=body.dataset.page||'home',home=page==='home';
const ic=p=>'<svg viewBox="0 0 24 24">'+p+'</svg>';
const NAV=[
  ['home',home?'#hero':'/','Home',ic('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>')],
  ['tools',home?'#work':'/#work','Tools',ic('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')],
  ['finder','/tools/preset-finder.html','Finder',ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')],
  ['library','/directory.html','Library',ic('<path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.5-1 3 15-3.5 1z"/>')],
  ['info',home?'#info':'/#info','Info',ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>')]
];
const nav=document.createElement('nav');nav.id='dock';nav.setAttribute('aria-label','Main');
nav.innerHTML='<i class="ind"></i>'+NAV.map(([k,href,label,svg])=>'<a data-go="'+k+'" href="'+href+'">'+svg+'<span>'+label+'</span></a>').join('')+
  '<em class="sep"></em>'+
  '<button type="button" data-go="fx" aria-pressed="true" aria-label="Turn background effects on or off">'+ic('<path d="M3 8h11a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h8"/>')+'</button>'+
  '<button type="button" data-go="theme" aria-label="Switch between dark and light mode"><svg class="moon" viewBox="0 0 24 24"><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/></svg><svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>';
body.append(nav);

const ind=nav.querySelector('.ind'),links=[...nav.querySelectorAll('a')];
const root=document.documentElement;
nav.querySelector('[data-go=fx]').setAttribute('aria-pressed',root.dataset.fx!=='off');

function active(){
  if(page==='finder')return'finder';
  if(page==='library')return'library';
  if(page==='tool')return'tools';
  if(scrollY<innerHeight*.5)return'home';
  if(innerHeight+scrollY>=document.body.scrollHeight-90)return'info';
  return'tools';
}
function mark(){
  const k=active();
  links.forEach(a=>{const on=a.dataset.go===k;a.classList.toggle('on',on);if(on){ind.style.width=a.offsetWidth+'px';ind.style.transform='translateX('+a.offsetLeft+'px)'}});
}
if(home)addEventListener('scroll',mark,{passive:true});
addEventListener('resize',mark);
mark();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(mark);
addEventListener('load',mark);

nav.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.go==='fx'){const n=root.dataset.fx==='off'?'on':'off';root.dataset.fx=n;try{localStorage.setItem('sa-fx',n)}catch(x){}b.setAttribute('aria-pressed',n!=='off')}
  if(b.dataset.go==='theme'){const n=root.dataset.theme==='light'?'dark':'light';root.dataset.theme=n;try{localStorage.setItem('sa-theme',n)}catch(x){}const m=document.querySelector('meta[name=theme-color]');if(m)m.content=n==='light'?'#f6f4fa':'#000'}
});
})();
