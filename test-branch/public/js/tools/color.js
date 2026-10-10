// Color converter
function kFromPicker(){ $('#kam').value=toAM(v('kc'),n('ka')); paint(); }
function paint(){
  const m=/^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(v('kam').trim());
  if(!m){ $('#kmsg').textContent='Use the format #AARRGGBB, for example #ffea8f3b.'; return; }
  const a=parseInt(m[1],16)/255, rgb='#'+m[2];
  $('#ksw').style.background=`rgba(${parseInt(m[2].slice(0,2),16)},${parseInt(m[2].slice(2,4),16)},${parseInt(m[2].slice(4),16)},${a})`;
  $('#kmsg').textContent=`RGB ${rgb} · opacity ${Math.round(a*100)}%. Alight Motion puts alpha first.`;
}
$('#kc').oninput=$('#ka').oninput=kFromPicker;
$('#kam').oninput=()=>{
  const m=/^#([0-9a-f]{2})([0-9a-f]{6})$/i.exec(v('kam').trim());
  if(m){ $('#kc').value='#'+m[2]; $('#ka').value=Math.round(parseInt(m[1],16)/2.55); }
  paint();
};
kFromPicker();
