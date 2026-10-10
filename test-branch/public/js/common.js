// Shared helpers for every tool page.
const $=s=>document.querySelector(s), v=id=>$('#'+id).value, n=id=>parseFloat(v(id))||0;
const f6=x=>Number(x).toFixed(6);
const hx=x=>Math.round(x).toString(16).padStart(2,'0');
const toAM=(rgb,pct)=>{ 
  if(!rgb) return '#00000000';
  const raw = rgb.startsWith('#') ? rgb.slice(1) : rgb;
  if(raw.length===6) return '#'+hx((pct/100)*255)+raw;
  if(raw.length===8) return '#'+raw;
  return '#'+hx((pct/100)*255)+raw.padStart(6,'0');
};
const esc=s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const rid=()=>String(Math.floor(1e9+Math.random()*9e9));

function wrapScene(body){
  const w=n('cw'),h=n('ch'),fps=n('cf'),d=n('cd');
  return `<?xml version='1.0' encoding='UTF-8' ?>\n<scene title="Shin's Archive" width="${w}" height="${h}" exportWidth="${w}" exportHeight="${h}" precompose="dynamicResolution" bgcolor="${toAM(v('cb'),100)}" totalTime="${d}" fps="${fps}" modifiedTime="${Date.now()}" amver="1028417" ffver="106" am="com.alightcreative.motion/5.0.273.1028417" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n${body}</scene>\n`;
}

function shapeNode({id,label,pathD,fillColor,strokeColor,strokeSize=0,x=0,y=0,fillType='color'}){
  const lines = [];
  lines.push(`  <shape id="${id}" label="${esc(label)}" startTime="0" endTime="${n('cd')}" fillType="${fillType}" mediaFillMode="fill">`);
  lines.push(`    <transform>`);
  lines.push(`      <location value="${f6(x)},${f6(y)},0.000000" />`);
  lines.push(`    </transform>`);
  lines.push(`    <fillColor value="${fillColor}" />`);
  if(strokeSize > 0){
    lines.push(`    <path-stroke direction="centered" end-size="${f6(strokeSize)}" />`);
    if(strokeColor) lines.push(`    <strokeColor value="${strokeColor}" />`);
  }
  lines.push(`    <path d="${pathD}" />`);
  lines.push(`  </shape>`);
  return lines.join('\n');
}


// Counts the files made this visit so the home page can say so.
const markMade=()=>{try{sessionStorage.setItem('sa-made',String((+sessionStorage.getItem('sa-made')||0)+1))}catch(e){}};
document.addEventListener('made',markMade);

// Range sliders show their value
document.querySelectorAll('input[type=range]').forEach(r => {
  const out = r.parentNode.querySelector('output');
  if(out) r.oninput = () => { out.textContent = r.value; };
});

// Drag and drop onto file boxes
document.querySelectorAll('.drop').forEach(z => {
  ['dragenter','dragover'].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.add('over'); }));
  ['dragleave','drop'].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.remove('over'); }));
  z.addEventListener('drop', e => {
    const input = z.querySelector('input');
    if(e.dataTransfer.files.length){ input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
});

// Copy and download buttons
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
  try{ await navigator.clipboard.writeText(v(b.dataset.copy)); b.textContent='Copied'; } catch { $('#'+b.dataset.copy).select(); }
  setTimeout(()=>b.textContent='Copy',1200);
});
document.querySelectorAll('[data-copy-val]').forEach(b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(v(b.dataset.copyVal)); } catch{} });
document.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>{
  const t=v(b.dataset.dl); if(!t) return;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([t],{type:'text/xml'})); a.download='shins-archive.xml'; a.click(); URL.revokeObjectURL(a.href);
});
