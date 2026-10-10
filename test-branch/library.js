// Preset Library API: D1 database, Google sign-in, listings, saves, moderation, GCash premium via PayMongo.
// Listings are links only. Files stay with their creators.
export const CATS = { effects: 'Effects', panning: 'Panning', shakes: 'Shakes', text: 'Text', watermarks: 'Watermarks', transitions: 'Transitions', packs: 'Packs' };
const HOSTS = /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|drive\.google\.com|alight\.link|alightcreative\.com|alightmotion\.com|alightmotion\.page\.link|alightcreative\.page\.link)$/i;
const PRICE_PHP = 99, PREMIUM_DAYS = 30, FREE_SAVES = 5, EARLY_HOURS = 24, PAGE = 24, SESSION_DAYS = 30, TEASERS = 6, FINDER_QUEUE_MAX = 300;

class Bad extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const enc = new TextEncoder();
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });
const fail = (s, m) => json({ ok: false, message: m, ...(s === 402 ? { upgrade: true } : {}) }, s);
const now = () => Math.floor(Date.now() / 1000);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const getCookie = (req, name) => { for (const c of (req.headers.get('cookie') || '').split(/;\s*/)) if (c.startsWith(name + '=')) return c.slice(name.length + 1); return ''; };
const ck = (name, val, max) => name + '=' + val + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + max;
const same = (a, b) => { if (typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const str = (v, min, max) => { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); return s.length >= min && s.length <= max ? s : null; };
export function cleanLink(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !HOSTS.test(u.hostname)) return null;
    u.hash = '';
    return u.href.length <= 300 ? u.href : null;
  } catch { return null; }
}
// ---- Preset Finder -> Preset Library -------------------------------------------------------------
// Alight Motion preset links and Drive XML files the finder turns up are queued as PENDING listings.
// Nothing is public until an admin approves it. The data comes from our own scan, never from the browser.
const CAT_WORDS = [['shakes', /shake/i], ['transitions', /transition/i], ['panning', /\bpan(ning)?\b/i], ['watermarks', /watermark/i], ['text', /\b(text|typography|font)\b/i], ['packs', /\bpack\b/i]];
const guessCat = (s) => { for (const [k, re] of CAT_WORDS) if (re.test(s)) return k; return 'effects'; };
function finderTitle(caption, handle, n) {
  const base = String(caption || '').replace(/https?:\/\/\S+/gi, ' ').replace(/[#@][\w.]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 56).trim();
  const t = base.length >= 3 ? base : 'Preset from ' + (handle ? '@' + handle : 'TikTok');
  return (n ? t.slice(0, 70) + ' ' + n : t).slice(0, 80);
}
export async function suggestFromFinder(env, data) {
  try {
    if (!env.DB || !data || !Array.isArray(data.links)) return null;
    const found = data.links.filter((l) => l && (l.kind === 'preset' || l.kind === 'xml')).slice(0, 10);
    if (!found.length) return { added: 0, known: 0 };
    const queued = (await env.DB.prepare("SELECT COUNT(*) n FROM listings WHERE status='pending' AND source='finder'").first()).n;
    if (queued >= FINDER_QUEUE_MAX) return { added: 0, known: 0 };
    const handle = /^[\w.]{1,40}$/.test(data.author || '') ? data.author : '';
    const pv = data.preview || {};
    const videoUrl = /^https:\/\/www\.tiktok\.com\/@[\w.]{1,40}\/video\/\d{8,25}$/.test(pv.videoUrl || '') ? pv.videoUrl : '';
    const cat = guessCat(pv.caption || '');
    let added = 0, known = 0;
    for (let i = 0; i < found.length; i++) {
      const link = cleanLink(found[i].url);
      if (!link) continue;
      const r = await env.DB.prepare("INSERT OR IGNORE INTO listings(user_id,title,category,description,link,creator,by_creator,status,source,source_url,created_at) VALUES(0,?1,?2,?3,?4,?5,0,'pending','finder',?6,?7)")
        .bind(finderTitle(pv.caption, handle, found.length > 1 ? (found[i].num || i + 1) : 0), cat, 'Found with the Preset Finder.', link, handle ? '@' + handle : 'Unknown', videoUrl, now()).run();
      if (r.meta.changes === 1) added++; else known++;
    }
    return { added, known };
  } catch (e) { console.error('finder share error', e && e.message); return null; }
}

async function body(request) {
  const t = await request.text();
  if (t.length > 4000) throw new Bad('Too much data.');
  try { const j = JSON.parse(t); return j && typeof j === 'object' ? j : {}; } catch { throw new Bad('Bad request.'); }
}
const jwtPayload = (jwt) => {
  try { const s = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0)))); } catch { return null; }
};

