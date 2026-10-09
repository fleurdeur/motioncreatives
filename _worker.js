// Shin's Archive: Cloudflare Pages worker.
// Serves the static site and one API route, GET /api/find?url=<tiktok link>.
// Everything runs on Cloudflare's free plan: no keys, no paid APIs, no storage.
// Deploy: put index.html and this _worker.js in one folder and upload that folder to Cloudflare Pages.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const TT_HOST = /^(?:www\.|m\.|vm\.|vt\.)?tiktok\.com$/i;
const MAX_SUBREQUESTS = 45;   // the free plan allows 50 outgoing requests per visit
const TIMEOUT_MS = 8000;
const MAX_BYTES = 3000000;
const MAX_COMMENT_PAGES = 6;  // 50 comments per page
const MAX_REPLY_THREADS = 25;
const CACHE_SHORT = 120;       // partial or rate-limited results are kept only briefly
const CACHE_SECONDS = 1800;   // repeat searches for the same video are answered from Cloudflare's cache, not TikTok
const MAX_IMG_BYTES = 4000000;
// Preview images are only ever fetched from TikTok's own image hosts.
const CDN_HOST = /(^|\.)(tiktokcdn(?:-us|-eu)?\.com|ibyteimg\.com|byteimg\.com)$/i;

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

class Fail extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});

// Counts every outgoing request so one visit can never go over the plan's limit.
function makeFetcher() {
  let left = MAX_SUBREQUESTS;
  const F = async (u, opt = {}) => {
    if (left <= 0) throw new Error('budget');
    left--;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(u, { ...opt, signal: ac.signal });
      if (r.status === 429) F.limited = true;
      return r;
    } finally { clearTimeout(timer); }
  };
  F.left = () => left;
  F.limited = false;
  return F;
}

async function readText(res, max = MAX_BYTES) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, max);
  const dec = new TextDecoder();
  let out = '', n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    out += dec.decode(value, { stream: true });
    if (n >= max) { await reader.cancel(); break; }
  }
  return out;
}

// Only public https pages are ever opened on behalf of a visitor.
function safeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.username || u.password) return null;
  u.protocol = 'https:';
  if (u.port && u.port !== '443') return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return null;
  return u;
}

// Returns a URL only when it points at one of TikTok's image hosts over https.
function cdnUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').replace(/^http:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  if (!CDN_HOST.test(u.hostname) || u.href.length > 2000) return null;
  return u;
}
const proxied = (raw) => { const u = cdnUrl(raw); return u ? '/api/thumb?u=' + encodeURIComponent(u.href) : ''; };

function parseTikTokUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > 300) throw new Fail('bad_url', 'Paste a TikTok video link.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Fail('bad_url', 'That does not look like a link.'); }
  if (u.username || u.password || !TT_HOST.test(u.hostname)) throw new Fail('bad_url', 'That is not a TikTok link.');
  u.protocol = 'https:'; u.port = ''; u.hash = '';
  return u;
}

// Follows short links (vm.tiktok.com, vt.tiktok.com, /t/...) but never leaves tiktok.com.
// If TikTok refuses the redirect, the public oEmbed endpoint (which accepts short links too) still gives the video id.
async function resolveVideo(F, start) {
  let u = start;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const m = u.pathname.match(/\/(?:video|photo)\/(\d{8,25})/);
      if (m) return { id: m[1], url: 'https://www.tiktok.com' + u.pathname };
      const res = await F(u.toString(), { redirect: 'manual', headers: { 'user-agent': UA } });
      const loc = res.headers.get('location');
      if (res.body && res.body.cancel) { try { await res.body.cancel(); } catch { /* ignore */ } }
      if (res.status >= 300 && res.status < 400 && loc) {
        let nu;
        try { nu = new URL(loc, u); } catch { throw new Fail('bad_redirect', 'That short link did not lead to a TikTok video.'); }
        if (nu.protocol !== 'https:' || !TT_HOST.test(nu.hostname)) throw new Fail('bad_redirect', 'That short link did not lead to a TikTok video.');
        u = nu;
        continue;
      }
      break;
    }
  } catch (e) {
    if (e instanceof Fail) throw e;
  }
  try {
    const j = await oembedJson(F, start.toString());
    const id = (/data-video-id="(\d{8,25})"/.exec(j.html || '') || /\/video\/(\d{8,25})/.exec(j.html || '') || [])[1];
    const handle = String(j.author_unique_id || '').replace(/[^\w.]/g, '');
    if (id) return { id, url: 'https://www.tiktok.com/@' + (handle || 'tiktok') + '/video/' + id };
  } catch { /* fall through */ }
  throw new Fail('no_video', 'Could not find a video in that link. Paste the link of a single video.');
}

