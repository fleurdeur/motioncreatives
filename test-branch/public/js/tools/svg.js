// SVG to Alight Motion XML
function arcToC(x1,y1,rx,ry,phi,fa,fs,x2,y2,push){
  if(!rx || !ry){ push(['L',x2,y2]); return; }
  rx=Math.abs(rx); ry=Math.abs(ry);
  const p=phi*Math.PI/180, c=Math.cos(p), s=Math.sin(p);
  const dx=(x1-x2)/2, dy=(y1-y2)/2;
  const xp=c*dx+s*dy, yp=-s*dx+c*dy;
  const l=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(l>1){ rx*=Math.sqrt(l); ry*=Math.sqrt(l); }
  const sq=Math.max(0,(rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp)/(rx*rx*yp*yp+ry*ry*xp*xp));
  const co=(fa===fs?-1:1)*Math.sqrt(sq);
  const cxp=co*rx*yp/ry, cyp=-co*ry*xp/rx;
  const cx=c*cxp-s*cyp+(x1+x2)/2, cy=s*cxp+c*cyp+(y1+y2)/2;
  const ang=(ux,uy,vx,vy)=>Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
  const t1=ang(1,0,(xp-cxp)/rx,(yp-cyp)/ry);
  let dt=ang((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);
  if(!fs && dt>0) dt -= 2*Math.PI;
  if(fs && dt<0) dt += 2*Math.PI;
  const ns=Math.max(1,Math.ceil(Math.abs(dt)/(Math.PI/2)-1e-9));
  const d=dt/ns; const k=4/3*Math.tan(d/4);
  const P=a => [cx + rx*Math.cos(a)*c - ry*Math.sin(a)*s, cy + rx*Math.cos(a)*s + ry*Math.sin(a)*c];
  const D=a => [-rx*Math.sin(a)*c - ry*Math.cos(a)*s, -rx*Math.sin(a)*s + ry*Math.cos(a)*c];
  for(let j=0;j<ns;j++){
    const a1=t1+j*d, a2=a1+d, p1=P(a1), d1=D(a1), p2 = j===ns-1 ? [x2,y2] : P(a2), d2=D(a2);
    push(['C', p1[0]+k*d1[0], p1[1]+k*d1[1], p2[0]-k*d2[0], p2[1]-k*d2[1], p2[0], p2[1]]);
  }
}

function parseD(d){
  const tokens = d.match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  let i=0, cmd='', x=0, y=0, sx=0, sy=0, px=0, py=0, pc='';
  const out=[], push=q=>out.push(q), num=()=>parseFloat(tokens[i++]);
  while(i < tokens.length){
    if(/[a-z]/i.test(tokens[i])) cmd=tokens[i++];
    if(!cmd){ i++; continue; }
    const rel=cmd===cmd.toLowerCase();
    const C=cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if(C === 'M'){
      if(i+1 >= tokens.length) break;
      x = ox + num(); y = oy + num(); sx = x; sy = y;
      push(['M', x, y]);
      cmd = rel ? 'l' : 'L';
      pc = '';
      continue;
    }
    if(C === 'L'){ x = ox + num(); y = oy + num(); push(['L', x, y]); pc = ''; }
    else if(C === 'H'){ x = ox + num(); push(['L', x, y]); pc = ''; }
    else if(C === 'V'){ y = oy + num(); push(['L', x, y]); pc = ''; }
    else if(C === 'C'){
      const x1 = ox + num(), y1 = oy + num();
      const x2v = ox + num(), y2v = oy + num();
      const ex = ox + num(), ey = oy + num();
      push(['C', x1, y1, x2v, y2v, ex, ey]);
      px = x2v; py = y2v; x = ex; y = ey; pc = 'C';
    }
    else if(C === 'S'){
      const x1 = pc === 'C' ? 2*x - px : x;
      const y1 = pc === 'C' ? 2*y - py : y;
      const x2v = ox + num(), y2v = oy + num();
      const ex = ox + num(), ey = oy + num();
      push(['C', x1, y1, x2v, y2v, ex, ey]);
      px = x2v; py = y2v; x = ex; y = ey; pc = 'C';
    }
    else if(C === 'Q'){
      const qx = ox + num(), qy = oy + num();
      const ex = ox + num(), ey = oy + num();
      push(['C', x + 2/3*(qx - x), y + 2/3*(qy - y), ex + 2/3*(qx - ex), ey + 2/3*(qy - ey), ex, ey]);
      px = qx; py = qy; x = ex; y = ey; pc = 'Q';
    }
    else if(C === 'T'){
      const qx = pc === 'Q' ? 2*x - px : x;
      const qy = pc === 'Q' ? 2*y - py : y;
      const ex = ox + num(), ey = oy + num();
      push(['C', x + 2/3*(qx - x), y + 2/3*(qy - y), ex + 2/3*(qx - ex), ey + 2/3*(qy - ey), ex, ey]);
      px = qx; py = qy; x = ex; y = ey; pc = 'Q';
    }
    else if(C === 'A'){
      const rx = num(), ry = num(), phi = num();
      const fa = num(), fs = num();
      const ex = ox + num(), ey = oy + num();
      arcToC(x, y, rx, ry, phi, fa, fs, ex, ey, push);
      x = ex; y = ey; pc = '';
    }
    else if(C === 'Z'){
      if(x !== sx || y !== sy) push(['L', sx, sy]);
      x = sx; y = sy; pc = '';
    }
    else { i++; }
  }
  return out;
}

function elD(e){
  const g = k => parseFloat(e.getAttribute(k)) || 0;
  const tag = e.tagName.toLowerCase();
  if(tag === 'path') return e.getAttribute('d') || '';
  if(tag === 'rect'){
    const x = g('x'), y = g('y'), w = g('width'), h = g('height');
    const r = Math.min(g('rx') || g('ry') || 0, w/2, h/2);
    return r ? `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z` : `M${x} ${y}H${x+w}V${y+h}H${x}Z`;
  }
  if(tag === 'circle' || tag === 'ellipse'){
    const cx = g('cx'), cy = g('cy');
    const rx = tag === 'circle' ? g('r') : g('rx'), ry = tag === 'circle' ? g('r') : g('ry');
    return `M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`;
  }
  if(tag === 'line') return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
  if(tag === 'polyline' || tag === 'polygon'){
    const p = (e.getAttribute('points') || '').trim().split(/[\s,]+/);
    if(!p.length) return '';
    const m = 'M' + p.join(' ');
    return tag === 'polygon' ? m + ' Z' : m;
  }
  return '';
}

function safeColor(str, fallback='#00000000'){
  if(!str || str === 'none') return fallback;
  const s = String(str).trim();
  if(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)){
    return s.length === 4 ? '#' + [...s.slice(1)].map(ch => ch+ch).join('') : s;
  }
  const probe = document.createElement('div');
  probe.style.color = s;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  if(resolved && resolved !== 'rgba(0, 0, 0, 0)'){
    const m = resolved.match(/\d+(\.\d+)?/g);
    if(m && m.length >= 3){
      const [r,g,b,a='1'] = m.map(Number);
      return '#' + hx((Number(a) || 1) * 255) + hx(r) + hx(g) + hx(b);
    }
  }
  return fallback;
}

