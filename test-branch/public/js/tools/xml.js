// XML checker

function parse(){
  const t=v('xin').trim();
  if(!t){ $('#xmsg').textContent='Paste some XML first.'; return null; }
  const d=new DOMParser().parseFromString(t,'application/xml');
  const e=d.querySelector('parsererror');
  if(e){ $('#xmsg').textContent='Not valid XML: '+e.textContent.split('\n')[0]; return null; }
  return d;
}
$('#xchk').onclick=()=>{
  const d=parse(); if(!d) return;
  const r=d.documentElement;
  if(r.tagName!=='scene'){$('#xmsg').textContent=`Valid XML, but the root is <${r.tagName}>. Alight Motion expects <scene>.`;return}
  const sh=[...d.querySelectorAll('shape')];
  const bad=sh.filter(s=>!s.getAttribute('id')).length;
  const ids=sh.map(s=>s.getAttribute('id')), dup=ids.length-new Set(ids).size;
  $('#xmsg').textContent=`Valid scene: ${r.getAttribute('width')}×${r.getAttribute('height')}, ${r.getAttribute('fps')} fps, ${sh.length} shape(s)`+(bad?`. ${bad} shape(s) missing an id.`:'')+(dup?` ${dup} duplicate id(s).`:'')+'.';
};
$('#xmin').onclick=()=>{ if(!parse()) return; $('#xin').value=v('xin').replace(/>\s+</g,'><').trim(); $('#xmsg').textContent='Minified.'; };
$('#xpre').onclick=()=>{
  if(!parse()) return;
  const parts=v('xin').replace(/>\s+</g,'><').replace(/></g,'>\n<').split('\n');
  let lvl=0;
  $('#xin').value=parts.map(l=>{
    if(/^<\//.test(l)) lvl--;
    const out='  '.repeat(Math.max(lvl,0))+l;
    if(/^<[^!?\/][^>]*[^\/]>$/.test(l)) lvl++;
    return out;
  }).join('\n');
  $('#xmsg').textContent='Prettified.';
};
