// Preset Finder
// <extract>
// Finds Alight Motion preset links and Google Drive file/folder links in any text.
// Edit AM_DOMAINS if Alight Motion adds a new link domain.
const AM_DOMAINS = 'alight\\.link|alightcreative\\.com|alightmotion\\.com|alightmotion\\.page\\.link|alightcreative\\.page\\.link';
const URL_CHARS = '[A-Za-z0-9\\-._~%!$&*+,;=:@\\/?#]*';
const LEAD = '(^|[^\\w.@\\/-])';
// "Preset 2:", "xml 3 -", "2." right before a link gives its number
function ctxNum(before) {
  const a = /(?:preset|part|pt|link|file|xml|no\.?|#)\s*[:#.\-]?\s*(\d{1,2})\s*[:.)\-\u2013\u2014]*\s*$/i.exec(before);
  if (a) return +a[1];
  const b = /(?:^|[\s(])(\d{1,2})\s*[.):]\s*$/.exec(before);
  return b ? +b[1] : 0;
}
// returns [{ url, kind: 'preset' | 'xml' | 'drive', num, dl? }]
function findLinks(text) {
  const t = String(text || '').replace(/&amp;/gi, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const seen = new Map(), out = [];
  const put = (it) => {
    const o = seen.get(it.url);
    if (!o) { seen.set(it.url, it); out.push(it); return; }
    if (!o.num && it.num) o.num = it.num;
    if (o.kind === 'drive' && it.kind === 'xml') o.kind = 'xml';
  };
  let m;
  const am = new RegExp(LEAD + '((?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*(?:' + AM_DOMAINS + ')(?:\\/' + URL_CHARS + ')?)', 'gi');
  while ((m = am.exec(t))) {
    const body = m[2].replace(/^https?:\/\//i, '').replace(/[.,;:!?]+$/, '');
    const slash = body.indexOf('/');
    if (slash < 0 || slash === body.length - 1) continue;      // a bare domain is not a preset
    const start = m.index + m[1].length;
    put({ url: 'https://' + body.slice(0, slash).toLowerCase().replace(/^www\./, '') + body.slice(slash), kind: 'preset', num: ctxNum(t.slice(Math.max(0, start - 40), start)) });
  }
  const dr = new RegExp(LEAD + '((?:https?:\\/\\/)?(?:drive\\.google\\.com|drive\\.usercontent\\.google\\.com)\\/' + URL_CHARS + ')', 'gi');
  while ((m = dr.exec(t))) {
    const raw = m[2].replace(/[.,;:!?)]+$/, '');
    const folder = /\/folders\/([\w-]{10,})/.exec(raw);
    const file = /\/d\/([\w-]{10,})/.exec(raw) || /[?&]id=([\w-]{10,})/.exec(raw);
    if (!folder && !file) continue;
    const start = m.index + m[1].length;
    const isXml = /xml/i.test(t.slice(Math.max(0, start - 48), start) + ' ' + t.slice(start + raw.length, start + raw.length + 24));
    put({
      url: folder ? 'https://drive.google.com/drive/folders/' + folder[1] : 'https://drive.google.com/file/d/' + file[1] + '/view',
      kind: isXml ? 'xml' : 'drive',
      num: ctxNum(t.slice(Math.max(0, start - 40), start)),
      dl: folder ? undefined : 'https://drive.google.com/uc?export=download&id=' + file[1],
    });
  }
  return out;
}
function amLinks(text) { return findLinks(text).filter((x) => x.kind === 'preset').map((x) => x.url); }
// </extract>

// --- Preset Finder page: asks /api/find (the Cloudflare worker) to scan a TikTok video ---
(()=>{
  const SRC={caption:'Caption',bio:'Bio',biolink:'Link in bio',comment:'Comment',reply:'Reply',paste:'Pasted text'};
  const LABEL={video:'Video',caption:'Caption',bio:'Bio',biolink:'Link in bio',comments:'Comments',replies:'Replies'};
  const msg=t=>{$('#fmsg').textContent=t};
  let current=[];
  const copyText=async(t,btn,idle)=>{
    try{ await navigator.clipboard.writeText(t); btn.textContent='Copied'; }
    catch{ const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); btn.textContent='Copied'; }catch{ btn.textContent='Press and hold to copy'; } ta.remove(); }
    setTimeout(()=>btn.textContent=idle,1400);
  };
  function showStatus(st){
    const box=$('#fsrc'); box.textContent='';
    for(const k of Object.keys(LABEL)){
      const x=st&&st[k]; if(!x) continue;
      const sp=document.createElement('span'); sp.className=x.state; sp.textContent=LABEL[k]+(x.note?': '+x.note:'');
      box.appendChild(sp);
    }
  }
  // ---- preview: a cover image (animated when TikTok provides one) from this site's own image proxy. No TikTok player or iframe is ever loaded. ----
  const CDN=/(^|\.)(tiktokcdn(-us|-eu)?\.com|ibyteimg\.com|byteimg\.com)$/i;
  const cdnOnly=u=>{ try{ const x=new URL(u); return x.protocol==='https:'&&CDN.test(x.hostname)?x.href:''; }catch{ return ''; } };
  const okImg=u=>typeof u==='string'&&u.length<2100&&(u.startsWith('/api/thumb?u=')||cdnOnly(u)===u);
  const okTT=u=>{ try{ const x=new URL(u); return x.protocol==='https:'&&/(^|\.)tiktok\.com$/i.test(x.hostname); }catch{ return false; } };
  function showPreview(p){
    const box=$('#fprev');
    if(!p||(!p.image&&!p.caption)){ box.hidden=true; return; }
    const img=$('#fpi'), link=$('#fpl');
    const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chain=(reduce?[p.still,p.image]:[p.image,p.still]).filter((u,i,a)=>u&&okImg(u)&&a.indexOf(u)===i);
    let k=0; link.classList.remove('noimg');
    const next=()=>{ if(k<chain.length){ img.src=chain[k++]; } else { img.removeAttribute('src'); link.classList.add('noimg'); } };
    img.onerror=next; next();
    link.href=okTT(p.videoUrl)?p.videoUrl:'https://www.tiktok.com/';
    $('#fpn').textContent=[p.name,p.author?'@'+p.author:''].filter(Boolean).join(' ');
    $('#fpc').textContent=p.caption||'';
    box.hidden=false;
  }
  // Last resort when the server cannot reach TikTok: ask TikTok's public oEmbed endpoint straight from this browser, which TikTok treats like any visitor.
  // Whether TikTok allows that cross-site request is up to TikTok, so a failure here is silent.
  async function browserFallback(url){
    try{
      const r=await fetch('https://www.tiktok.com/oembed?url='+encodeURIComponent(url),{headers:{accept:'application/json'},referrerPolicy:'no-referrer'});
      if(!r.ok) return false;
      const j=await r.json();
      if(!j||typeof j.title!=='string') return false;
      const links=findLinks(j.title).map(l=>({...l,from:[{source:'caption'}]}));
      const th=cdnOnly(j.thumbnail_url);
      showStatus({video:{state:'partial',note:'The server was refused, so this was read from your own browser.'},caption:{state:'ok'},comments:{state:'skipped',note:'Comments need the server.'}});
      showLinks(links);
      showPreview({videoUrl:okTT(url)?url:'',caption:j.title,author:String(j.author_unique_id||'').replace(/[^\w.]/g,''),name:String(j.author_name||'').slice(0,60),image:th,still:th});
      msg(links.length?`Found ${links.length} preset link${links.length>1?'s':''} in the caption. Comments were not checked because the server could not reach TikTok.`:'The caption has no Alight Motion links, and the server could not reach TikTok to check the comments. You can paste the text yourself below.');
      return true;
    }catch{ return false; }
  }

  // What happened to the finds in the Preset Library (sent for review, already there, or switched off)
  function showLibrary(lib){
    const box=$('#flib'); box.textContent='';
    if(!lib||(!lib.added&&!lib.known)){ box.hidden=true; return; }
    const a=document.createElement('a'); a.href='/directory.html'; a.textContent='Preset Library';
    const parts=[];
    if(lib.added) parts.push(lib.added+' new find'+(lib.added>1?'s were':' was')+' sent to the ');
    else parts.push('These finds are already in (or waiting for) the ');
    box.append(parts[0],a,lib.added?' for review. They appear once the admin approves them.':'.');
    box.hidden=false;
  }

  function showLinks(links){
    const box=$('#fres'); box.textContent=''; current=[];
    const G=[['preset','Alight Motion presets','Preset'],['xml','XML files on Drive','XML'],['drive','Other Drive files and folders','File']];
    const groups={preset:[],xml:[],drive:[]};
    links.forEach((l,i)=>(groups[l.kind]||groups.preset).push({l,i}));
    for(const [k,title,word] of G){
      const g=groups[k]; if(!g.length) continue;
      g.sort((a,b)=>((a.l.num||999)-(b.l.num||999))||a.i-b.i);
      const hd=document.createElement('h3'); hd.className='gh'; hd.append(title);
      const cn=document.createElement('small'); cn.textContent=g.length; hd.append(cn); box.appendChild(hd);
      g.forEach(({l},idx)=>{
        current.push(l.url);
        const row=document.createElement('div'); row.className='lk';
        if(l.num||g.length>1){ const pl=document.createElement('b'); pl.className='pl'; pl.textContent=word+' '+(l.num||idx+1); row.appendChild(pl); }
        const a=document.createElement('a'); a.href=l.url; a.textContent=l.url; a.target='_blank'; a.rel='noopener noreferrer';
        const tg=document.createElement('div'); tg.className='tg';
        const seen=new Set();
        for(const f of l.from){
          const t=(SRC[f.source]||f.source)+(f.by?' by @'+f.by:''); if(seen.has(t)) continue; seen.add(t);
          const sp=document.createElement('span'); sp.textContent=t; tg.appendChild(sp);
        }
        const ra=document.createElement('div'); ra.className='ra';
        const cp=document.createElement('button'); cp.type='button'; cp.className='btn'; cp.textContent='Copy'; cp.onclick=()=>copyText(l.url,cp,'Copy');
        const op=document.createElement('a'); op.className='btn alt'; op.href=l.url; op.target='_blank'; op.rel='noopener noreferrer'; op.textContent='Open'; op.style.textDecoration='none';
        ra.append(cp,op);
        if(typeof l.dl==='string'&&l.dl.startsWith('https://drive.google.com/uc?')){
          const dl=document.createElement('a'); dl.className='btn alt'; dl.href=l.dl; dl.target='_blank'; dl.rel='noopener noreferrer'; dl.textContent='Direct download'; dl.style.textDecoration='none'; ra.append(dl);
        }
        row.append(a,tg,ra); box.appendChild(row);
      });
    }
    $('#fall').hidden=!current.length;
  }
  async function search(){
    const url=$('#fu').value.trim(), b=$('#fgo');
    if(!url){ msg('Paste a TikTok video link first.'); return; }
    b.disabled=true; b.textContent='Searching...'; msg('Scanning the video, bio and comments. This can take up to 20 seconds.'); showStatus(null); showLinks([]); showPreview(null); showLibrary(null);
    try{
      const r=await fetch('/api/find?url='+encodeURIComponent(url)+'&share='+($('#fshare').checked?'1':'0'),{headers:{accept:'application/json'}});
      let j=null; try{ j=await r.json(); }catch{}
      if(!j){ throw new Error('no-backend'); }
      if(!j.ok){
        if(['video_unavailable','rate_limited','internal','no_video'].includes(j.error)&&await browserFallback(url)) return;
        msg(j.message||'That did not work. Try another link.'); return;
      }
      showStatus(j.status); showLinks(j.links); showPreview(j.preview); showLibrary(j.library);
      const n=j.links.length;
      msg(n?`Found ${n} link${n>1?'s':''}. Scanned ${j.scanned.comments} comments and ${j.scanned.replies} replies.`
            :'No preset or Drive links were found. The creator may have shared the preset somewhere else, or TikTok hid the comments from the server. You can paste the text yourself below.');
      if(!n && j.status.comments&&j.status.comments.state==='failed') $('#fpd').open=true;
    }catch(e){
      if(await browserFallback(url)) return;
      msg('The finder backend is not reachable here. It only works on the deployed site (Cloudflare Pages with _worker.js). You can still paste text below.');
      $('#fpd').open=true;
    }finally{ b.disabled=false; b.textContent='Search'; }
  }
  $('#fgo').onclick=search;
  $('#fu').addEventListener('keydown',e=>{ if(e.key==='Enter') search(); });
  $('#fpaste').onclick=async()=>{ try{ $('#fu').value=(await navigator.clipboard.readText()).trim(); $('#fu').focus(); }catch{ msg('Your browser blocked clipboard access. Long-press the box and paste.'); } };
  $('#fex').onclick=()=>{
    const links=findLinks($('#ftx').value).map(l=>({...l,from:[{source:'paste'}]}));
    showStatus(null); showLinks(links); showPreview(null);
    msg(links.length?`Found ${links.length} link${links.length>1?'s':''} in your text.`:'No preset or Drive links in that text.');
  };
  $('#fcopyall').onclick=e=>copyText(current.join('\n'),e.currentTarget,'Copy all links');
})();
