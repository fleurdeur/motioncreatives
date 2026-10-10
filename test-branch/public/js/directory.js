// Preset Library page: browse, save, submit, report, premium and admin tools.
const $=s=>document.querySelector(s);
const h=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==='class')e.className=v;else if(x.startsWith('on'))e[x]=v;else if(v!==false&&v!=null)e.setAttribute(x,v===true?'':v)}e.append(...k.flat().filter(x=>x!=null&&x!==false));return e};
async function api(path,body){try{const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);return await r.json()}catch{return{ok:false,message:'Network error. Try again.'}}}
const S={me:null,cat:'',q:'',saved:false,page:0};
const dlg=$('#dlg');
function openDlg(title,...kids){dlg.replaceChildren(h('h2',{},title),...kids,h('div',{class:'row'},h('button',{class:'chip',type:'button',onclick:()=>dlg.close()},'Close')));if(!dlg.open)dlg.showModal()}
const note=(t,upg)=>{const n=$('#note');n.hidden=!t;n.replaceChildren(t||'');if(t&&upg){n.append(' ',h('button',{class:'chip',onclick:premiumDlg},'Go Premium'))}};
async function loadMe(){
  S.me=await api('/api/me');const u=S.me.user,a=$('#acct');a.replaceChildren();
  if(!u){a.append(S.me.signin?h('a',{class:'btn',href:'/api/auth/google'},'Sign in with Google'):h('span',{class:'sub'},'Sign-in not set up yet'));return}
  a.append(h('span',{class:'sub',style:'margin:0 10px 0 0'},u.name+(u.premium?' · Premium':' · Free')));
  if(u.admin)a.append(h('button',{class:'chip',onclick:adminDlg},'Admin'),' ');
  if(!u.premium)a.append(h('button',{class:'btn',onclick:premiumDlg},'Go Premium'),' ');
  a.append(h('button',{class:'chip',onclick:async()=>{await api('/api/auth/logout',{});location.href='/directory.html'}},'Sign out'));
}
function chips(){const c=$('#chips');c.replaceChildren();const all=[['','All'],...Object.entries(S.me.cats)];
  for(const[k,v]of all)c.append(h('button',{class:'chip'+(S.cat===k?' on':''),'aria-pressed':S.cat===k,onclick:()=>{S.cat=k;chips();load(true)}},v))}
function needLogin(){openDlg('Sign in',h('p',{class:'sub'},'Sign in with Google to save, submit and report presets.'),S.me.signin?h('a',{class:'btn',href:'/api/auth/google'},'Continue with Google'):h('p',{},'Sign-in is not set up yet.'))}
function card(l){
  let host='';try{host=new URL(l.link).hostname.replace(/^www\./,'')}catch{}
  const save=h('button',{class:'chip'+(l.saved?' on':''),'aria-pressed':!!l.saved,onclick:async()=>{
    if(!S.me.user)return needLogin();const j=await api('/api/save',{id:l.id,on:!l.saved});
    if(!j.ok){note(j.message,j.upgrade);return}l.saved=!l.saved;save.classList.toggle('on',l.saved);save.setAttribute('aria-pressed',l.saved);save.textContent=l.saved?'Saved':'Save'}},l.saved?'Saved':'Save');
  return h('article',{class:'c'},h('small',{},S.me.cats[l.category]||l.category),l.fresh?h('span',{class:'new'},'New: early access'):null,h('h3',{},l.title),
    h('p',{class:'by'},'by '+l.creator),l.description?h('p',{},l.description):null,
    h('div',{class:'row'},h('a',{class:'btn',href:l.link,target:'_blank',rel:'noopener noreferrer'},'Open on '+host),save,h('button',{class:'chip',onclick:()=>reportDlg(l)},'Report')))}
