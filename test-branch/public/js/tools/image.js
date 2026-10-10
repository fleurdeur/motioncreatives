// Image to Alight Motion XML (tracer)
function showImagePreview(img){
  const canvas = $('#ipv');
  const ctx = canvas.getContext('2d');
  const maxPreview = 900;
  const scale = Math.min(1, maxPreview / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
}

const tick=()=>new Promise(r=>setTimeout(r,0));

// Dominant border colour and how flat the border is (null when the border is mostly transparent)
function borderBg(px,w,h){
  const r=[],g=[],b=[];let n=0;
  const add=i=>{n++;if(px[i*4+3]>=128){r.push(px[i*4]);g.push(px[i*4+1]);b.push(px[i*4+2])}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}
  for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}
  if(r.length<n*.5)return null;
  const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1],c=[med(r),med(g),med(b)];
  let flat=0;for(let k=0;k<r.length;k++)if(Math.max(Math.abs(r[k]-c[0]),Math.abs(g[k]-c[1]),Math.abs(b[k]-c[2]))<=14)flat++;
  return {c,flat:flat/r.length};
}
// Only the background colour that is connected to the border is removed; the same colour inside the subject stays
function buildBgMask(px,w,h,tol,bg){
  const mask=new Uint8Array(w*h),st=new Int32Array(w*h);let sp=0;
  const seed=i=>{if(mask[i]||px[i*4+3]<128)return;
    if(Math.max(Math.abs(px[i*4]-bg.c[0]),Math.abs(px[i*4+1]-bg.c[1]),Math.abs(px[i*4+2]-bg.c[2]))<=tol){mask[i]=1;st[sp++]=i}};
  for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x)}
  for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
  while(sp){const i=st[--sp],x=i%w,y=(i/w)|0;
    if(x>0)seed(i-1);if(x<w-1)seed(i+1);if(y>0)seed(i-w);if(y<h-1)seed(i+w)}
  return mask;
}

// k-means colour clustering on flat typed arrays (no per-pixel allocations)
function quant(px,n,K,skip){
  const pts=[];for(let i=0;i<n;i++)if(px[i*4+3]>127&&!(skip&&skip[i]))pts.push(i);
  if(!pts.length)return null;
  K=Math.max(1,Math.min(K,pts.length));
  const stp=Math.max(1,Math.floor(pts.length/8000)),S=[];for(let j=0;j<pts.length;j+=stp)S.push(pts[j]);
  const C=new Float32Array(K*3),setC=(k,i)=>{C[k*3]=px[i*4];C[k*3+1]=px[i*4+1];C[k*3+2]=px[i*4+2]};
  setC(0,S[0]);const md=new Float64Array(S.length).fill(Infinity);
  for(let k=1;k<K;k++){
    const cr=C[k*3-3],cg=C[k*3-2],cb=C[k*3-1];let bi=0,bd=-1;
    for(let j=0;j<S.length;j++){const i=S[j],d=(px[i*4]-cr)**2+(px[i*4+1]-cg)**2+(px[i*4+2]-cb)**2;if(d<md[j])md[j]=d;if(md[j]>bd){bd=md[j];bi=j}}
    setC(k,S[bi]);
  }
  const nearest=(r,g,b)=>{let bk=0,bd=Infinity;for(let k=0;k<K;k++){const d=(C[k*3]-r)**2+(C[k*3+1]-g)**2+(C[k*3+2]-b)**2;if(d<bd){bd=d;bk=k}}return bk};
  for(let it=0;it<5;it++){
    const sum=new Float64Array(K*3),cnt=new Float64Array(K);
    for(const i of S){const k=nearest(px[i*4],px[i*4+1],px[i*4+2]);sum[k*3]+=px[i*4];sum[k*3+1]+=px[i*4+1];sum[k*3+2]+=px[i*4+2];cnt[k]++}
    for(let k=0;k<K;k++)if(cnt[k]){C[k*3]=sum[k*3]/cnt[k];C[k*3+1]=sum[k*3+1]/cnt[k];C[k*3+2]=sum[k*3+2]/cnt[k]}
  }
  const lab=new Int16Array(n).fill(-1);
  for(const i of pts)lab[i]=nearest(px[i*4],px[i*4+1],px[i*4+2]);
  return {lab,K};
}