$('#vfile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if(!f) return;
  $('#vin').value = await f.text();
  $('#vname').textContent = f.name + ' loaded';
};

$('#vgo').onclick = () => {
  const raw = v('vin').trim();
  if(!raw){ $('#vmsg').textContent = 'Paste SVG code or choose a file first.'; return; }
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const error = doc.querySelector('parsererror');
  if(error || !doc.documentElement || doc.documentElement.tagName.toLowerCase() !== 'svg'){
    $('#vmsg').textContent = 'That is not valid SVG. Upload a .svg file or paste its full code.';
    return;
  }
  const host = document.createElement('div'); host.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden'; document.body.appendChild(host);
  const root = document.importNode(doc.documentElement, true); host.appendChild(root);
  let vb=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(parseFloat);
  if(vb.length<4 || vb.some(Number.isNaN)){ const w=parseFloat(root.getAttribute('width'))||100; const h=parseFloat(root.getAttribute('height'))||100; vb=[0,0,w,h]; }
  const W=n('cw'), H=n('ch'); const scale=Math.min(W/vb[2], H/vb[3])*0.9;
  try{
    const all=root.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
    let body='', count=0, skipped=0;
    for(const el of all){
      if(el.closest('defs,clipPath,mask,symbol,pattern,marker')){ skipped++; continue; }
      const d=elD(el); if(!d){ skipped++; continue; }
      const segs=parseD(d); if(segs.length<2){ skipped++; continue; }
      const cs=getComputedStyle(el);
      const fill=cs.fill || '#00000000'; const stroke=cs.stroke || 'none'; const strokeW=parseFloat(cs.strokeWidth)||0;
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      for(const seg of segs){
        for(let j=1;j<seg.length;j+=2){
          x0=Math.min(x0, seg[j]); x1=Math.max(x1, seg[j]);
          y0=Math.min(y0, seg[j+1]); y1=Math.max(y1, seg[j+1]);
        }
      }
      const cx=(x0+x1)/2, cy=(y0+y1)/2;
      const pathD = segs.map(seg => {
        const parts=[];
        for(let j=1;j<seg.length;j+=2){
          const px = W/2 + (seg[j] - (vb[0] + vb[2]/2)) * scale;
          const py = H/2 + (seg[j+1] - (vb[1] + vb[3]/2)) * scale;
          parts.push(`${f6((seg[j]-cx)*scale)} ${f6((seg[j+1]-cy)*scale)}`);
        }
        return seg[0] + ' ' + parts.join(', ');
      }).join('');
      const lx = W/2 + (cx - (vb[0] + vb[2]/2))*scale, ly = H/2 + (cy - (vb[1] + vb[3]/2))*scale;

      const fillColor=safeColor(fill, '#00000000');
      const finalStroke = stroke !== 'none' ? safeColor(stroke, '#000000ff') : null;
      const shapeFill = fill !== 'none' && fillColor !== '#00000000' ? shapeNode({id:rid(), label:`SVG ${count+1}`, pathD, fillColor: fillColor, strokeColor: null, strokeSize: 0, x:lx, y:ly, fillType:'color'}) : null;
      const strokeShape = stroke !== 'none' && strokeW > 0 && finalStroke ? shapeNode({id:rid(), label:`SVG ${count+1} stroke`, pathD, fillColor: finalStroke, strokeColor: null, strokeSize: strokeW * scale * 0.8, x:lx, y:ly, fillType:'none'}) : null;
      if(shapeFill) body += shapeFill + '\n';
      if(strokeShape) body += strokeShape + '\n';
      count += (shapeFill ? 1 : 0) + (strokeShape ? 1 : 0);
      if(!shapeFill && !strokeShape) skipped++;
    }
    $('#vout').value = count ? wrapScene(body) : '';
    $('#vmsg').textContent = count ? `Converted ${count} shape(s)${skipped ? `, skipped ${skipped}` : ''}.` : 'No drawable shapes found.';
  } finally { host.remove(); }
};

$('#vgo').addEventListener('click',()=>{ if(v('vout').trim()) markMade(); });