// Early access for free accounts: a blurred card per new preset. The server only sends the category and when it opens up,
// so the title, creator and link behind the blur are made-up filler, not the real entry.
const FILLER=[['Smooth glow effect','by a creator','A short description of the preset sits here until early access ends.'],['Clean shake pack','by a creator','Preview details unlock for everyone once the early access window closes.'],['Fast panning preset','by a creator','Premium members get first look at every new preset in the library.'],['Soft text reveal','by a creator','The full entry and its link are hidden during early access.']];
const lockIcon=()=>{const s=document.createElement('span');s.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/></svg>';return s.firstChild};
function opensIn(ts){const s=Math.max(0,ts-Math.floor(Date.now()/1000));if(s<90)return'a few minutes';return s>=3600?'about '+Math.ceil(s/3600)+' hour'+(Math.ceil(s/3600)>1?'s':''):Math.ceil(s/60)+' minutes'}
function lockedCard(t,i){
  const f=FILLER[i%FILLER.length];
  return h('article',{class:'c locked','aria-label':'Early access preset, locked'},
    h('div',{class:'blur','aria-hidden':'true'},h('small',{},S.me.cats[t.category]||t.category),h('span',{class:'new'},'New: early access'),h('h3',{},f[0]),h('p',{class:'by'},f[1]),h('p',{},f[2]),
      h('div',{class:'row'},h('span',{class:'fake solid'},'Open preset'),h('span',{class:'fake'},'Save'),h('span',{class:'fake'},'Report'))),
    h('div',{class:'lock'},lockIcon(),h('b',{},'Early access'),h('span',{},'Opens to everyone in '+opensIn(t.opens)),h('button',{class:'btn',onclick:premiumDlg},'Unlock with Premium')))}

async function load(reset){
  if(reset){S.page=0;$('#grid').replaceChildren()}
  const p=new URLSearchParams({page:S.page});if(S.cat)p.set('cat',S.cat);if(S.q)p.set('q',S.q);if(S.saved)p.set('saved','1');
  const j=await api('/api/listings?'+p);if(!j.ok){note(j.message);return}
  if(S.page===0){const u=S.me.user;note(j.locked>0?j.locked+' new '+(j.locked>1?'presets are':'preset is')+' in '+S.me.earlyHours+'-hour early access for Premium members.':'',j.locked>0&&!(u&&u.premium))}
  if(S.page===0&&j.teasers)j.teasers.forEach((x,i)=>$('#grid').append(lockedCard(x,i)));
  j.items.forEach(l=>$('#grid').append(card(l)));
  $('#more').hidden=!j.more;$('#empty').hidden=!!$('#grid').children.length;
}
$('#more').onclick=()=>{S.page++;load(false)};
let tm;$('#q').addEventListener('input',e=>{clearTimeout(tm);tm=setTimeout(()=>{S.q=e.target.value.trim();load(true)},300)});
$('#sv').onclick=()=>{if(!S.me.user)return needLogin();S.saved=!S.saved;$('#sv').classList.toggle('on',S.saved);load(true)};
$('#add').onclick=()=>{
  if(!S.me.user)return needLogin();
  const f={title:h('input',{maxlength:80,required:true}),creator:h('input',{maxlength:40,required:true,placeholder:'Who made it?'}),category:h('select',{},...Object.entries(S.me.cats).map(([k,v])=>h('option',{value:k},v))),
    link:h('input',{type:'url',required:true,placeholder:'https://...'}),description:h('textarea',{maxlength:240,rows:3}),mine:h('input',{type:'checkbox'})};
  const msg=h('div',{class:'msg',role:'status'});
  openDlg('Submit a preset',h('p',{class:'sub'},'Link to the creator\'s own post. Links from TikTok, YouTube, Google Drive and Alight Motion are accepted. Every entry is reviewed first.'),
    h('label',{},'Title',f.title),h('label',{},'Creator (credit them)',f.creator),h('label',{},'Category',f.category),h('label',{},'Link',f.link),h('label',{},'Short description (optional)',f.description),
    h('label',{class:'chk'},f.mine,'I am the creator of this preset'),msg,
    h('button',{class:'btn',onclick:async e=>{e.target.disabled=true;const j=await api('/api/listings',{title:f.title.value,creator:f.creator.value,category:f.category.value,link:f.link.value,description:f.description.value,byCreator:f.mine.checked});msg.textContent=j.message||'';e.target.disabled=false;if(j.ok)e.target.hidden=true}},'Submit'))};
function reportDlg(l){const r=h('textarea',{maxlength:300,rows:3}),c=h('input',{maxlength:100,placeholder:'Your email (optional)'}),msg=h('div',{class:'msg',role:'status'});
  openDlg('Report or remove',h('p',{class:'sub'},l.title+' by '+l.creator),h('label',{},'What is wrong? Creators can ask for removal here.',r),h('label',{},'Contact',c),msg,
    h('button',{class:'btn',onclick:async e=>{e.target.disabled=true;const j=await api('/api/report',{id:l.id,reason:r.value,contact:c.value});msg.textContent=j.message||'';e.target.disabled=false}},'Send'))}
function premiumDlg(){
  if(!S.me.user)return needLogin();const m=S.me,msg=h('div',{class:'msg',role:'status'});
  openDlg('Premium',h('p',{class:'sub'},'₱'+m.price+' for '+m.days+' days, paid with GCash. Premium gives you unlimited saves and '+m.earlyHours+'-hour early access to new presets. Free accounts keep full access to everything else, with up to '+m.freeSaves+' saves.'),msg,
    h('button',{class:'btn',onclick:async e=>{e.target.disabled=true;const j=await api('/api/premium/checkout',{});if(j.ok){location.href=j.url;return}msg.textContent=j.message;e.target.disabled=false}},'Pay ₱'+m.price+' with GCash'))}

async function adminDlg(){
  const j=await api('/api/admin/queue');
  if(!j.ok){
    openDlg('Admin',h('p',{},j.message||'Access denied'));
    return;
  }
  if(!j.pending)j.pending=[];
  if(!j.reports)j.reports=[];
  const act=(id,action,el,extra)=>async()=>{const r=await api('/api/admin/review',{id,action,...(extra?extra():{})});if(r.ok){el.remove();if($('#grid').children.length===0)load(true)}else{el.append(h('p',{class:'msg'},r.message||'Failed'))}};
  const els=[h('h3',{},'Waiting for review ('+j.pending.length+')')];
  for(const l of j.pending){
    const cat=h('select',{'aria-label':'Category'},...Object.entries(S.me.cats||{}).map(([k,v])=>h('option',{value:k,selected:k===(l.category||'')},v)));
    const fromFinder=!!(l&&l.source==='finder');
    const el=h('div',{class:'it'},fromFinder?h('span',{class:'tagf'},'Found by the Preset Finder'):null,h('b',{},l.title||'Untitled'),h('p',{},(l.creator||'Unknown')+' · '+(fromFinder?'category guessed':'sent by '+(l.email||'unknown'))),h('a',{href:l.link||'#',target:'_blank',rel:'noopener noreferrer'},l.link||'No link'),fromFinder&&l.source_url&&/^https:\/\/www\.tiktok\.com\//.test(l.source_url)?h('a',{href:l.source_url,target:'_blank',rel:'noopener noreferrer'},'Source TikTok video'):null,l.description?h('p',{},l.description):null,h('label',{},'Category',cat));
    el.append(h('div',{class:'row'},h('button',{class:'btn',onclick:act(l.id,'approve',el,()=>({category:cat.value}))},'Approve'),h('button',{class:'chip',onclick:act(l.id,'reject',el)},'Reject')));
    els.push(el);
  }
  els.push(h('h3',{},'Reports ('+j.reports.length+')'));
  for(const r of j.reports){const el=h('div',{class:'it'},h('b',{},r.title||'Untitled'),h('p',{},(r.reason||'No reason given')+(r.contact?' · '+r.contact:'')),h('a',{href:r.link||'#',target:'_blank',rel:'noopener noreferrer'},r.link||'No link'));
    el.append(h('div',{class:'row'},h('button',{class:'btn',onclick:act(r.listing_id,'remove',el)},'Remove listing'),h('button',{class:'chip',onclick:act(r.listing_id,'keep',el)},'Keep')));
    els.push(el);
  }
  const em=h('input',{type:'email',placeholder:'their@gmail.com'}),dy=h('input',{type:'number',value:30,min:1,max:366}),msg=h('div',{class:'msg'});
  els.push(h('h3',{},'Give Premium (manual GCash)'),h('label',{},'Email (they must have signed in once)',em),h('label',{},'Days',dy),msg,h('button',{class:'btn',onclick:async()=>{const r=await api('/api/admin/premium',{email:em.value,days:Number(dy.value)});msg.textContent=r.message||'';if(r.ok){em.value='';dy.value='30'}}},'Add Premium'));
  openDlg('Admin',...els);
}

(async()=>{
  await loadMe();
  chips();
  await load(true);
  const q=new URLSearchParams(location.search);
  if(q.get('paid')){
    note('Payment received. Premium switches on within a minute. Refresh to check.');
    setTimeout(async()=>{await loadMe()},5000);
  }
  if(q.get('login')==='failed')note('Sign-in did not work. Please try again.');
})();