function segDist(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const L=dx*dx+dy*dy || 1;
  const t=Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / L));
  return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
}

function dp(p,e){
  if(p.length < 3) return p;
  let md=-1, mi=0;
  for(let i=1;i<p.length-1;i++){ const d=segDist(p[i], p[0], p[p.length-1]); if(d>md){ md=d; mi=i; } }
  return md <= e ? [p[0], p[p.length-1]] : dp(p.slice(0,mi+1),e).slice(0,-1).concat(dp(p.slice(mi),e));
}

function loopSegs(L,smooth,area){
  if(!L || L.length < 4) return null;
  const src=L.map((p,i)=>{ const q=L[(i+1)%L.length]; return [(p[0]+q[0])/2, (p[1]+q[1])/2]; });
  const small = area < 40 || L.length < 18;
  const radius = (!smooth || small) ? 0 : Math.min(2, Math.floor(L.length/90));
  const M = radius ? src.map((_,i)=>{ let sx=0, sy=0, count=0; for(let j=-radius;j<=radius;j++){ const p=src[(i+j+src.length)%src.length]; sx+=p[0]; sy+=p[1]; count++; } return [sx/count, sy/count]; }) : src;
  const tolerance = small ? .2 : (area < 180 ? .45 : .7);
  const P = dp(M.concat([M[0]]), tolerance);
  if(P.length < 3) return null;
  P.pop();
  if(P.length < 3) return null;
  const n=P.length; const sg=[['M', P[0][0], P[0][1]]];
  for(let i=0;i<n;i++){
    const p0=P[(i+n-1)%n], p1=P[i], p2=P[(i+1)%n], p3=P[(i+2)%n];
    if(!smooth || small){ sg.push(['L', p2[0], p2[1]]); }
    else { sg.push(['C', p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6, p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6, p2[0], p2[1]]); }
  }
  return sg;
}

let srcImg=null,lastAuto='';