function rehydrate(html) {
  const m = /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]).__DEFAULT_SCOPE__ || null; } catch { return null; }
}

const pageHeaders = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' };

const cookiesOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
const drop = async (res) => { try { await res.body.cancel(); } catch { /* ignore */ } };

function findKey(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return null;
  if (Object.prototype.hasOwnProperty.call(o, key) && o[key] && typeof o[key] === 'object') return o[key];
  for (const k of Object.keys(o)) { const r = findKey(o[k], key, depth + 1); if (r) return r; }
  return null;
}

// TikTok's public embed page carries the video data as JSON. The exact shape has changed over time, so this looks for either known shape.
function parseEmbed(html) {
  const tags = html.match(/<script[^>]*type="application\/json"[^>]*>[\s\S]*?<\/script>/g) || [];
  for (const tag of tags) {
    let j;
    try { j = JSON.parse(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')); } catch { continue; }
    const struct = findKey(j, 'itemStruct');
    if (struct && (struct.desc != null || struct.author)) return struct;
    const vd = findKey(j, 'videoData');
    if (vd && vd.itemInfos) {
      const it = vd.itemInfos, au = vd.authorInfos || {};
      return {
        id: it.id, desc: String(it.text || ''),
        author: { uniqueId: au.uniqueId || '', nickname: au.nickName || '', signature: au.signature || '' },
        video: { originCover: (it.covers || [])[0] || '', dynamicCover: (it.coversDynamic || [])[0] || '' },
      };
    }
  }
  return null;
}

// Tries several routes to the same video, stopping at the first that returns data.
// 1 desktop page, 2 mobile page, 3 public embed page. (oEmbed is the last resort, tried by the caller.)
async function loadVideo(F, videoUrl, id) {
  let limited = false, cookie = '';
  const pages = [['page', pageHeaders], ['mobile page', { ...pageHeaders, 'user-agent': UA_MOBILE }]];
  for (const [via, headers] of pages) {
    if (limited || F.left() < 12) break;
    try {
      const res = await F(videoUrl, { headers });
      if (res.status === 429) { limited = true; await drop(res); break; }
      if (!res.ok) { await drop(res); continue; }
      const ck = cookiesOf(res);
      const scope = rehydrate(await readText(res));
      const item = scope && scope['webapp.video-detail'] && scope['webapp.video-detail'].itemInfo && scope['webapp.video-detail'].itemInfo.itemStruct;
      if (item) return { item, cookie: ck, via };
      cookie = cookie || ck;
    } catch { /* try the next route */ }
  }
  if (id && F.left() > 8) {
    try {
      const res = await F('https://www.tiktok.com/embed/v2/' + id, { headers: pageHeaders });
      if (res.status === 429) { limited = true; await drop(res); }
      else if (res.ok) {
        const item = parseEmbed(await readText(res));
        if (item) return { item, cookie, via: 'embed page' };
      } else await drop(res);
    } catch { /* fall through */ }
  }
  if (limited) throw new Fail('rate_limited', 'TikTok is rate limiting this server right now. Wait a minute and try again.', 429);
  throw new Fail('video_unavailable', 'Could not read that video. It may be private or removed, or TikTok refused the request.', 502);
}

async function oembedJson(F, target) {
  const res = await F('https://www.tiktok.com/oembed?url=' + encodeURIComponent(target), { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) { await drop(res); throw new Error('oembed ' + res.status); }
  const j = JSON.parse(await readText(res, 200000));
  if (!j || typeof j !== 'object') throw new Error('oembed empty');
  return j;
}

// Last resort when every page is refused: the public oEmbed endpoint still returns the caption and cover.
async function loadOembed(F, videoUrl) {
  const j = await oembedJson(F, videoUrl);
  const fromUrl = (/\/@([\w.]{1,40})\//.exec(videoUrl) || [])[1] || '';
  if (typeof j.title !== 'string') throw new Error('oembed empty');
  return { desc: j.title, author: { uniqueId: String(j.author_unique_id || fromUrl) }, thumb: j.thumbnail_url || '', authorName: j.author_name || '' };
}

async function loadProfile(F, handle) {
  const res = await F('https://www.tiktok.com/@' + encodeURIComponent(handle), { headers: pageHeaders });
  if (!res.ok) throw new Error('profile ' + res.status);
  const scope = rehydrate(await readText(res));
  const user = scope && scope['webapp.user-detail'] && scope['webapp.user-detail'].userInfo && scope['webapp.user-detail'].userInfo.user;
  if (!user) throw new Error('profile unreadable');
  return user;
}

async function fetchComments(F, id, cookie, ref) {
  const list = [];
  let cursor = 0, note = '', ok = false;
  for (let page = 0; page < MAX_COMMENT_PAGES; page++) {
    const u = 'https://www.tiktok.com/api/comment/list/?aid=1988&aweme_id=' + id + '&count=50&cursor=' + cursor;
    const res = await F(u, { headers: { 'user-agent': UA, referer: ref, accept: 'application/json', ...(cookie ? { cookie } : {}) } });
    if (res.status === 429) { note = 'TikTok is rate limiting this server right now. Wait a minute and try again.'; break; }
    let j = null;
    try { j = JSON.parse(await readText(res, 1500000)); } catch { /* blocked or empty */ }
    if (!j || !Array.isArray(j.comments)) {
      if (page === 0) note = 'TikTok did not return comments to the server (it often blocks automated requests).';
      break;
    }
    ok = true;
    list.push(...j.comments);
    if (!j.has_more || F.left() < 8) break;
    cursor = Number(j.cursor) || cursor + 50;
  }
  if (ok && !list.length) note = 'This video has no comments.';
  return { list, ok, note };
}

async function fetchReplies(F, id, cookie, ref, threads) {
  const out = [];
  const queue = threads.slice(0, MAX_REPLY_THREADS);
  while (queue.length && F.left() > 1 && !F.limited) {
    const batch = queue.splice(0, Math.min(5, F.left() - 1));
    const got = await Promise.all(batch.map(async (c) => {
      try {
        const u = 'https://www.tiktok.com/api/comment/list/reply/?aid=1988&item_id=' + id + '&comment_id=' + encodeURIComponent(c.cid) + '&count=50&cursor=0';
        const res = await F(u, { headers: { 'user-agent': UA, referer: ref, accept: 'application/json', ...(cookie ? { cookie } : {}) } });
        const j = JSON.parse(await readText(res, 1500000));
        return Array.isArray(j.comments) ? j.comments : [];
      } catch { return []; }
    }));
    got.forEach((g) => out.push(...g));
  }
  return out;
}

const handleName = (x) => (x ? String(x).replace(/[^\w.]/g, '').slice(0, 40) : '');

async function scan(F, id, videoUrl) {
  const hits = new Map();
  const add = (text, source, by) => {
    for (const link of findLinks(text)) {
      let m = hits.get(link.url);
      if (!m) hits.set(link.url, (m = { link, srcs: new Map() }));
      else {
        if (!m.link.num && link.num) m.link.num = link.num;
        if (m.link.kind === 'drive' && link.kind === 'xml') m.link.kind = 'xml';
      }
      const key = source + '|' + (by || '');
      if (!m.srcs.has(key)) m.srcs.set(key, by ? { source, by } : { source });
    }
  };
  const status = {};
  let item, cookie = '', via = '';
  try {
    ({ item, cookie, via } = await loadVideo(F, videoUrl, id));
  } catch (e) {
    try { item = await loadOembed(F, videoUrl); via = 'oembed'; } catch { throw e; }
  }
  const author = item.author && typeof item.author === 'object' ? item.author : {};
  const handle = /^[\w.]{1,40}$/.test(author.uniqueId || '') ? author.uniqueId : '';

  // Preview: a cover image (animated when TikTok provides one) plus caption and author. No player is ever loaded.
  const v = item.video && typeof item.video === 'object' ? item.video : {};
  const animated = v.dynamicCover || '';
  let still = v.originCover || v.cover || item.thumb || '';
  let authorName = author.nickname || item.authorName || '';
  if (!cdnUrl(animated) && !cdnUrl(still) && via !== 'oembed' && F.left() > 12 && !F.limited) {
    try { const e = await loadOembed(F, videoUrl); still = e.thumb; authorName = authorName || e.authorName; } catch { /* no cover available */ }
  }
  const preview = {
    videoUrl: handle ? 'https://www.tiktok.com/@' + handle + '/video/' + id : '',
    caption: String(item.desc || '').slice(0, 300),
    author: handle,
    name: String(authorName || '').slice(0, 60),
    image: proxied(animated) || proxied(still),
    still: proxied(still),
  };

  add(item.desc, 'caption');
  const VIA = { 'mobile page': 'the mobile page', 'embed page': 'the public embed page', oembed: 'its public embed data' };
  status.video = via === 'page' ? { state: 'ok' } : { state: 'partial', note: 'TikTok refused the main request, so the video was read through ' + VIA[via] + '.' };
  status.caption = via === 'oembed' ? { state: 'partial', note: 'TikTok refused the video page, so the caption came from its public embed data.' } : { state: 'ok' };

  let bio = author.signature || '', bioLink = '';
  if (handle) {
    try {
      const u = await loadProfile(F, handle);
      bio = u.signature || bio;
      bioLink = (u.bioLink && u.bioLink.link) || '';
      status.bio = { state: 'ok' };
    } catch {
      status.bio = { state: 'partial', note: 'The profile page was not readable, so only the bio that came with the video was checked.' };
    }
  } else {
    status.bio = { state: 'failed', note: 'Could not tell who posted the video.' };
  }
  add(bio, 'bio');

  if (!bioLink) {
    status.biolink = { state: 'skipped', note: 'No link in bio.' };
  } else if (amLinks(bioLink).length) {
    add(bioLink, 'biolink');
    status.biolink = { state: 'ok' };
  } else {
    const su = safeUrl(bioLink);
    if (!su) {
      status.biolink = { state: 'skipped', note: 'The link in bio was not a public https page.' };
    } else {
      try {
        const r = await F(su.toString(), { headers: pageHeaders });
        add(await readText(r), 'biolink');
        status.biolink = r.ok ? { state: 'ok' } : { state: 'failed', note: 'The link in bio answered ' + r.status + '.' };
      } catch {
        status.biolink = { state: 'failed', note: 'Could not open the link in bio.' };
      }
    }
  }

  const scanned = { comments: 0, replies: 0 };
  let c = { list: [], ok: false, note: 'Comments could not be loaded.' };
  try { c = await fetchComments(F, id, cookie, videoUrl); } catch { /* keep default */ }
  const seenReply = new Set();
  const addReply = (r) => {
    const key = r.cid || r.text;
    if (seenReply.has(key)) return;
    seenReply.add(key);
    scanned.replies++;
    add(r.text, 'reply', handleName(r.user && r.user.unique_id));
  };
  for (const cm of c.list) {
    scanned.comments++;
    add(cm.text, 'comment', handleName(cm.user && cm.user.unique_id));
    for (const r of cm.reply_comment || []) addReply(r);
  }
  status.comments = c.ok ? (c.note ? { state: 'ok', note: c.note } : { state: 'ok' }) : { state: 'failed', note: c.note };

  if (c.ok) {
    const threads = c.list.filter((cm) => cm.cid && Number(cm.reply_comment_total) > 0).sort((a, b) => b.reply_comment_total - a.reply_comment_total);
    if (threads.length) {
      try {
        for (const r of await fetchReplies(F, id, cookie, videoUrl, threads)) addReply(r);
        status.replies = F.limited ? { state: 'partial', note: 'TikTok started rate limiting, so some replies were skipped.' } : { state: 'ok' };
      } catch {
        status.replies = { state: 'failed', note: 'Replies could not be loaded.' };
      }
    } else {
      status.replies = { state: 'ok', note: 'No replies.' };
    }
  } else {
    status.replies = { state: 'skipped', note: 'Skipped because comments were not available.' };
  }

  const rank = (m) => ([...m.srcs.values()].some((s) => s.source !== 'comment' && s.source !== 'reply') ? 1000 : 0) + m.srcs.size + (m.link.kind === 'preset' ? 5000 : m.link.kind === 'xml' ? 2500 : 0);
  const links = [...hits.entries()]
    .sort((a, b) => rank(b[1]) - rank(a[1]))
    .map(([url, m]) => ({ url, kind: m.link.kind, num: m.link.num || 0, ...(m.link.dl ? { dl: m.link.dl } : {}), from: [...m.srcs.values()] }));
  return { videoId: id, author: handle, links, status, scanned, preview };
}

async function readBytes(res, max) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) { const b = new Uint8Array(await res.arrayBuffer()); return b.length > max ? null : b; }
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Serves a preview image from TikTok's image hosts through this site: no hotlinking, no expiring links, cached at the edge.
async function handleThumb(request, url, ctx) {
  const plain = (msg, status) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (request.method !== 'GET') return plain('Use GET.', 405);
  let cur = cdnUrl(url.searchParams.get('u'));
  if (!cur) return plain('Not allowed.', 400);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }
  try {
    const F = makeFetcher();
    for (let hop = 0; hop < 3; hop++) {
      const res = await F(cur.toString(), { redirect: 'manual', headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        try { await res.body.cancel(); } catch { /* ignore */ }
        let next = null;
        try { next = cdnUrl(new URL(loc, cur).href); } catch { /* bad location */ }
        if (!next) return plain('Image unavailable.', 502);
        cur = next;
        continue;
      }
      if (!res.ok) return plain('Image unavailable.', 502);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return plain('Not an image.', 415);
      if (Number(res.headers.get('content-length')) > MAX_IMG_BYTES) return plain('Image too large.', 413);
      const bytes = await readBytes(res, MAX_IMG_BYTES);
      if (!bytes) return plain('Image too large.', 413);
      const out = new Response(bytes, { status: 200, headers: {
        'content-type': type,
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': "default-src 'none'; sandbox",
      } });
      if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(request, out.clone()));
      return out;
    }
    return plain('Image unavailable.', 502);
  } catch {
    return plain('Image unavailable.', 502);
  }
}

async function handleFind(request, url, ctx) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method', message: 'Use GET.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'origin', message: 'Not allowed.' }, 403);
  try {
    const F = makeFetcher();
    const input = parseTikTokUrl(url.searchParams.get('url'));
    const { id, url: videoUrl } = await resolveVideo(F, input);

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(url.origin + '/__finder/' + id);
    if (cache) {
      const hit = await cache.match(key);
      if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-cache': 'hit' } });
    }
    const data = await scan(F, id, videoUrl);
    const body = JSON.stringify({ ok: true, ...data });
    const st = data.status || {};
    const complete = st.video && st.video.state === 'ok' && st.comments && st.comments.state === 'ok' && !F.limited;
    if (cache && ctx && ctx.waitUntil) {
      ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + (complete ? CACHE_SECONDS : CACHE_SHORT) } })));
    }
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof Fail) return json({ ok: false, error: e.code, message: e.message }, e.status);
    return json({ ok: false, error: 'internal', message: 'Something went wrong while scanning that video.' }, 500);
  }
}

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/thumb') {
      const r = await handleThumb(request, url, ctx);
      const out = new Response(r.body, r);
      out.headers.set('x-content-type-options', 'nosniff');
      return out;
    }
    if (url.pathname === '/api/find') {
      const r = await handleFind(request, url, ctx);
      const out = new Response(r.body, r);
      out.headers.set('x-content-type-options', 'nosniff');
      return out;
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};