async function getUser(env, req) {
  const t = getCookie(req, '__Host-sid');
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  const r = await env.DB.prepare('SELECT u.id,u.email,u.name,u.premium_until,u.is_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?1 AND s.expires_at>?2').bind(await sha256(t), now()).first();
  return r ? { ...r, premium: r.premium_until > now() || !!r.is_admin } : null;
}

function gStart(env, url) {
  if (!env.GOOGLE_CLIENT_ID) return fail(501, 'Sign-in is not set up yet.');
  const state = rand(16);
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, 'set-cookie': ck('__Host-oas', state, 600), 'cache-control': 'no-store' } });
}

async function gCallback(request, env, url) {
  const back = (q) => new Response(null, { status: 302, headers: { location: '/directory.html' + q, 'cache-control': 'no-store' } });
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !code || !state || state !== getCookie(request, '__Host-oas')) return back('?login=failed');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + '/api/auth/google/callback', grant_type: 'authorization_code' }) });
  const t = await r.json().catch(() => null);
  const c = t && t.id_token ? jwtPayload(t.id_token) : null;
  if (!r.ok || !c || c.aud !== env.GOOGLE_CLIENT_ID || !/^(https:\/\/)?accounts\.google\.com$/.test(c.iss || '') || !(c.exp > now()) || !c.email_verified || !c.sub || !c.email) return back('?login=failed');
  const email = String(c.email).toLowerCase();
  const admin = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).includes(email) ? 1 : 0;
  const name = String(c.name || email.split('@')[0]).slice(0, 60);
  await env.DB.prepare('INSERT INTO users(google_sub,email,name,is_admin,created_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(google_sub) DO UPDATE SET email=?2,name=?3,is_admin=?4').bind(String(c.sub), email, name, admin, now()).run();
  const u = await env.DB.prepare('SELECT id FROM users WHERE google_sub=?1').bind(String(c.sub)).first();
  const token = rand(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?1').bind(now()),
    env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(await sha256(token), u.id, now() + SESSION_DAYS * 86400),
  ]);
  const h = new Headers({ location: '/directory.html', 'cache-control': 'no-store' });
  h.append('set-cookie', ck('__Host-sid', token, SESSION_DAYS * 86400));
  h.append('set-cookie', ck('__Host-oas', '', 0));
  return new Response(null, { status: 302, headers: h });
}