// ---- Auto-tune: read the picture, pick settings, then verify the colour count by tracing small test versions ----
function analyze(img){
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,s=Math.min(1,160/Math.max(iw,ih));
  const w=Math.max(1,Math.round(iw*s)),h=Math.max(1,Math.round(ih*s)),N=w*h;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,w,h);
  const px=cx.getImageData(0,0,w,h).data;
  let tp=0;for(let i=0;i<N;i++)if(px[i*4+3]<128)tp++;
  const hasAlpha=tp>N*.01,bg=hasAlpha?null:borderBg(px,w,h),plainBg=!!(bg&&bg.flat>.6);
  const lightBg=plainBg&&(.299*bg.c[0]+.587*bg.c[1]+.114*bg.c[2])>225;
  const cnt=new Map();let op=0,edge=0;
  for(let i=0;i<N;i++){
    if(px[i*4+3]<128)continue;op++;
    const k=((px[i*4]>>4)<<8)|((px[i*4+1]>>4)<<4)|(px[i*4+2]>>4);cnt.set(k,(cnt.get(k)||0)+1);
    if(i%w<w-1&&i+w<N){const j=i+1,l=i+w;
      const d=Math.abs(px[i*4]-px[j*4])+Math.abs(px[i*4+1]-px[j*4+1])+Math.abs(px[i*4+2]-px[j*4+2])+Math.abs(px[i*4]-px[l*4])+Math.abs(px[i*4+1]-px[l*4+1])+Math.abs(px[i*4+2]-px[l*4+2]);
      if(d>90)edge++}
  }
  let bins=0;for(const c of cnt.values())if(c>=op*.004)bins++;
  return {iw,ih,hasAlpha,plainBg,lightBg,bins,edge:edge/Math.max(1,op)};
}
function pickConfig(a){
  const cl=(x,lo,hi)=>Math.max(lo,Math.min(hi,x)),big=Math.max(a.iw,a.ih);
  const it=cl(Math.round(Math.min(big,a.edge>.12?700:a.edge>.06?560:420)/8)*8,128,800);
  const ik=cl(Math.round(a.bins*1.1)+3,8,40);
  return {ik,it,isp:cl(Math.round(it*it*.00028),4,120),imax:cl(Math.round(ik*10*(1+3*a.edge)/50)*50,100,600),parts:true,snap:88,
    ihair:cl(Math.round(60*(it/600)**2),10,200),white:!a.hasAlpha&&a.lightBg,smart:a.edge>.05,smooth:big>=96,wt:10};
}
function renderErr(tr){
  const cv=document.createElement('canvas');cv.width=tr.w;cv.height=tr.h;
  const c=cv.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,tr.w,tr.h);drawRend(c,tr.rend,1,0,0);
  const o=c.getImageData(0,0,tr.w,tr.h).data,p=tr.px,N=tr.w*tr.h;let e=0;
  for(let i=0;i<N;i++){const al=p[i*4+3]/255;for(let k=0;k<3;k++){const sv=p[i*4+k]*al+255*(1-al);e+=(sv-o[i*4+k])**2}}
  return e/(N*3);
}
const setRange=(id,val)=>{const el=$('#'+id);if(!el)return;el.value=val;const o=el.parentNode.querySelector('output');if(o)o.textContent=el.value};
async function autoTune(img){
  const a=analyze(img),cfg=pickConfig(a),res=[];
  const cands=[...new Set([.5,.75,1,1.4].map(f=>Math.max(6,Math.min(48,Math.round(cfg.ik*f)))))].sort((x,y)=>x-y);
  for(const K of cands){
    $('#imsg').textContent=`Analyzing image… testing ${K} colors`;await tick();
    const pd=Math.min(cfg.it,240);
    const tr=await traceImage({it:pd,ik:K,isp:Math.max(3,Math.round(cfg.isp*(pd/cfg.it)**2)),imax:cfg.imax,ihair:cfg.ihair,white:cfg.white,smart:false,smooth:true,wt:cfg.wt,parts:cfg.parts,isn:cfg.snap},img);
    if(tr&&tr.count)res.push({K,err:renderErr(tr)});
  }
  if(res.length){const best=Math.min(...res.map(r=>r.err));cfg.ik=res.find(r=>r.err<=best*1.12+4).K}   // fewest colors that stays within ~12% of the best match
  setRange('ik',cfg.ik);setRange('it',cfg.it);setRange('isp',cfg.isp);setRange('imax',cfg.imax);setRange('ihair',cfg.ihair);setRange('iwt',cfg.wt);setRange('isn',cfg.snap);$('#iparts').checked=cfg.parts;
  $('#iwhite').checked=cfg.white;$('#ismart').checked=cfg.smart;$('#ism').checked=cfg.smooth;
  const kind=a.hasAlpha?'transparent background':a.plainBg?(a.lightBg?'plain light background':'plain dark background'):'busy background';
  lastAuto=`Auto-tuned for ${kind}: ${$('#ik').value} colors, detail ${$('#it').value}, max ${$('#imax').value} shapes. You can still change any setting.`;
}
document.querySelectorAll('#img input[type=range]').forEach(e=>e.addEventListener('input',()=>{lastAuto=''}));
document.querySelectorAll('#img .chk input').forEach(e=>e.addEventListener('change',()=>{lastAuto=''}));

// exact segment format seen in Alight Motion exports: M x y / L x y / C x y, x y, x y, joined with no separator
const fmtPath=(sg,ox,oy)=>sg.map(z=>{const p=[];for(let j=1;j<z.length;j+=2)p.push(f6(z[j]-ox)+' '+f6(z[j+1]-oy));return z[0]+' '+p.join(', ')}).join('');

// Fit a clean ellipse or rectangle to a region (from its moments). Returns path segments when it matches well enough.
// region pixels plus any holes inside them (holes are covered by the smaller parts drawn on top)
function fillHoles(list,w){
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(const i of list){const x=i%w,y=(i/w)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  const bw=x1-x0+3,bh=y1-y0+3,g=new Uint8Array(bw*bh);
  for(const i of list)g[(((i/w)|0)-y0+1)*bw+(i%w-x0+1)]=1;
  const st=[0];g[0]=2;
  while(st.length){const k=st.pop(),x=k%bw,y=(k/bw)|0;
    for(const j of [x>0?k-1:-1,x<bw-1?k+1:-1,y>0?k-bw:-1,y<bh-1?k+bw:-1])if(j>=0&&g[j]===0){g[j]=2;st.push(j)}}
  const out=list.slice();
  for(let k=0;k<g.length;k++)if(g[k]===0)out.push((((k/bw)|0)+y0-1)*w+(k%bw)+x0-1);
  return out;
}
function fitPrim(list,w,thr){
  list=fillHoles(list,w);
  const n=list.length;let sx=0,sy=0;
  for(const i of list){sx+=i%w;sy+=(i/w)|0}
  const mx=sx/n,my=sy/n;let cxx=0,cyy=0,cxy=0;
  for(const i of list){const dx=i%w-mx,dy=((i/w)|0)-my;cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy}
  cxx/=n;cyy/=n;cxy/=n;
  const tr=cxx+cyy,disc=Math.sqrt(Math.max(0,tr*tr/4-(cxx*cyy-cxy*cxy))),l1=tr/2+disc+1/12,l2=Math.max(1/12,tr/2-disc+1/12);
  const th=.5*Math.atan2(2*cxy,cxx-cyy),c=Math.cos(th),s=Math.sin(th);
  const ea=2*Math.sqrt(l1),eb=2*Math.sqrt(l2),ra=Math.sqrt(3*l1),rb=Math.sqrt(3*l2);
  let inE=0,inR=0;
  for(const i of list){const dx=i%w-mx,dy=((i/w)|0)-my,u=dx*c+dy*s,q=-dx*s+dy*c;
    if((u/ea)**2+(q/eb)**2<=1)inE++;if(Math.abs(u)<=ra&&Math.abs(q)<=rb)inR++}
  const iE=inE/(n+Math.PI*ea*eb-inE),iR=inR/(n+4*ra*rb-inR),rect=iR>iE,iou=rect?iR:iE;
  if(iou<thr||Math.min(ea,eb)<2)return null;
  const X=mx+.5,Y=my+.5,pad=.6,W_=(rect?ra:ea)+pad,H_=(rect?rb:eb)+pad;
  const P=(u,q)=>[X+u*c-q*s,Y+u*s+q*c];
  if(rect){const a=P(-W_,-H_),b=P(W_,-H_),d=P(W_,H_),e=P(-W_,H_);
    return {kind:'Rect',iou,sg:[['M',...a],['L',...b],['L',...d],['L',...e],['L',...a]]}}
  const k=.5522847,a=W_,b=H_,pt=(u,q)=>P(u,q);
  const seg=(u1,q1,u2,q2,u3,q3)=>['C',...pt(u1,q1),...pt(u2,q2),...pt(u3,q3)];
  return {kind:'Ellipse',iou,sg:[['M',...pt(a,0)],seg(a,k*b,k*a,b,0,b),seg(-k*a,b,-a,k*b,-a,0),seg(-a,-k*b,-k*a,-b,0,-b),seg(k*a,-b,a,-k*b,a,0)]};
}

// draws the traced shapes with the same geometry that goes into the XML
function drawRend(ctx,rend,a,e,f){
  ctx.setTransform(a,0,0,a,e,f);
  for(const r of rend){
    ctx.beginPath();
    for(const sg of r.loops){
      for(const z of sg){z[0]==='M'?ctx.moveTo(z[1],z[2]):z[0]==='L'?ctx.lineTo(z[1],z[2]):ctx.bezierCurveTo(z[1],z[2],z[3],z[4],z[5],z[6])}
      ctx.closePath();
    }
    ctx.fillStyle=`rgb(${r.c})`;ctx.fill();
  }
  ctx.setTransform(1,0,0,1,0,0);
}

async function traceImage(demo,img){
  const m=demo?{}:$('#imsg'),src=img||srcImg,g=id=>demo&&id in demo?demo[id]:n(id);
  const flag=(id,k)=>demo?!!demo[k]:!!($(id)&&$(id).checked),say=t=>{m.textContent=t};
  if(!src){say('Choose an image first.');return null}
  const t0=performance.now(),iw=src.naturalWidth||src.width,ih=src.naturalHeight||src.height;
  const k0=Math.min(1,g('it')/Math.max(iw,ih)),w=Math.max(1,Math.round(iw*k0)),h=Math.max(1,Math.round(ih*k0)),N=w*h;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(src,0,0,w,h);
  const px=cx.getImageData(0,0,w,h).data;

  say('Step 1 of 4: finding colors…');await tick();
  let skip=null,note='';
  if(flag('#iwhite','white')){
    let tp=0;for(let i=0;i<N;i++)if(px[i*4+3]<128)tp++;
    if(tp>N*.01)note=' Transparent PNG: its transparency is used, so white parts of the subject are kept.';
    else{const bg=borderBg(px,w,h);
      if(bg&&bg.flat>.6)skip=buildBgMask(px,w,h,demo?(demo.wt||10):n('iwt'),bg);
      else note=' The background is not plain, so nothing was removed.'}
  }
  const q=quant(px,N,Math.min(48,g('ik')),skip);
  if(!q){say('This image is fully transparent or all white.');return null}
  const lab=q.lab;

  say('Step 2 of 4: splitting into regions…');await tick();
  const comp=new Int32Array(N).fill(-1),stack=new Int32Array(N),pix=[],rl=[];
  for(let s0=0;s0<N;s0++){
    if(lab[s0]<0||comp[s0]>=0)continue;
    const cid=pix.length,L=lab[s0],list=[];let sp=0,j;stack[sp++]=s0;comp[s0]=cid;
    while(sp){const i=stack[--sp];list.push(i);const x=i%w,y=(i/w)|0;
      if(x>0&&comp[j=i-1]<0&&lab[j]===L){comp[j]=cid;stack[sp++]=j}
      if(x<w-1&&comp[j=i+1]<0&&lab[j]===L){comp[j]=cid;stack[sp++]=j}
      if(y>0&&comp[j=i-w]<0&&lab[j]===L){comp[j]=cid;stack[sp++]=j}
      if(y<h-1&&comp[j=i+w]<0&&lab[j]===L){comp[j]=cid;stack[sp++]=j}}
    pix.push(list);rl.push(L);
  }
  const alive=pix.map(()=>true),smart=flag('#ismart','smart'),parts=flag('#iparts','parts'),hairMax=demo?(demo.ihair||60):(Number(v('ihair'))||60);
  const bbox=c=>{let x0=w,y0=h,x1=-1,y1=-1;for(const i of pix[c]){const x=i%w,y=(i/w)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
    const bw=x1-x0+1,bh=y1-y0+1;return {cx:(x0+x1)/2,cy:(y0+y1)/2,asp:Math.max(bw,bh)/Math.max(1,Math.min(bw,bh))}};
  const thin=c=>smart&&pix[c].length>=6&&pix[c].length<hairMax&&bbox(c).asp>2.4;   // thin strands are kept, then grouped
  // tiny regions are absorbed by the neighbour they share the most border with, so no gaps are left
  const mergeBelow=t=>{
    const ord=[];for(let c=0;c<pix.length;c++)if(alive[c]&&pix[c].length<t)ord.push(c);
    ord.sort((a,b)=>pix[a].length-pix[b].length);
    for(const c of ord){
      if(!alive[c]||pix[c].length>=t||thin(c))continue;
      const cnt=new Map(),add=j=>{const d=comp[j];if(d>=0&&d!==c)cnt.set(d,(cnt.get(d)||0)+1)};
      for(const i of pix[c]){const x=i%w,y=(i/w)|0;if(x>0)add(i-1);if(x<w-1)add(i+1);if(y>0)add(i-w);if(y<h-1)add(i+w)}
      alive[c]=false;if(!cnt.size)continue;
      let best=-1,bn=0;for(const [d,k] of cnt)if(k>bn){bn=k;best=d}
      for(const i of pix[c]){comp[i]=best;pix[best].push(i)}
      pix[c]=[];
    }
  };
  const cap=demo?(demo.imax||150):g('imax');let sp0=Math.max(2,g('isp')),liveN=()=>alive.reduce((a,b)=>a+(b?1:0),0);
  mergeBelow(sp0);
  for(let guard=0;liveN()>cap*1.5&&guard<10&&sp0<N/6;guard++){sp0=Math.ceil(sp0*1.7);mergeBelow(sp0)}   // too many regions: merge harder instead of cutting shapes
  const live=[];for(let c=0;c<pix.length;c++)if(alive[c]&&pix[c].length)live.push(c);

  say('Step 3 of 4: tracing outlines…');await tick();
  const W1=w+1,V=(x,y)=>y*W1+x;
  const outlines=(c,ex)=>{                       // ordered outer outlines of one region
    const inC=j=>comp[j]===c||ex.has(j),mm=new Map(),res=[];
    const add=(a,b)=>{let l=mm.get(a);if(!l)mm.set(a,l=[]);l.push(b)};
    const each=i=>{const x=i%w,y=(i/w)|0;
      if(y===0||!inC(i-w))add(V(x,y),V(x+1,y));
      if(x===w-1||!inC(i+1))add(V(x+1,y),V(x+1,y+1));
      if(y===h-1||!inC(i+w))add(V(x+1,y+1),V(x,y+1));
      if(x===0||!inC(i-1))add(V(x,y+1),V(x,y))};
    pix[c].forEach(each);ex.forEach(each);
    for(const [s0,arr] of mm)while(arr.length){
      const Lp=[s0];let cur=arr.pop();
      while(cur!==s0){Lp.push(cur);const a=mm.get(cur);if(!a||!a.length)break;cur=a.pop()}
      const pts=Lp.map(u=>[u%W1,Math.floor(u/W1)]);let ar=0;
      for(let i=0;i<pts.length;i++){const p=pts[i],o=pts[(i+1)%pts.length];ar+=p[0]*o[1]-o[0]*p[1]}
      ar/=2;if(ar>=3)res.push({ar,pts});
    }
    return res;
  };
  const none=new Set(),area0=new Map();
  for(let k=0;k<live.length;k++){const c=live[k],o=outlines(c,none);area0.set(c,o.length?Math.max(...o.map(z=>z.ar)):0);if(k%400===399)await tick()}
  const rk=new Map();live.filter(c=>area0.get(c)>0).sort((a,b)=>area0.get(b)-area0.get(a)).forEach((c,r)=>rk.set(c,r));

  // smart grouping: thin same-colour strands that sit close together become one shape
  const units=[],used=new Set();
  const gdist=Math.max(8,30*w/600)*(parts?2:1);
  const hair=(smart||parts)?live.filter(c=>rk.has(c)&&pix[c].length<(parts?hairMax*3:hairMax)&&(parts||bbox(c).asp>2.4)):[];
  const hs=new Set(hair),info=new Map(hair.map(c=>[c,bbox(c)])),grid=new Map();
  const cell=c=>Math.floor(info.get(c).cx/gdist)+','+Math.floor(info.get(c).cy/gdist);
  for(const c of hair){const k=cell(c);(grid.get(k)||grid.set(k,[]).get(k)).push(c)}
  for(const c of live){
    if(!rk.has(c)||used.has(c))continue;
    const grp=[c];used.add(c);
    if(hs.has(c)){
      const a=info.get(c),gx=Math.floor(a.cx/gdist),gy=Math.floor(a.cy/gdist);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const d of grid.get((gx+dx)+','+(gy+dy))||[]){
        if(used.has(d)||rl[d]!==rl[c]||grp.length>=(parts?120:40))continue;
        const b=info.get(d);if(Math.hypot(a.cx-b.cx,a.cy-b.cy)<gdist){grp.push(d);used.add(d)}}
    }
    units.push({grp,key:Math.max(...grp.map(z=>area0.get(z)))});
  }
  units.sort((a,b)=>b.key-a.key);
  const total=units.length;if(total>cap)units.length=cap;

  say('Step 4 of 4: writing shapes…');await tick();
  const W=n('cw'),H=n('ch'),sc=Math.min(W/w,H/h),smooth=flag('#ism','smooth')||(!demo&&!$('#ism'));
  const T=(x,y)=>[W/2+(x-w/2)*sc,H/2+(y-h/2)*sc];
  const xml=[],rend=[],snap=g('isn')>=60?g('isn'):0;let snapped=0;
  for(let u=0;u<units.length;u++){
    const loops=[],comps=units[u].grp;let sr=0,sg_=0,sb=0,cn=0,kind='';
    for(const c of comps){
      const ex=new Set(),r=rk.get(c);          // each region reaches 1px under the smaller regions drawn on top: no seams
      for(const i of pix[c]){const x=i%w,y=(i/w)|0;
        for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]){if(j<0)continue;const d=comp[j];if(d!==c&&d>=0&&rk.has(d)&&rk.get(d)>r)ex.add(j)}
        sr+=px[i*4];sg_+=px[i*4+1];sb+=px[i*4+2];cn++}
      const fp=snap&&pix[c].length>=24?fitPrim(pix[c],w,snap/100):null;
      if(fp){loops.push(fp.sg);snapped++;if(comps.length===1)kind=fp.kind}
      else for(const o of outlines(c,ex)){const sgm=loopSegs(o.pts,smooth,o.ar);if(sgm)loops.push(sgm)}
    }
    if(!loops.length)continue;
    const col=[sr/cn,sg_/cn,sb/cn].map(Math.round),lum=.299*col[0]+.587*col[1]+.114*col[2];
    const scene=loops.map(sgm=>sgm.map(z=>{const o=[z[0]];for(let j=1;j<z.length;j+=2){const t=T(z[j],z[j+1]);o.push(t[0],t[1])}return o}));
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    scene.forEach(sgm=>sgm.forEach(z=>{for(let j=1;j<z.length;j+=2){x0=Math.min(x0,z[j]);x1=Math.max(x1,z[j]);y0=Math.min(y0,z[j+1]);y1=Math.max(y1,z[j+1])}}));
    const ox=(x0+x1)/2,oy=(y0+y1)/2;
    xml.push(shapeNode({id:rid(),label:(kind||(comps.length>1?(lum<70?'Lineart':'Group'):'Part'))+' '+(xml.length+1),pathD:scene.map(sgm=>fmtPath(sgm,ox,oy)).join(''),
      fillColor:'#ff'+col.map(hx).join(''),strokeColor:null,strokeSize:0,x:ox,y:oy,fillType:'color'}));
    rend.push({c:col,loops});
    if(u%150===149)await tick();
  }
  const cnt=xml.length;
  if(!demo){
    $('#iout').value=cnt?wrapScene(xml.join('\n')):'';
    const pv=$('#ipv'),k=Math.min(1,900/Math.max(W,H));          // preview = the exact shapes written to the XML
    pv.width=Math.max(1,Math.round(W*k));pv.height=Math.max(1,Math.round(H*k));
    const pc=pv.getContext('2d');pc.fillStyle=v('cb')||'#ffffff';pc.fillRect(0,0,pv.width,pv.height);
    drawRend(pc,rend,k*sc,k*(W/2-w/2*sc),k*(H/2-h/2*sc));pv.hidden=false;
    say(cnt?`Made ${cnt} shapes in ${((performance.now()-t0)/1000).toFixed(1)} s${snapped?`, ${snapped} snapped to clean ellipses or rectangles`:''}${total>cnt?` (kept the ${cnt} biggest of ${total}; raise Max shapes for more)`:''}. The preview above matches the XML.${note}${lastAuto?' '+lastAuto:''}`:'Nothing to trace. Try adjusting colors or detail.');
  }
  return {count:cnt,w,h,rend,px};
}