async function checkout(env, url, user) {
  if (!env.PAYMONGO_SECRET) return fail(501, 'Online payment is not switched on yet.');
  const attrs = { line_items: [{ name: "Shin's Archive Premium (" + PREMIUM_DAYS + ' days)', quantity: 1, amount: PRICE_PHP * 100, currency: 'PHP' }], payment_method_types: ['gcash'], success_url: url.origin + '/directory.html?paid=1', cancel_url: url.origin + '/directory.html', description: 'Premium for ' + user.email, metadata: { user_id: String(user.id) } };
  const r = await fetch('https://api.paymongo.com/v1/checkout_sessions', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Basic ' + btoa(env.PAYMONGO_SECRET + ':') }, body: JSON.stringify({ data: { attributes: attrs } }) });
  const j = await r.json().catch(() => null);
  const link = j && j.data && j.data.attributes && j.data.attributes.checkout_url;
  if (!r.ok || !link) return fail(502, 'Could not start the payment. Try again later.');
  return json({ ok: true, url: link });
}

// PayMongo signs "<timestamp>.<raw body>" with HMAC-SHA256: header Paymongo-Signature: t=...,te=...(test),li=...(live)
async function webhook(request, env) {
  const raw = await request.text();
  if (!env.PAYMONGO_WEBHOOK_SECRET) return fail(501, 'Webhook secret is not set.');
  const parts = {};
  for (const s of (request.headers.get('paymongo-signature') || '').split(',')) { const i = s.indexOf('='); if (i > 0) parts[s.slice(0, i).trim()] = s.slice(i + 1).trim(); }
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PAYMONGO_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(parts.t + '.' + raw)));
  const live = String(env.PAYMONGO_SECRET || '').startsWith('sk_live');
  if (!parts.t || !same(mac, live ? parts.li : parts.te)) return fail(400, 'Bad signature.');
  let ev; try { ev = JSON.parse(raw); } catch { return fail(400, 'Bad body.'); }
  const a = ev && ev.data && ev.data.attributes;
  if (!a || a.type !== 'checkout_session.payment.paid') return json({ ok: true });
  const cs = a.data || {}, uid = Number(cs.attributes && cs.attributes.metadata && cs.attributes.metadata.user_id), ref = String(cs.id || '');
  if (!uid || !ref) return json({ ok: true });
  const r = await env.DB.prepare('INSERT OR IGNORE INTO payments(provider_ref,user_id,created_at) VALUES(?1,?2,?3)').bind(ref, uid, now()).run();
  if (r.meta.changes === 1) await env.DB.prepare('UPDATE users SET premium_until=MAX(?1,premium_until)+?2 WHERE id=?3').bind(now(), PREMIUM_DAYS * 86400, uid).run();
  return json({ ok: true });
}