$('#ifile').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    if(srcImg && srcImg._u) URL.revokeObjectURL(srcImg._u);
    img._u = url; srcImg = img;
    $('#iname').textContent = file.name + ' loaded';
    $('#imsg').textContent = 'Image loaded. Adjust the settings or trace it to XML.';
    showImagePreview(img);
    if($('#iauto').checked){ try{ await autoTune(img); }catch(err){ lastAuto=''; } }
    runTrace();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    $('#ipv').hidden = true;
    $('#imsg').textContent = 'This file could not be read as an image.';
  };
  img.src = url;
};

async function runTrace(){
  const btn = $('#igo'); btn.disabled = true; btn.textContent = 'Tracing…';
  $('#imsg').textContent = 'Tracing, this can take a few seconds…';
  await new Promise(r => setTimeout(r, 40));
  try{
    await traceImage();
    if(v('iout').trim()) document.dispatchEvent(new Event('made'));
  } finally {
    btn.disabled = false; btn.textContent = 'Trace to XML';
  }
}
$('#igo').onclick = () => runTrace();
$('#iat').onclick = async () => {
  if(!srcImg){ $('#imsg').textContent = 'Choose an image first.'; return; }
  $('#iat').disabled = true;
  try{ await autoTune(srcImg); } finally { $('#iat').disabled = false; }
  runTrace();
};