export async function handleLibrary(request, env, url) {
  const p = url.pathname, m = request.method;
  if (!env.DB) return fail(501, 'The library database is not connected yet.');
  try {
    if (p === '/api/webhooks/paymongo') return m === 'POST' ? await webhook(request, env) : fail(405, 'Use POST.');
    if (p === '/api/auth/google') return gStart(env, url);
    if (p === '/api/auth/google/callback') return await gCallback(request, env, url);
    if (m !== 'GET' && request.headers.get('origin') !== url.origin) return fail(403, 'Not allowed.');
    const user = await getUser(env, request);
    const need = () => { if (!user) throw new Bad('Sign in first.', 401); return user; };
    const admin = () => { if (!user || !user.is_admin) throw new Bad('Not allowed.', 403); return user; };
    const DB = env.DB;

    if (p === '/api/me' && m === 'GET') {
      const saves = user ? (await DB.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id=?1').bind(user.id).first()).n : 0;
      return json({ ok: true, user: user && { name: user.name, email: user.email, premium: user.premium, until: user.premium_until, admin: !!user.is_admin, saves }, cats: CATS, price: PRICE_PHP, days: PREMIUM_DAYS, freeSaves: FREE_SAVES, earlyHours: EARLY_HOURS, pay: !!env.PAYMONGO_SECRET, signin: !!env.GOOGLE_CLIENT_ID });
    }

    if (p === '/api/listings' && m === 'GET') {
      const sp = url.searchParams, cat = sp.get('cat') || '', q = (sp.get('q') || '').trim().slice(0, 60), page = Math.max(0, Math.min(500, parseInt(sp.get('page'), 10) || 0));
      const savedOnly = sp.get('saved') === '1';
      if (savedOnly) need();
      const cutoff = now() - EARLY_HOURS * 3600, premium = !!(user && user.premium);
      const where = ["l.status='approved'"], args = [];
      if (cat) { if (!CATS[cat]) throw new Bad('Unknown category.'); where.push('l.category=?'); args.push(cat); }
      if (q) { const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; where.push("(l.title LIKE ? ESCAPE '\\' OR l.creator LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')"); args.push(like, like, like); }
      if (!premium) { where.push('l.approved_at<=?'); args.push(cutoff); }
      if (savedOnly) where.push('f.user_id IS NOT NULL');
      const rows = (await DB.prepare('SELECT l.id,l.title,l.category,l.description,l.link,l.creator,l.approved_at, (f.user_id IS NOT NULL) AS saved, (l.approved_at>?) AS fresh FROM listings l LEFT JOIN favorites f ON f.listing_id=l.id AND f.user_id=? WHERE ' + where.join(' AND ') + ' ORDER BY l.approved_at DESC LIMIT ? OFFSET ?').bind(cutoff, user ? user.id : 0, ...args, PAGE + 1, page * PAGE).all()).results;
      const out = { ok: true, items: rows.slice(0, PAGE).map((r) => ({ ...r, saved: !!r.saved, fresh: !!r.fresh })), more: rows.length > PAGE };
      if (!premium && page === 0) {
        out.locked = (await DB.prepare("SELECT COUNT(*) n FROM listings WHERE status='approved' AND approved_at>?1").bind(cutoff).first()).n;
        // Blurred previews: only the category and the unlock time leave the server. The page draws made-up filler behind the blur.
        if (out.locked && !q && !savedOnly) {
          const t = (await DB.prepare("SELECT category, approved_at FROM listings WHERE status='approved' AND approved_at>?" + (cat ? ' AND category=?' : '') + ' ORDER BY approved_at DESC LIMIT ?').bind(cutoff, ...(cat ? [cat] : []), TEASERS).all()).results;
          out.teasers = t.map((r) => ({ category: r.category, opens: r.approved_at + EARLY_HOURS * 3600 }));
        }
      }
      return json(out);
    }

    if (p === '/api/listings' && m === 'POST') {
      const u = need(), b = await body(request);
      const title = str(b.title, 3, 80), creator = str(b.creator, 2, 40), desc = str(b.description || '', 0, 240), link = cleanLink(b.link);
      if (!title || !creator) throw new Bad('Add a title (3 to 80 characters) and the creator\'s name.');
      if (!CATS[b.category]) throw new Bad('Pick a category.');
      if (desc === null) throw new Bad('The description is too long (240 characters max).');
      if (!link) throw new Bad('Use an https link from TikTok, YouTube, Google Drive or Alight Motion.');
      const pend = (await DB.prepare("SELECT COUNT(*) n FROM listings WHERE user_id=?1 AND status='pending'").bind(u.id).first()).n;
      if (pend >= 5) throw new Bad('You already have 5 submissions waiting for review.', 429);
      try {
        await DB.prepare('INSERT INTO listings(user_id,title,category,description,link,creator,by_creator,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(u.id, title, b.category, desc, link, creator, b.byCreator ? 1 : 0, now()).run();
      } catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw new Bad('That link is already in the library.', 409); throw e; }
      return json({ ok: true, message: 'Thanks! It will appear after review.' });
    }

    if (p === '/api/save' && m === 'POST') {
      const u = need(), b = await body(request), id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw new Bad('Bad request.');
      if (b.on) {
        const l = await DB.prepare("SELECT id FROM listings WHERE id=?1 AND status='approved'").bind(id).first();
        if (!l) throw new Bad('That listing is gone.', 404);
        if (!u.premium) {
          const n = (await DB.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id=?1').bind(u.id).first()).n;
          if (n >= FREE_SAVES) throw new Bad('Free accounts can save ' + FREE_SAVES + ' presets. Go Premium for unlimited saves.', 402);
        }
        await DB.prepare('INSERT OR IGNORE INTO favorites(user_id,listing_id,created_at) VALUES(?1,?2,?3)').bind(u.id, id, now()).run();
      } else await DB.prepare('DELETE FROM favorites WHERE user_id=?1 AND listing_id=?2').bind(u.id, id).run();
      return json({ ok: true });
    }

    if (p === '/api/report' && m === 'POST') {
      const b = await body(request), id = Number(b.id), reason = str(b.reason, 5, 300), contact = str(b.contact || '', 0, 100);
      if (!Number.isInteger(id) || !reason || contact === null) throw new Bad('Tell us what is wrong (5 to 300 characters).');
      const l = await DB.prepare("SELECT id FROM listings WHERE id=?1 AND status='approved'").bind(id).first();
      if (!l) throw new Bad('That listing is gone.', 404);
      const n = (await DB.prepare('SELECT COUNT(*) n FROM reports WHERE listing_id=?1').bind(id).first()).n;
      if (n >= 20) return json({ ok: true, message: 'Already under review. Thank you.' });
      await DB.prepare('INSERT INTO reports(listing_id,reason,contact,created_at) VALUES(?1,?2,?3,?4)').bind(id, reason, contact, now()).run();
      return json({ ok: true, message: 'Report sent. We will review it.' });
    }

    if (p === '/api/premium/checkout' && m === 'POST') return await checkout(env, url, need());

    if (p === '/api/auth/logout' && m === 'POST') {
      const t = getCookie(request, '__Host-sid');
      if (/^[a-f0-9]{64}$/.test(t)) await DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(await sha256(t)).run();
      return json({ ok: true }, 200, { 'set-cookie': ck('__Host-sid', '', 0) });
    }

    if (p === '/api/admin/queue' && m === 'GET') {
      admin();
      const pending = (await DB.prepare("SELECT l.id,l.title,l.category,l.link,l.creator,l.by_creator,l.description,l.source,l.source_url,COALESCE(u.email,'Preset Finder') AS email FROM listings l LEFT JOIN users u ON u.id=l.user_id WHERE l.status='pending' ORDER BY l.by_creator DESC, l.created_at LIMIT 50").all()).results;
      const reports = (await DB.prepare("SELECT r.id,r.listing_id,l.title,l.link,r.reason,r.contact FROM reports r JOIN listings l ON l.id=r.listing_id ORDER BY r.created_at DESC LIMIT 50").all()).results;
      return json({ ok: true, pending, reports });
    }

    if (p === '/api/admin/review' && m === 'POST') {
      admin();
      const b = await body(request), id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw new Bad('Bad request.');
      if (b.action === 'approve') {
        if (b.category != null && !CATS[b.category]) throw new Bad('Unknown category.');
        await DB.prepare("UPDATE listings SET status='approved', approved_at=?1, category=COALESCE(?3, category) WHERE id=?2 AND status='pending'").bind(now(), id, b.category || null).run();
      }
      else if (b.action === 'reject') await DB.prepare("UPDATE listings SET status='rejected' WHERE id=?1 AND status='pending'").bind(id).run();
      else if (b.action === 'remove') await DB.batch([DB.prepare("UPDATE listings SET status='rejected' WHERE id=?1").bind(id), DB.prepare('DELETE FROM reports WHERE listing_id=?1').bind(id), DB.prepare('DELETE FROM favorites WHERE listing_id=?1').bind(id)]);
      else if (b.action === 'keep') await DB.prepare('DELETE FROM reports WHERE listing_id=?1').bind(id).run();
      else throw new Bad('Unknown action.');
      return json({ ok: true });
    }

    if (p === '/api/admin/premium' && m === 'POST') {
      admin();
      const b = await body(request), email = str(b.email, 5, 120), days = Math.floor(Number(b.days));
      if (!email || !(days >= 1 && days <= 366)) throw new Bad('Enter an email and 1 to 366 days.');
      const r = await DB.prepare('UPDATE users SET premium_until=MAX(?1,premium_until)+?2 WHERE email=?3').bind(now(), days * 86400, email.toLowerCase()).run();
      if (!r.meta.changes) throw new Bad('No account with that email. They need to sign in once first.', 404);
      return json({ ok: true, message: 'Premium added.' });
    }

    return fail(404, 'Not found.');
  } catch (e) {
    if (e instanceof Bad) return fail(e.status, e.message);
    console.error('library error', e && e.message);
    return fail(500, 'Something went wrong.');
  }
}
