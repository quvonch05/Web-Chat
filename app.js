/* Nebula Chat — app.js
 * Arxitektura:
 *  1. Utils / UI helpers      5. Auth (PBKDF2 + ECDH kalit juftligi)
 *  2. Storage + Net (tarmoq)  6. Render (ro'yxat, header, xabarlar)
 *  3. Crypto (WebCrypto)      7. Xabarlar, kompozer, kontekst menyu
 *  4. State                   8. Modallar (profil, sozlamalar, guruh), botlar, boot
 *
 * Eslatma: serversiz ishlaydi — ma'lumot localStorage'da, real-time esa BroadcastChannel
 * orqali bir brauzerdagi oynalar orasida. `Net` obyektini WebSocket'ga almashtirib,
 * storage qatlamini serverga ulasangiz — xuddi shu kod haqiqiy multi-qurilma chatga aylanadi.
 */
'use strict';
(() => {

/* ───────────────────────── 1. Utils ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const te = new TextEncoder(), td = new TextDecoder();
const now = () => Date.now();
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const uid = () => [...rnd(8)].map(b => b.toString(16).padStart(2, '0')).join('');
const pad = n => String(n).padStart(2, '0');
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hueOf = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; };
const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayLabel = ts => {
  if (sameDay(ts, now())) return 'Bugun';
  if (sameDay(ts, now() - 864e5)) return 'Kecha';
  const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const listTime = ts => {
  if (sameDay(ts, now())) return fmtTime(ts);
  if (sameDay(ts, now() - 864e5)) return 'Kecha';
  const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => [...w][0]).join('').toUpperCase();
const fmtDur = s => s < 60 ? s + 's' : s < 3600 ? Math.ceil(s / 60) + 'm' : s < 86400 ? Math.ceil(s / 3600) + 'h' : Math.ceil(s / 86400) + 'd';
const throttle = (fn, ms) => { let t = 0; return (...a) => { if (now() - t > ms) { t = now(); fn(...a); } }; };

const ICONS = {
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const icon = (n, s = 20) => {
  const e = document.createElement('span'); e.className = 'ico';
  e.innerHTML = `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
  return e;
};

/** Xavfsiz DOM yaratuvchi: matnlar har doim textNode — XSS yo'q. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}
const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);

function toast(msg, type = 'info', onClick) {
  const t = h('div', { class: 'toast ' + type, onclick: () => { onClick?.(); close(); } }, msg);
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  $('#toasts').append(t); setTimeout(close, 3600);
}

function linkify(text) {
  const out = []; const re = /(https?:\/\/[^\s<]+)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function modal(title, body, { wide = false, onClose } = {}) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('header', {}, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, title: 'Yopish' }, icon('x'))),
    h('div', { class: 'modal-body' }, body));
  back.append(box);
  function close() { back.remove(); document.removeEventListener('keydown', esc); onClose?.(); }
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', esc);
  $('#modal-root').append(back);
  setTimeout(() => box.querySelector('input,textarea,select')?.focus(), 30);
  return { close, box };
}
const confirmBox = (title, text, okLabel, danger = true) => new Promise(res => {
  let done = false;
  const m = modal(title, h('div', {},
    h('p', { class: 'note', style: 'font-size:14px;margin:0 0 16px' }, text),
    h('div', { class: 'stack', style: 'justify-content:flex-end' },
      h('button', { class: 'btn', onclick: () => { done = true; m.close(); res(false); } }, 'Bekor qilish'),
      h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), onclick: () => { done = true; m.close(); res(true); } }, okLabel))),
    { onClose: () => { if (!done) res(false); } });
});

/* ───────────────────── 2. Storage + Net ───────────────────── */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { toast("Brauzer xotirasi to'ldi. Eski chatlarni o'chiring yoki kichikroq rasm yuboring.", 'err'); return false; }
  },
};
const DB = {
  users: {}, chats: {}, cache: {},
  load() { this.users = LS.get('nc:users', {}); this.chats = LS.get('nc:chats', {}); this.cache = {}; },
  getMsgs(id) { return this.cache[id] ??= LS.get('nc:msgs:' + id, []); },
};
const TAB = uid();
const Net = {
  ch: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nebula-chat') : null,
  send(m) { this.ch?.postMessage({ ...m, uid: S.me?.id, tab: TAB }); },
};
// Bitta joyda o'zgartirish: yangi holatni o'qi → o'zgartir → yoz → hammaga xabar ber.
const notify = (k, id) => { Net.send({ t: 'sync', k, id }); handleSync(k, id); };
function mutUsers(fn) { const u = LS.get('nc:users', {}); fn(u); if (LS.set('nc:users', u)) { DB.users = u; notify('users'); } }
function mutChats(fn) { const c = LS.get('nc:chats', {}); fn(c); if (LS.set('nc:chats', c)) { DB.chats = c; notify('chats'); } }
function mutMsgs(cid, fn) {
  const a = LS.get('nc:msgs:' + cid, []); fn(a);
  if (LS.set('nc:msgs:' + cid, a)) { DB.cache[cid] = a; notify('msgs', cid); return true; }
  return false;
}

/* ───────────────────── 3. Crypto ───────────────────── */
const subtle = crypto?.subtle;
const PBKDF2_ITER = 150000;
const b64e = buf => { const b = new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const C = {
  rand: rnd,
  async pbkdf2(pass, salt, bits = 256, iter = PBKDF2_ITER) {
    const k = await subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, bits);
  },
  async hashPass(pass, saltB64) { return b64e(await this.pbkdf2(pass, b64d(saltB64))); },
  async wrapKey(pass, saltB64) {
    return subtle.importKey('raw', await this.pbkdf2(pass, b64d(saltB64)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  },
  genKeyPair: () => subtle.generateKey(ECDH, true, ['deriveBits']),
  exportJwk: k => subtle.exportKey('jwk', k),
  importPub: j => subtle.importKey('jwk', j, ECDH, true, []),
  importPriv: j => subtle.importKey('jwk', j, ECDH, true, ['deriveBits']),
  async seal(key, bytes, aad) {
    const iv = rnd(12);
    const params = { name: 'AES-GCM', iv }; if (aad) params.additionalData = aad;
    const ct = await subtle.encrypt(params, key, bytes);
    return { iv: b64e(iv), ct: b64e(ct) };
  },
  open(key, { iv, ct }, aad) {
    const params = { name: 'AES-GCM', iv: b64d(iv) }; if (aad) params.additionalData = aad;
    return subtle.decrypt(params, key, b64d(ct));
  },
  /** ECDH → HKDF(chatId) → AES-256-GCM. Ikki tomon ham bir xil kalitni mustaqil hosil qiladi. */
  async chatKey(myPriv, theirPubJwk, chatId) {
    const bits = await subtle.deriveBits({ name: 'ECDH', public: await this.importPub(theirPubJwk) }, myPriv, 256);
    const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('nebula-chat-v1'), info: te.encode(chatId) },
      hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  /** Xavfsizlik raqami (ikki tomonda bir xil bo'lishi kerak). */
  async fp(...jwks) {
    const s = jwks.map(k => k.x + '.' + k.y).sort().join('|');
    const d = new Uint8Array(await subtle.digest('SHA-256', te.encode(s)));
    const hex = [...d].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { bytes: d, text: hex.slice(0, 32).match(/.{4}/g).join(' ') };
  },
};
function identicon(bytes, size = 72) {
  const c = document.createElement('canvas'), n = 5, cell = size / n; c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = `hsl(${(bytes[0] * 360 / 256) | 0} 65% 55%)`;
  let i = 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < 3; x++) {
    if (bytes[i++ % bytes.length] & 1) { g.fillRect(x * cell, y * cell, cell, cell); g.fillRect((n - 1 - x) * cell, y * cell, cell, cell); }
  }
  c.className = 'identicon'; return c;
}

/* ───────────────────── 4. State ───────────────────── */
const S = {
  me: null, myPriv: null, cur: null, filter: 'all', q: '', reply: null, edit: null, vault: true,
  keys: new Map(), plain: new Map(), presence: new Map(), typing: {}, drafts: {}, msgQ: '',
  rt: 0, lastActive: now(), focused: true, fails: 0, lock: 0,
};
const hasPin = () => !!S.me?.prefs?.pin;
const isLocked = () => hasPin() && S.vault;
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const EMOJIS = ('😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😜🤪🤔🤨😐🙄😏😴😎🤓🥳😢😭😤😡🤯😱🤗🫡👍👎👏🙌🙏💪👀🔥✨⭐🎉❤️🧡💛💚💙💜🖤💔💯✅❌☕🍕🎧🚀🌙☀️🌈🎮📚💡🎁').match(/\p{Extended_Pictographic}\uFE0F?/gu);

/* ───────────────────── 5. Auth ───────────────────── */
const pwScore = p => Math.min(4, (p.length >= 8) + (p.length >= 12) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^\w\s]/.test(p));
const defaultPrefs = () => ({ theme: 'dark', accent: '#7c5cff', sound: true, blur: true });

async function register({ name, username, password, password2 }) {
  username = username.trim().toLowerCase(); name = name.trim();
  if (!name) throw new Error('Ismingizni kiriting');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("Username: 3–20 belgi, faqat a–z, 0–9 va _");
  if (password.length < 8) throw new Error('Parol kamida 8 belgidan iborat bo‘lsin');
  if (password !== password2) throw new Error('Parollar mos kelmadi');
  if (Object.values(DB.users).some(u => u.username === username)) throw new Error('Bu username band');
  const kp = await C.genKeyPair();
  const pub = await C.exportJwk(kp.publicKey), priv = await C.exportJwk(kp.privateKey);
  const authSalt = b64e(rnd(16)), wrapSalt = b64e(rnd(16));
  const authHash = await C.hashPass(password, authSalt);
  const wrapped = await C.seal(await C.wrapKey(password, wrapSalt), te.encode(JSON.stringify(priv)));
  const user = { id: 'u_' + uid(), username, name: name.slice(0, 40), bio: '', avatar: null, status: 'online', created: now(), authSalt, authHash, wrapSalt, wrapped, pub, prefs: defaultPrefs() };
  mutUsers(u => { if (Object.values(u).some(x => x.username === username)) throw new Error('Bu username band'); u[user.id] = user; });
  await startSession(DB.users[user.id], priv);
}
async function login(username, password) {
  if (S.lock > now()) throw new Error(`Juda ko'p urinish. ${Math.ceil((S.lock - now()) / 1000)} soniyadan so'ng urinib ko'ring`);
  DB.load();
  const u = Object.values(DB.users).find(x => !x.bot && x.username === username.trim().toLowerCase());
  const hash = await C.hashPass(password, u ? u.authSalt : 'AAAAAAAAAAAAAAAAAAAAAA==');
  if (!u || hash !== u.authHash) {
    if (++S.fails >= 5) { S.lock = now() + 30000; S.fails = 0; }
    throw new Error("Username yoki parol noto'g'ri");
  }
  S.fails = 0;
  const priv = JSON.parse(td.decode(await C.open(await C.wrapKey(password, u.wrapSalt), u.wrapped)));
  await startSession(u, priv);
}
async function startSession(user, privJwk) {
  S.myPriv = await C.importPriv(privJwk);
  try { sessionStorage.setItem('nc:session', JSON.stringify({ uid: user.id, priv: privJwk })); } catch {}
  await enterApp(user);
}
function logout() {
  Net.send({ t: 'bye' });
  clearInterval(S.hb); clearInterval(S.tick);
  try { sessionStorage.removeItem('nc:session'); } catch {}
  S.me = null; S.myPriv = null; S.cur = null; S.keys.clear(); S.plain.clear(); S.presence.clear();
  document.querySelectorAll('.modal-back').forEach(e => e.remove());
  $('#app').classList.add('hidden'); $('#app').classList.remove('in-chat'); showAuth();
}
function showAuth() {
  $('#auth').classList.remove('hidden'); document.title = 'Nebula Chat';
  applyPrefs();
}
function bindAuth() {
  const tabs = document.querySelectorAll('.seg button');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.classList.toggle('on', x === b));
    $('#loginForm').classList.toggle('hidden', b.dataset.tab !== 'login');
    $('#regForm').classList.toggle('hidden', b.dataset.tab !== 'register');
  }));
  const run = (form, fn) => form.addEventListener('submit', async e => {
    e.preventDefault(); const err = $('.form-err', form), btn = $('button[type=submit]', form);
    err.textContent = ''; btn.disabled = true; const label = btn.textContent; btn.textContent = 'Iltimos kuting…';
    try { await fn(Object.fromEntries(new FormData(form))); form.reset(); }
    catch (ex) { err.textContent = ex.message || 'Xatolik yuz berdi'; }
    finally { btn.disabled = false; btn.textContent = label; }
  });
  run($('#loginForm'), d => login(d.username, d.password));
  run($('#regForm'), d => register(d));
  const meter = $('.meter i'), colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  $('#regForm [name=password]').addEventListener('input', e => {
    const s = e.target.value ? pwScore(e.target.value) : -1;
    meter.style.width = (s + 1) * 20 + '%'; meter.style.background = colors[Math.max(s, 0)];
  });
}

/* ───────────────────── 6. Helpers + Render ───────────────────── */
const GHOST = { id: 'ghost', name: "O'chirilgan akkaunt", username: 'deleted', avatar: null };
const myChats = () => Object.values(DB.chats).filter(c => c.members.includes(S.me.id));
const peerOf = c => DB.users[c.members.find(x => x !== S.me.id)] || GHOST;
const titleOf = c => c.type === 'group' ? c.name : peerOf(c).name;
const entOf = c => c.type === 'group' ? { id: c.id, name: c.name, avatar: c.avatar } : peerOf(c);
const lastMsg = c => { const a = DB.getMsgs(c.id); return a[a.length - 1]; };
const unreadOf = c => DB.getMsgs(c.id).filter(m => !m.sys && !m.deleted && m.from !== S.me.id && !m.readBy.includes(S.me.id)).length;
const curChat = () => DB.chats[S.cur];

function presenceOf(u) {
  if (u.bot) return 'online';
  const st = u.status === 'invisible' ? 'offline' : u.status === 'away' ? 'away' : u.status === 'busy' ? 'busy' : 'online';
  if (u.id === S.me?.id) return st;
  const t = S.presence.get(u.id);
  return t && now() - t < 40000 ? st : 'offline';
}
function statusText(u) {
  if (u.id === 'ghost') return '';
  const p = presenceOf(u);
  if (p === 'online') return 'online';
  if (p === 'busy') return 'band';
  if (p === 'away') return 'uzoqda';
  const t = LS.get('nc:seen', {})[u.id];
  return u.status === 'invisible' || !t ? 'yaqinda online edi' : `oxirgi marta ${sameDay(t, now()) ? 'bugun' : dayLabel(t)} ${fmtTime(t)}`;
}
function avatarEl(ent, size = 44, opts = {}) {
  const el = h('div', { class: 'av', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px` });
  if (ent.avatar && ent.avatar.startsWith('data:image/')) el.append(h('img', { src: ent.avatar, alt: '' }));
  else { const hue = hueOf(ent.id); el.style.background = `linear-gradient(135deg,hsl(${hue} 70% 56%),hsl(${(hue + 55) % 360} 70% 44%))`; el.append(initials(ent.name)); }
  if (opts.dot && ent.id !== 'ghost' && !String(ent.id).includes(':') && !String(ent.id).startsWith('g:')) el.append(h('i', { class: 'dot ' + presenceOf(ent) }));
  return el;
}

function applyPrefs() {
  const p = S.me?.prefs || LS.get('nc:ui', {});
  const theme = p.theme || 'dark';
  const eff = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.dataset.theme = eff;
  document.documentElement.style.setProperty('--accent', p.accent || '#7c5cff');
  $('meta[name=theme-color]').content = eff === 'dark' ? '#0b0d14' : '#eceff8';
  if (S.me) LS.set('nc:ui', { theme: p.theme, accent: p.accent });
}

function renderMe() {
  const u = S.me;
  $('#meBar').replaceChildren(
    h('button', { class: 'me-main', onclick: openSettings, title: 'Profil va sozlamalar' },
      avatarEl(u, 42, { dot: true }),
      h('div', { class: 'me-txt' }, h('b', {}, u.name), h('small', {}, '@' + u.username))),
    h('button', { class: 'icon-btn', title: 'Yangi chat / guruh', onclick: openNew }, icon('edit')),
    h('button', { class: 'icon-btn', title: 'Maxfiy bo‘lim qulfi', onclick: toggleVault }, icon(isLocked() ? 'lock' : 'unlock')),
    h('button', { class: 'icon-btn', title: 'Sozlamalar', onclick: openSettings }, icon('sliders')));
}

function previewOf(c) {
  const m = lastMsg(c); if (!m) return h('span', {}, c.type === 'secret' ? 'Maxfiy chat' : 'Xabarlar yo‘q');
  if (m.sys) return h('span', {}, m.text);
  if (m.deleted) return h('span', {}, '🚫 Xabar o‘chirilgan');
  const p = payloadOf(m); const mine = m.from === S.me.id;
  let t = p.text || (p.img ? '📷 Rasm' : '');
  if (m.enc && !S.plain.has(m.id)) t = '🔒 Maxfiy xabar';
  const who = mine ? 'Siz: ' : (c.type === 'group' ? (DB.users[m.from]?.name || '?').split(' ')[0] + ': ' : '');
  return h('span', {}, who ? h('b', {}, who) : null, t);
}

function renderList() {
  if (!S.me) return;
  const list = $('#chatList'); let chats = myChats();
  const locked = isLocked(); const secretCount = chats.filter(c => c.type === 'secret').length;
  if (locked) chats = chats.filter(c => c.type !== 'secret');
  if (S.filter !== 'all') chats = chats.filter(c => c.type === S.filter);
  const q = S.q.trim().toLowerCase();
  if (q) chats = chats.filter(c => titleOf(c).toLowerCase().includes(q) || (c.type !== 'group' && peerOf(c).username.includes(q)));
  chats.sort((a, b) => ((lastMsg(b)?.ts) || b.created) - ((lastMsg(a)?.ts) || a.created));
  const rows = [];
  if (locked && secretCount && (S.filter === 'all' || S.filter === 'secret') && !q)
    rows.push(h('div', { class: 'chat-row vault-row', onclick: () => askPin() },
      h('div', { class: 'av', style: 'width:44px;height:44px;background:var(--sec);font-size:20px' }, '🔒'),
      h('div', { class: 'cr-main' }, h('div', { class: 'cr-title' }, 'Maxfiy chatlar'), h('div', { class: 'cr-prev' }, `${secretCount} ta · PIN bilan oching`))));
  let total = 0;
  for (const c of chats) {
    const un = unreadOf(c); total += un; const m = lastMsg(c);
    rows.push(h('div', { class: 'chat-row' + (c.type === 'secret' ? ' secret' : '') + (c.id === S.cur ? ' active' : ''), role: 'listitem', onclick: () => openChat(c.id) },
      avatarEl(entOf(c), 48, { dot: c.type !== 'group' }),
      h('div', { class: 'cr-main' },
        h('div', { class: 'cr-top' }, h('div', { class: 'cr-title' }, titleOf(c)), h('div', { class: 'cr-time' }, m ? listTime(m.ts) : '')),
        h('div', { class: 'cr-bot' }, h('div', { class: 'cr-prev' }, previewOf(c)), un ? h('div', { class: 'badge' }, un > 99 ? '99+' : un) : null))));
  }
  if (!rows.length) rows.push(h('div', { class: 'list-empty' }, q ? 'Hech narsa topilmadi' : 'Chatlar yo‘q. ✎ tugmasi bilan yangisini boshlang.'));
  list.replaceChildren(...rows);
  document.title = (total ? `(${total}) ` : '') + 'Nebula Chat';
}

const typingNames = c => Object.entries(S.typing[c.id] || {}).filter(([u, t]) => u !== S.me.id && now() - t < 3500).map(([u]) => DB.users[u]?.name.split(' ')[0] || '…');
function setTyping(cid, u) {
  (S.typing[cid] ??= {})[u] = now();
  if (S.cur === cid) renderHeader();
  setTimeout(() => { if (S.cur === cid) renderHeader(); }, 3700);
}

function renderHeader() {
  const c = curChat(); if (!c) return;
  const ent = entOf(c); const typ = typingNames(c);
  let sub, cls = 'ch-sub';
  if (typ.length) { sub = (c.type === 'group' ? typ.join(', ') + ' ' : '') + 'yozmoqda'; cls += ' typing'; }
  else if (c.type === 'group') sub = `${c.members.length} a'zo`;
  else sub = (c.type === 'secret' ? '🔒 end-to-end · ' : '') + statusText(ent);
  $('#convInner').classList.toggle('secret', c.type === 'secret');
  $('#convHead').replaceChildren(
    h('button', { class: 'icon-btn back-btn', onclick: closeChat, title: 'Orqaga' }, icon('back')),
    h('button', { class: 'ch-info', onclick: openInfo },
      avatarEl(ent, 42, { dot: c.type !== 'group' }),
      h('div', { style: 'min-width:0' }, h('div', { class: 'ch-title' }, titleOf(c)), h('div', { class: cls }, sub))),
    h('button', { class: 'icon-btn', title: 'Xabarlarda qidirish', onclick: toggleMsgSearch }, icon('search')),
    h('button', { class: 'icon-btn', title: 'Ma\'lumot', onclick: openInfo }, icon('info')));
}
const TTLS = [[0, "O'chiq"], [10, '10 soniya'], [60, '1 daqiqa'], [3600, '1 soat'], [86400, '1 kun']];
const ttlLabel = s => (TTLS.find(t => t[0] === s) || [0, "O'chiq"])[1];
function renderBanner() {
  const c = curChat(), el = $('#secretBanner');
  if (!c || c.type !== 'secret') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.replaceChildren(h('span', {}, `🔒 Xabarlar shifrlangan · ⏱ Avto-o'chirish: ${ttlLabel(c.ttl || 0)}`),
    h('button', { onclick: openInfo }, 'Kalitni tekshirish'));
}

/* Xabarlar */
function payloadOf(m) {
  if (m.deleted) return null;
  if (m.enc) { const c = S.plain.get(m.id); return c && c.ct === m.enc.ct ? c.p : { text: '🔒 …' }; }
  return { text: m.text, img: m.img, w: m.w, h: m.h };
}
async function plainOf(chat, m) {
  if (!m.enc || m.deleted) return payloadOf(m);
  const c = S.plain.get(m.id); if (c && c.ct === m.enc.ct) return c.p;
  let p;
  try { p = JSON.parse(td.decode(await C.open(await keyFor(chat, S.me.id), m.enc, te.encode(chat.id)))); }
  catch { p = { text: '⚠️ Xabarni ochib bo‘lmadi (kalit mos emas)' }; }
  S.plain.set(m.id, { ct: m.enc.ct, p }); return p;
}
const decryptAll = (chat, msgs) => Promise.all(msgs.filter(m => m.enc && !m.deleted).map(m => plainOf(chat, m)));
async function keyFor(chat, asId) {
  const k = chat.id + ':' + asId; if (S.keys.has(k)) return S.keys.get(k);
  const other = DB.users[chat.members.find(x => x !== asId)];
  const mine = asId === S.me.id ? S.myPriv : await C.importPriv(DB.users[asId].botPriv);
  const key = await C.chatKey(mine, other.pub, chat.id); S.keys.set(k, key); return key;
}
function snippet(m) { const p = payloadOf(m); return !p ? 'Xabar o‘chirilgan' : (p.text || (p.img ? '📷 Rasm' : '')); }

async function renderMessages(forceBottom) {
  const chat = curChat(); if (!chat) return; const token = ++S.rt;
  let msgs = DB.getMsgs(chat.id).filter(m => !m.exp || m.exp > now());
  if (chat.type === 'secret') await decryptAll(chat, msgs);
  if (token !== S.rt || S.cur !== chat.id) return;
  const q = S.msgQ.trim().toLowerCase();
  if (q) msgs = msgs.filter(m => !m.sys && (payloadOf(m)?.text || '').toLowerCase().includes(q));
  const box = $('#msgs');
  const atBottom = forceBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  const frag = document.createDocumentFragment(); let lastDay = '', lastFrom = null;
  for (const m of msgs) {
    const d = dayLabel(m.ts);
    if (d !== lastDay) { frag.append(h('div', { class: 'day' }, h('span', {}, d))); lastDay = d; lastFrom = null; }
    if (m.sys) { frag.append(h('div', { class: 'sys' }, m.text)); lastFrom = null; continue; }
    frag.append(msgEl(chat, m, lastFrom !== m.from)); lastFrom = m.from;
  }
  if (!msgs.length) frag.append(h('div', { class: 'no-msgs' }, q ? 'Hech narsa topilmadi' : chat.type === 'secret' ? '🔒 Maxfiy suhbat boshlandi. Birinchi xabarni yozing.' : 'Hali xabarlar yo‘q. Salom deng 👋'));
  box.replaceChildren(frag);
  if (q) $('#msgSearchCount').textContent = `${msgs.length} ta`;
  if (atBottom) { box.style.scrollBehavior = 'auto'; box.scrollTop = box.scrollHeight; box.style.scrollBehavior = ''; }
  updateCountdowns();
}

function msgEl(chat, m, first) {
  const mine = m.from === S.me.id, sender = DB.users[m.from] || GHOST;
  const row = h('div', { class: 'row ' + (mine ? 'mine' : 'theirs') + (first ? ' first' : ''), dataset: { id: m.id } });
  if (chat.type === 'group' && !mine) row.append(first ? avatarEl(sender, 30) : h('div', { class: 'av-gap' }));
  const bub = h('div', { class: 'bubble' });
  if (chat.type === 'group' && !mine && first) bub.append(h('div', { class: 'who', style: `color:hsl(${hueOf(m.from)} 80% 65%)` }, sender.name));
  if (m.deleted) { bub.classList.add('deleted'); bub.append('🚫 Xabar o‘chirilgan'); }
  else {
    if (m.replyTo) {
      const r = DB.getMsgs(chat.id).find(x => x.id === m.replyTo);
      bub.append(h('div', { class: 'quote', onclick: () => scrollToMsg(m.replyTo) },
        h('b', {}, r ? (DB.users[r.from]?.name || '?') : 'Xabar'), h('span', {}, r ? snippet(r) : 'Xabar topilmadi')));
    }
    const p = payloadOf(m);
    if (p.img && p.img.startsWith('data:image/'))
      bub.append(h('img', { class: 'pic', src: p.img, alt: 'Rasm', style: p.w ? `aspect-ratio:${p.w}/${p.h}` : '', onclick: () => lightbox(p.img) }));
    if (p.text) bub.append(h('div', { class: 'txt' }, linkify(p.text)));
  }
  const read = m.readBy.some(x => x !== S.me.id);
  bub.append(h('div', { class: 'meta' },
    m.exp ? h('span', { class: 'count', dataset: { exp: m.exp } }) : null,
    m.edited && !m.deleted ? h('span', {}, 'tahrirlangan') : null,
    h('span', {}, fmtTime(m.ts)),
    mine && !m.deleted ? h('span', { class: 'ticks' + (read ? ' read' : '') }, read ? '✓✓' : '✓') : null));
  const rx = Object.entries(m.reactions || {});
  if (rx.length && !m.deleted) bub.append(h('div', { class: 'reactions' }, rx.map(([e, l]) =>
    h('button', { class: 'chip' + (l.includes(S.me.id) ? ' me' : ''), onclick: () => toggleReact(chat, m, e) }, e, l.length > 1 ? l.length : ''))));
  if (!m.deleted) bub.append(h('button', { class: 'more', title: 'Amallar', onclick: ev => { const r = ev.currentTarget.getBoundingClientRect(); showCtx(r.left, r.bottom, chat, m); } }, icon('more', 16)));
  bub.addEventListener('contextmenu', ev => { if (m.deleted) return; ev.preventDefault(); showCtx(ev.clientX, ev.clientY, chat, m); });
  let lp; bub.addEventListener('touchstart', ev => { if (m.deleted) return; const t = ev.touches[0]; lp = setTimeout(() => showCtx(t.clientX, t.clientY, chat, m), 520); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(e => bub.addEventListener(e, () => clearTimeout(lp), { passive: true }));
  bub.addEventListener('dblclick', () => { if (!m.deleted) startReply(m); });
  row.append(bub); return row;
}
function scrollToMsg(id) {
  const el = $(`.row[data-id="${id}"]`); if (!el) return toast('Xabar topilmadi', 'info');
  el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300);
}
function updateCountdowns() {
  document.querySelectorAll('.count[data-exp]').forEach(el => {
    el.textContent = '⏱ ' + fmtDur(Math.max(0, Math.ceil((+el.dataset.exp - now()) / 1000)));
  });
}
function lightbox(src) {
  const l = h('div', { class: 'lightbox', onclick: () => l.remove() }, h('img', { src, alt: '' })); document.body.append(l);
}

/* ───────────────────── 7. Xabarlar / kompozer ───────────────────── */
function showEmpty() {
  $('#convInner').classList.add('hidden'); $('#emptyState').classList.remove('hidden'); $('#app').classList.remove('in-chat');
}
function closeChat() { saveDraft(); S.cur = null; showEmpty(); renderList(); }
function saveDraft() { if (S.cur) { const v = $('#input').value; if (v.trim()) S.drafts[S.cur] = v; else delete S.drafts[S.cur]; } }
function openChat(id) {
  const c = DB.chats[id]; if (!c) return;
  if (c.type === 'secret' && isLocked()) return askPin(() => openChat(id));
  saveDraft(); S.cur = id; S.reply = null; S.edit = null; S.msgQ = '';
  $('#msgSearchBar').classList.add('hidden'); $('#msgSearch').value = ''; $('#emojiPop').classList.add('hidden');
  $('#emptyState').classList.add('hidden'); $('#convInner').classList.remove('hidden'); $('#app').classList.add('in-chat');
  $('#input').value = S.drafts[id] || ''; autosize();
  renderHeader(); renderBanner(); renderCtxBar(); updateObscure();
  renderMessages(true).then(markRead); renderList();
  if (matchMedia('(min-width:821px)').matches) $('#input').focus();
}
function markReadBy(chat, reader) {
  mutMsgs(chat.id, a => {
    for (const m of a) {
      if (m.sys || m.from === reader || m.readBy.includes(reader)) continue;
      m.readBy.push(reader);
      if (chat.type === 'secret' && chat.ttl && !m.exp) m.exp = now() + chat.ttl * 1000;
    }
  });
}
function markRead() {
  const c = curChat(); if (!c || document.hidden || !S.focused) return;
  if (DB.getMsgs(c.id).some(m => !m.sys && m.from !== S.me.id && !m.readBy.includes(S.me.id))) markReadBy(c, S.me.id);
}

async function postMsg(chat, fromId, payload, extra = {}) {
  const msg = { id: uid(), from: fromId, ts: now(), readBy: [fromId], reactions: {}, ...extra };
  if (chat.type === 'secret') {
    msg.enc = await C.seal(await keyFor(chat, fromId), te.encode(JSON.stringify(payload)), te.encode(chat.id));
    S.plain.set(msg.id, { ct: msg.enc.ct, p: payload });
  } else {
    if (payload.text) msg.text = payload.text;
    if (payload.img) { msg.img = payload.img; msg.w = payload.w; msg.h = payload.h; }
  }
  return mutMsgs(chat.id, a => a.push(msg)) ? msg : null;
}
const sysMsg = text => ({ id: uid(), sys: true, text, ts: now(), from: 'sys', readBy: [] });

async function submit() {
  const chat = curChat(), input = $('#input'); if (!chat) return;
  const text = input.value.trim();
  if (S.edit) {
    const m = DB.getMsgs(chat.id).find(x => x.id === S.edit);
    if (!text) return toast('Matn bo‘sh bo‘lishi mumkin emas', 'err');
    S.edit = null; input.value = ''; autosize(); renderCtxBar();
    if (m) await applyEdit(chat, m, text); return;
  }
  if (!text) return;
  const reply = S.reply; input.value = ''; autosize(); delete S.drafts[chat.id]; S.reply = null; renderCtxBar();
  await postMsg(chat, S.me.id, { text }, reply ? { replyTo: reply } : {});
  scrollBottom(); botRespond(chat, text);
}
async function applyEdit(chat, m, text) {
  if (m.enc) {
    const old = await plainOf(chat, m); const p = { ...old, text };
    const enc = await C.seal(await keyFor(chat, S.me.id), te.encode(JSON.stringify(p)), te.encode(chat.id));
    S.plain.set(m.id, { ct: enc.ct, p });
    mutMsgs(chat.id, a => { const x = a.find(y => y.id === m.id); if (x) { x.enc = enc; x.edited = true; } });
  } else mutMsgs(chat.id, a => { const x = a.find(y => y.id === m.id); if (x) { x.text = text; x.edited = true; } });
}
function deleteMsg(chat, m) {
  S.plain.delete(m.id);
  mutMsgs(chat.id, a => { const x = a.find(y => y.id === m.id); if (x) { x.deleted = true; x.exp = undefined; delete x.text; delete x.img; delete x.enc; x.reactions = {}; } });
}
function toggleReact(chat, m, e) {
  mutMsgs(chat.id, a => {
    const x = a.find(y => y.id === m.id); if (!x || x.deleted) return;
    x.reactions ??= {}; const l = x.reactions[e] ??= []; const i = l.indexOf(S.me.id);
    if (i >= 0) l.splice(i, 1); else l.push(S.me.id);
    if (!l.length) delete x.reactions[e];
  });
}
const scrollBottom = () => { const b = $('#msgs'); b.scrollTop = b.scrollHeight; };

function startReply(m) { S.reply = m.id; S.edit = null; renderCtxBar(); $('#input').focus(); }
function startEdit(m) { S.edit = m.id; S.reply = null; $('#input').value = payloadOf(m).text || ''; autosize(); renderCtxBar(); $('#input').focus(); }
function renderCtxBar() {
  const bar = $('#ctxBar'), id = S.edit || S.reply;
  if (!id) { bar.classList.add('hidden'); return; }
  const m = DB.getMsgs(S.cur).find(x => x.id === id); if (!m) { S.edit = S.reply = null; bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.replaceChildren(h('div', { class: 'ctx-t' },
    h('b', {}, S.edit ? '✏️ Tahrirlash' : '↩ ' + (DB.users[m.from]?.name || '?') + 'ga javob'), h('span', { class: 's' }, snippet(m))),
    h('button', { class: 'icon-btn', onclick: cancelCtx, title: 'Bekor qilish' }, icon('x', 18)));
}
function cancelCtx() { if (S.edit) { $('#input').value = ''; autosize(); } S.edit = S.reply = null; renderCtxBar(); }
function autosize() { const i = $('#input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 160) + 'px'; }

async function imageToDataUrl(file, { max = 900, q = .72, square = false } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Faqat rasm fayllarini yuborish mumkin');
  if (file.size > 20 * 1024 * 1024) throw new Error('Rasm juda katta (20 MB gacha)');
  const url = URL.createObjectURL(file);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Rasmni o‘qib bo‘lmadi')); i.src = url; });
  URL.revokeObjectURL(url);
  let sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const k = Math.min(1, max / Math.max(sw, sh)), w = Math.round(sw * k), hh = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.drawImage(im, sx, sy, sw, sh, 0, 0, w, hh);
  return { img: c.toDataURL('image/jpeg', q), w, h: hh };
}
async function sendImage(file) {
  const chat = curChat(); if (!chat || !file) return;
  try {
    const p = await imageToDataUrl(file);
    const reply = S.reply; S.reply = null; renderCtxBar();
    await postMsg(chat, S.me.id, p, reply ? { replyTo: reply } : {});
    scrollBottom(); botRespond(chat, '', true);
  } catch (e) { toast(e.message, 'err'); }
}

function bindComposer() {
  const input = $('#input');
  $('#btnSend').append(icon('send', 19)); $('#btnEmoji').append(icon('smile')); $('#btnAttach').append(icon('image'));
  $('#msgSearchClose').append(icon('x', 18)); $('#searchIco').append(icon('search', 16));
  $('#btnSend').addEventListener('click', submit);
  $('#btnAttach').addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', e => { sendImage(e.target.files[0]); e.target.value = ''; });
  const pop = $('#emojiPop');
  EMOJIS.forEach(e => pop.append(h('button', { type: 'button', onclick: () => {
    const s = input.selectionStart ?? input.value.length; input.setRangeText(e, s, input.selectionEnd ?? s, 'end'); input.focus(); autosize();
  } }, e)));
  $('#btnEmoji').addEventListener('click', ev => { ev.stopPropagation(); pop.classList.toggle('hidden'); });
  document.addEventListener('click', ev => { if (!ev.target.closest('#emojiPop')) pop.classList.add('hidden'); });
  const typing = throttle(() => Net.send({ t: 'typing', chat: S.cur }), 2000);
  input.addEventListener('input', () => { autosize(); if (S.cur && input.value) typing(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') cancelCtx();
    else if (e.key === 'ArrowUp' && !input.value && S.cur) {
      const last = [...DB.getMsgs(S.cur)].reverse().find(m => m.from === S.me.id && !m.deleted && payloadOf(m)?.text);
      if (last) { e.preventDefault(); startEdit(last); }
    }
  });
  input.addEventListener('paste', e => {
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); sendImage(f); }
  });
  const conv = $('#conv');
  conv.addEventListener('dragover', e => { if (S.cur) e.preventDefault(); });
  conv.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f && S.cur) { e.preventDefault(); sendImage(f); } });
  $('#msgSearch').addEventListener('input', e => { S.msgQ = e.target.value; if (!S.msgQ) $('#msgSearchCount').textContent = ''; renderMessages(); });
  $('#msgSearchClose').addEventListener('click', toggleMsgSearch);
  $('#chatSearch').addEventListener('input', e => { S.q = e.target.value; renderList(); });
  $('#filters').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; S.filter = b.dataset.f;
    document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b)); renderList();
  });
  $('#obscureCover').addEventListener('click', () => { S.focused = true; updateObscure(); markRead(); });
}
function toggleMsgSearch() {
  const bar = $('#msgSearchBar'); bar.classList.toggle('hidden');
  if (bar.classList.contains('hidden')) { S.msgQ = ''; $('#msgSearch').value = ''; $('#msgSearchCount').textContent = ''; renderMessages(true); }
  else $('#msgSearch').focus();
}
function updateObscure() {
  const c = curChat();
  const on = !!c && c.type === 'secret' && S.me?.prefs?.blur !== false && (document.hidden || !S.focused);
  $('#convInner').classList.toggle('obscured', on);
}

/* Kontekst menyu */
function hideCtx() { $('#ctx').classList.add('hidden'); }
function showCtx(x, y, chat, m) {
  const mine = m.from === S.me.id, p = payloadOf(m) || {}, el = $('#ctx'); el.replaceChildren();
  el.append(h('div', { class: 'react' }, QUICK.map(e => h('button', { onclick: () => { hideCtx(); toggleReact(chat, m, e); } }, e))));
  const item = (ic, label, fn, cls = '') => h('button', { class: 'item ' + cls, onclick: () => { hideCtx(); fn(); } }, icon(ic, 17), label);
  el.append(item('reply', 'Javob berish', () => startReply(m)));
  if (p.text && !m.enc || (m.enc && p.text && !p.text.startsWith('🔒'))) el.append(item('copy', 'Nusxalash', () => navigator.clipboard?.writeText(p.text).then(() => toast('Nusxalandi', 'ok'))));
  if (mine && p.text) el.append(item('edit', 'Tahrirlash', () => startEdit(m)));
  if (mine) el.append(item('trash', 'Hamma uchun o‘chirish', () => deleteMsg(chat, m), 'danger'));
  el.classList.remove('hidden'); const r = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctx')) hideCtx(); });
document.addEventListener('scroll', hideCtx, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtx(); });

/* ───────────────────── 8. Modallar ───────────────────── */
function openOrCreate(peerId, type) {
  const id = `${type}:${[S.me.id, peerId].sort().join('_')}`;
  if (!DB.chats[id]) {
    mutChats(c => { c[id] = { id, type, members: [S.me.id, peerId], created: now(), createdBy: S.me.id, ttl: 0 }; });
    if (type === 'secret') mutMsgs(id, a => a.push(sysMsg('🔒 Maxfiy chat yaratildi. Kalitlar: ECDH P-256 → HKDF → AES-256-GCM.')));
  }
  openChat(id);
}
function createGroup(name, ids) {
  const id = 'g:' + uid();
  mutChats(c => { c[id] = { id, type: 'group', name, members: [S.me.id, ...ids], created: now(), createdBy: S.me.id }; });
  mutMsgs(id, a => a.push(sysMsg(`👥 ${S.me.name} guruhni yaratdi`)));
  openChat(id);
}

function openNew() {
  let mode = 'direct'; const sel = new Set();
  const body = h('div'); const m = modal('Yangi chat', body);
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: 'on', onclick: () => setMode('direct') }, 'Shaxsiy'),
    h('button', { onclick: () => setMode('group') }, 'Guruh'));
  const search = h('input', { class: 'inp', placeholder: 'Ism yoki username…', oninput: draw });
  const gname = h('input', { class: 'inp', placeholder: 'Guruh nomi', maxLength: 40, style: 'margin-top:10px' });
  const list = h('div', { class: 'user-list' });
  const create = h('button', { class: 'btn primary block', onclick: () => {
    const n = gname.value.trim();
    if (!n) return toast('Guruh nomini kiriting', 'err');
    if (!sel.size) return toast('Kamida bitta a\'zo tanlang', 'err');
    m.close(); createGroup(n, [...sel]);
  } }, 'Guruh yaratish');
  body.append(tabs, search, gname, list, create);
  function setMode(x) {
    mode = x; [...tabs.children].forEach((b, i) => b.classList.toggle('on', (i === 0) === (x === 'direct')));
    gname.classList.toggle('hidden', x === 'direct'); create.classList.toggle('hidden', x === 'direct'); draw();
  }
  function draw() {
    const q = search.value.trim().toLowerCase();
    const users = Object.values(DB.users).filter(u => u.id !== S.me.id && (!q || u.name.toLowerCase().includes(q) || u.username.includes(q)));
    list.replaceChildren(...(users.length ? users.map(u => h('div', { class: 'user-row' },
      avatarEl(u, 42, { dot: true }),
      h('div', { class: 'grow' }, h('b', {}, u.name + (u.bot ? ' 🤖' : '')), h('small', {}, '@' + u.username + ' · ' + statusText(u))),
      mode === 'direct'
        ? [h('button', { class: 'btn sm', onclick: () => { m.close(); openOrCreate(u.id, 'direct'); } }, 'Chat'),
           h('button', { class: 'btn sm', title: 'Maxfiy chat', onclick: () => { m.close(); openOrCreate(u.id, 'secret'); } }, '🔒')]
        : h('input', { type: 'checkbox', checked: sel.has(u.id), style: 'width:20px;height:20px;accent-color:var(--accent)',
            onchange: e => e.target.checked ? sel.add(u.id) : sel.delete(u.id) })))
      : [h('div', { class: 'list-empty' }, 'Foydalanuvchi topilmadi. Boshqa oynada yangi akkaunt yarating.')]));
  }
  setMode('direct');
}

function openInfo() {
  const c = curChat(); if (!c) return;
  if (c.type === 'group') return openGroupInfo(c);
  openUserCard(peerOf(c), c);
}

async function openUserCard(user, chat) {
  const body = h('div'); const m = modal(chat?.type === 'secret' ? '🔒 Maxfiy chat' : 'Profil', body);
  body.append(h('div', { class: 'profile-hero' },
    avatarEl(user, 96, { dot: true }), h('h2', {}, user.name), h('p', {}, '@' + user.username + (user.bot ? ' · bot' : '')),
    h('p', {}, statusText(user)), user.bio ? h('div', { class: 'bio' }, user.bio) : null));
  if (user.id !== S.me.id && user.id !== 'ghost' && chat?.type !== 'secret')
    body.append(h('div', { class: 'stack' },
      chat ? null : h('button', { class: 'btn primary', onclick: () => { m.close(); openOrCreate(user.id, 'direct'); } }, 'Xabar yozish'),
      h('button', { class: 'btn', onclick: () => { m.close(); openOrCreate(user.id, 'secret'); } }, '🔒 Maxfiy chat boshlash')));
  if (chat?.type === 'secret' && user.pub) {
    const box = h('div', { class: 'fp-box' }, 'Hisoblanmoqda…');
    body.append(h('div', { class: 'h4' }, 'Xavfsizlik raqami'), box,
      h('p', { class: 'note' }, 'Suhbatdoshingiz bilan bu raqam va rasmni boshqa kanal orqali (qo‘ng‘iroq, yuzma-yuz) solishtiring. Mos kelsa — orada hech kim yo‘q.'));
    C.fp(S.me.pub, user.pub).then(f => box.replaceChildren(identicon(f.bytes), h('div', { class: 'fp' }, f.text)));
    const sel = h('select', { class: 'inp', onchange: e => setTtl(chat, +e.target.value) },
      TTLS.map(([v, l]) => h('option', { value: v, selected: (chat.ttl || 0) === v }, l)));
    body.append(h('div', { class: 'h4' }, "Xabarlarni avto-o'chirish"), sel,
      h('p', { class: 'note' }, 'Taymer xabar o‘qilgandan so‘ng ishga tushadi.'),
      h('div', { class: 'check-row' }, h('span', { class: 'ico' }, '🛡'), h('small', { class: 'note', style: 'margin:0' }, 'Shifrlangan xabarlar xotirada faqat shifrmatn ko‘rinishida saqlanadi.')));
  }
  if (chat) body.append(h('div', { class: 'sep' }), h('button', { class: 'btn danger block', onclick: async () => {
    if (await confirmBox('Chatni o‘chirish', 'Chat va barcha xabarlar ikkala tomon uchun ham butunlay o‘chiriladi.', 'O‘chirish')) { m.close(); deleteChat(chat); }
  } }, 'Chatni o‘chirish'));
}
function setTtl(chat, v) {
  mutChats(c => { if (c[chat.id]) c[chat.id].ttl = v; });
  mutMsgs(chat.id, a => a.push(sysMsg(`⏱ ${S.me.name}: avto-o'chirish — ${ttlLabel(v)}`)));
  renderBanner();
}
function deleteChat(chat) {
  try { localStorage.removeItem('nc:msgs:' + chat.id); } catch {}
  delete DB.cache[chat.id];
  mutChats(c => { delete c[chat.id]; });
}
function openGroupInfo(chat) {
  const owner = chat.createdBy === S.me.id; const body = h('div'); const m = modal('Guruh', body);
  const nameIn = h('input', { class: 'inp', value: chat.name, maxLength: 40, disabled: !owner });
  body.append(h('div', { class: 'profile-hero' }, avatarEl({ id: chat.id, name: chat.name, avatar: chat.avatar }, 84), h('p', {}, `${chat.members.length} a'zo`)));
  if (owner) body.append(field('Guruh nomi', nameIn), h('button', { class: 'btn primary sm', onclick: () => {
    const n = nameIn.value.trim(); if (!n) return;
    mutChats(c => { c[chat.id].name = n; }); toast('Saqlandi', 'ok');
  } }, 'Nomni saqlash'));
  body.append(h('div', { class: 'h4' }, 'A\'zolar'), h('div', { class: 'user-list' }, chat.members.map(id => {
    const u = DB.users[id] || GHOST;
    return h('div', { class: 'user-row', style: 'cursor:pointer', onclick: () => { m.close(); openUserCard(u, null); } },
      avatarEl(u, 40, { dot: true }), h('div', { class: 'grow' }, h('b', {}, u.name + (id === S.me.id ? ' (siz)' : '')), h('small', {}, '@' + u.username)),
      id === chat.createdBy ? h('small', { style: 'color:var(--muted)' }, 'admin') : null);
  })), h('div', { class: 'sep' }),
  h('button', { class: 'btn danger block', onclick: async () => {
    if (!await confirmBox('Guruhdan chiqish', owner && chat.members.length > 1 ? 'Siz admin sifatida chiqsangiz guruh butunlay o‘chiriladi.' : 'Guruhdan chiqmoqchimisiz?', owner ? 'O‘chirish' : 'Chiqish')) return;
    m.close();
    if (owner || chat.members.length <= 2) deleteChat(chat);
    else { mutMsgs(chat.id, a => a.push(sysMsg(`${S.me.name} guruhdan chiqdi`))); mutChats(c => { c[chat.id].members = c[chat.id].members.filter(x => x !== S.me.id); }); }
  } }, owner ? 'Guruhni o‘chirish' : 'Guruhdan chiqish'));
}

/* PIN / vault */
const pinHash = async (pin, salt) => b64e(await C.pbkdf2(pin, b64d(salt), 256, 100000));
function promptPin(title, text, onOk) {
  const inp = h('input', { class: 'inp', type: 'password', inputMode: 'text', placeholder: 'PIN / parol', autocomplete: 'off' });
  const err = h('p', { class: 'form-err' });
  const m = modal(title, h('form', { onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    const r = await onOk(inp.value); if (r === true) m.close(); else err.textContent = r || 'Xato';
  } }, h('p', { class: 'note', style: 'margin:0 0 12px' }, text), inp, err, h('button', { class: 'btn primary block', type: 'submit', style: 'margin-top:8px' }, 'Tasdiqlash')));
}
function askPin(cb) {
  promptPin('🔒 Maxfiy bo‘lim', 'Maxfiy chatlarni ochish uchun PIN kiriting.', async pin => {
    if (await pinHash(pin, S.me.prefs.pin.salt) !== S.me.prefs.pin.hash) return 'PIN noto‘g‘ri';
    S.vault = false; renderMe(); renderList(); cb?.(); return true;
  });
}
function lockVault() {
  if (!hasPin()) return; S.vault = true;
  if (curChat()?.type === 'secret') closeChat();
  renderMe(); renderList();
}
function toggleVault() {
  if (!hasPin()) { toast('Avval Sozlamalar → Xavfsizlik bo‘limida PIN o‘rnating', 'info'); return openSettings(); }
  isLocked() ? askPin() : (lockVault(), toast('Maxfiy bo‘lim qulflandi', 'ok'));
}
function setPinFlow() {
  const a = h('input', { class: 'inp', type: 'password', placeholder: 'Yangi PIN (kamida 4 belgi)', autocomplete: 'off' });
  const b = h('input', { class: 'inp', type: 'password', placeholder: 'PIN ni takrorlang', autocomplete: 'off' });
  const err = h('p', { class: 'form-err' });
  const m = modal('Maxfiy bo‘lim PIN', h('form', { onsubmit: async e => {
    e.preventDefault();
    if (a.value.length < 4) return err.textContent = 'PIN kamida 4 belgi bo‘lsin';
    if (a.value !== b.value) return err.textContent = 'PINlar mos kelmadi';
    const salt = b64e(rnd(16)), hash = await pinHash(a.value, salt);
    mutUsers(u => { u[S.me.id].prefs.pin = { salt, hash }; }); S.vault = false; m.close(); toast('PIN o‘rnatildi', 'ok'); renderMe();
  } }, field('Yangi PIN', a), field('Takrorlang', b), err, h('button', { class: 'btn primary block', type: 'submit' }, 'Saqlash')));
}

/* Sozlamalar */
function openSettings() {
  const u = S.me; const body = h('div'); const m = modal('Profil va sozlamalar', body, { wide: true });
  const panes = { profile: profilePane(m), security: securityPane(m), look: lookPane() };
  const names = { profile: 'Profil', security: 'Xavfsizlik', look: 'Ko‘rinish' };
  const tabs = h('div', { class: 'tabs' }, Object.keys(panes).map((k, i) => h('button', { class: i ? '' : 'on', onclick: ev => {
    [...tabs.children].forEach(b => b.classList.toggle('on', b === ev.currentTarget));
    for (const [pk, el] of Object.entries(panes)) el.classList.toggle('hidden', pk !== k);
  } }, names[k])));
  Object.entries(panes).forEach(([k, el], i) => el.classList.toggle('hidden', i > 0));
  body.append(tabs, ...Object.values(panes));
}
function profilePane(m) {
  const u = S.me; let newAvatar;
  const prev = h('div'); const drawPrev = () => prev.replaceChildren(avatarEl({ ...u, avatar: newAvatar === undefined ? u.avatar : newAvatar }, 84));
  drawPrev();
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
    try { newAvatar = (await imageToDataUrl(e.target.files[0], { max: 256, q: .85, square: true })).img; drawPrev(); } catch (x) { toast(x.message, 'err'); }
  } });
  const name = h('input', { class: 'inp', value: u.name, maxLength: 40 });
  const uname = h('input', { class: 'inp', value: u.username, maxLength: 20 });
  const bio = h('textarea', { class: 'inp', rows: 3, maxLength: 140, placeholder: 'O‘zingiz haqingizda…' }, u.bio || '');
  const status = h('select', { class: 'inp' }, [['online', '🟢 Online'], ['away', '🟡 Uzoqda'], ['busy', '🔴 Band'], ['invisible', '⚫ Ko‘rinmas']].map(([v, l]) => h('option', { value: v, selected: u.status === v }, l)));
  const err = h('p', { class: 'form-err' });
  return h('div', {},
    h('div', { class: 'avatar-edit' }, prev, h('div', { class: 'stack', style: 'margin:0' },
      h('button', { class: 'btn sm', onclick: () => file.click() }, 'Rasm tanlash'),
      h('button', { class: 'btn sm', onclick: () => { newAvatar = null; drawPrev(); } }, 'Olib tashlash'), file)),
    field('Ism', name), field('Username', uname), field('Bio', bio), field('Holat', status), err,
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary', onclick: () => {
        const un = uname.value.trim().toLowerCase(), nm = name.value.trim();
        if (!nm) return err.textContent = 'Ism bo‘sh bo‘lmasin';
        if (!/^[a-z0-9_]{3,20}$/.test(un)) return err.textContent = 'Username: 3–20 belgi, a–z, 0–9, _';
        if (Object.values(DB.users).some(x => x.id !== u.id && x.username === un)) return err.textContent = 'Bu username band';
        mutUsers(all => { const x = all[u.id]; x.name = nm; x.username = un; x.bio = bio.value.trim(); x.status = status.value; if (newAvatar !== undefined) x.avatar = newAvatar; });
        Net.send({ t: 'ping' }); toast('Profil saqlandi', 'ok'); m.close();
      } }, 'Saqlash'),
      h('button', { class: 'btn', onclick: () => { m.close(); logout(); } }, icon('logout', 17), 'Chiqish')));
}
function securityPane(m) {
  const u = S.me;
  const old = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' });
  const nw = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
  const err = h('p', { class: 'form-err' });
  const fpBox = h('div', { class: 'fp-box' }, '…');
  C.fp(u.pub).then(f => fpBox.replaceChildren(identicon(f.bytes), h('div', { class: 'fp' }, f.text)));
  return h('div', {},
    h('div', { class: 'h4' }, 'Mening ochiq kalitim'), fpBox,
    h('p', { class: 'note' }, 'Shaxsiy kalit hech qachon qurilmadan chiqmaydi va parolingiz bilan shifrlangan holda saqlanadi.'),
    h('div', { class: 'h4' }, 'Maxfiy bo‘lim PIN'),
    h('div', { class: 'row-between' }, h('div', {}, 'PIN bilan qulflash', h('small', {}, hasPin() ? 'Faol — 2 daqiqa harakatsizlikdan so‘ng avto-qulf' : 'Maxfiy chatlarni yashiradi')),
      h('div', { class: 'stack', style: 'margin:0' },
        h('button', { class: 'btn sm', onclick: () => { m.close(); hasPin() ? promptPin('PINni o‘zgartirish', 'Avval joriy PINni kiriting.', async p => (await pinHash(p, S.me.prefs.pin.salt)) === S.me.prefs.pin.hash ? (setTimeout(setPinFlow, 50), true) : 'PIN noto‘g‘ri') : setPinFlow(); } }, hasPin() ? 'O‘zgartirish' : 'O‘rnatish'),
        hasPin() ? h('button', { class: 'btn sm danger', onclick: () => { m.close(); promptPin('PINni o‘chirish', 'Tasdiqlash uchun joriy PINni kiriting.', async p => {
          if (await pinHash(p, S.me.prefs.pin.salt) !== S.me.prefs.pin.hash) return 'PIN noto‘g‘ri';
          mutUsers(x => { delete x[S.me.id].prefs.pin; }); S.vault = false; renderMe(); renderList(); toast('PIN o‘chirildi', 'ok'); return true; }); } }, 'O‘chirish') : null)),
    h('div', { class: 'row-between' }, h('div', {}, 'Fokus yo‘qolganda xiralashtirish', h('small', {}, 'Maxfiy chat oyna faol bo‘lmaganda yashirinadi')),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: u.prefs.blur !== false, onchange: e => { updatePrefs({ blur: e.target.checked }); } }), h('i'))),
    h('div', { class: 'h4' }, 'Parolni almashtirish'),
    field('Joriy parol', old), field('Yangi parol (kamida 8 belgi)', nw), err,
    h('button', { class: 'btn primary', onclick: async ev => {
      err.textContent = ''; ev.currentTarget.disabled = true;
      try { await changePassword(old.value, nw.value); old.value = nw.value = ''; toast('Parol yangilandi', 'ok'); } catch (x) { err.textContent = x.message; }
      ev.currentTarget.disabled = false;
    } }, 'Yangilash'),
    h('div', { class: 'sep' }),
    h('button', { class: 'btn danger block', onclick: () => { m.close(); deleteAccountFlow(); } }, 'Akkauntni o‘chirish'));
}
function lookPane() {
  const u = S.me; const sw = h('div', { class: 'swatches' });
  const draw = () => sw.replaceChildren(...['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map(c =>
    h('button', { class: 'swatch' + (S.me.prefs.accent === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => { updatePrefs({ accent: c }); draw(); } })));
  draw();
  const th = h('div', { class: 'seg' }, [['dark', 'Qorong‘u'], ['light', 'Yorug‘'], ['auto', 'Avto']].map(([v, l]) =>
    h('button', { class: u.prefs.theme === v ? 'on' : '', onclick: ev => { [...th.children].forEach(b => b.classList.toggle('on', b === ev.currentTarget)); updatePrefs({ theme: v }); } }, l)));
  return h('div', {}, h('div', { class: 'h4' }, 'Tema'), th, h('div', { class: 'h4' }, 'Asosiy rang'), sw,
    h('div', { class: 'row-between' }, h('div', {}, 'Bildirishnoma tovushi'),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: u.prefs.sound !== false, onchange: e => updatePrefs({ sound: e.target.checked }) }), h('i'))));
}
function updatePrefs(patch) { mutUsers(u => { Object.assign(u[S.me.id].prefs, patch); }); applyPrefs(); updateObscure(); }
async function changePassword(oldP, newP) {
  const u = S.me;
  if (await C.hashPass(oldP, u.authSalt) !== u.authHash) throw new Error('Joriy parol noto‘g‘ri');
  if (newP.length < 8) throw new Error('Yangi parol kamida 8 belgi bo‘lsin');
  const priv = await C.exportJwk(S.myPriv), authSalt = b64e(rnd(16)), wrapSalt = b64e(rnd(16));
  const authHash = await C.hashPass(newP, authSalt);
  const wrapped = await C.seal(await C.wrapKey(newP, wrapSalt), te.encode(JSON.stringify(priv)));
  mutUsers(all => Object.assign(all[u.id], { authSalt, authHash, wrapSalt, wrapped }));
}
async function deleteAccountFlow() {
  const inp = h('input', { class: 'inp', placeholder: S.me.username });
  const m = modal('Akkauntni o‘chirish', h('div', {},
    h('p', { class: 'note', style: 'margin:0 0 12px;font-size:14px' }, `Barcha shaxsiy chatlaringiz o‘chiriladi. Tasdiqlash uchun "${S.me.username}" deb yozing.`), inp,
    h('button', { class: 'btn danger solid block', style: 'margin-top:12px', onclick: () => {
      if (inp.value.trim() !== S.me.username) return toast('Username mos kelmadi', 'err');
      const id = S.me.id; m.close();
      mutChats(c => { for (const ch of Object.values(c)) {
        if (!ch.members.includes(id)) continue;
        if (ch.type !== 'group' || ch.members.length <= 2) { try { localStorage.removeItem('nc:msgs:' + ch.id); } catch {} delete c[ch.id]; }
        else ch.members = ch.members.filter(x => x !== id);
      } });
      mutUsers(u => { delete u[id]; }); logout();
    } }, 'Butunlay o‘chirish')));
}

/* ───────────────────── Botlar (demo suhbatdoshlar) ───────────────────── */
const BOTS = {
  aisha: { name: 'Aisha', bio: 'Doimo yordamga tayyor 🌸', hi: ['Salom! Qalaysiz? 😊', 'Assalomu alaykum! Xush kelibsiz!'], q: ['Qiziq savol! Menimcha, sinab ko‘rgan ma’qul 🙂', 'Hmm, o‘ylab ko‘ray… menimcha ha!'], thanks: ['Arzimaydi! 💜', 'Doim marhamat!'], img: ['Voy, qanday chiroyli rasm! 😍', 'Rasm uchun rahmat, juda yoqdi!'], gen: ['Tushunarli 👍', 'Ha, to‘g‘ri aytasiz!', 'Davom eting, qiziq bo‘ldi 🙂', 'Ajoyib fikr ✨'] },
  sardor: { name: 'Sardor', bio: 'Dasturchi. Kofe ♥ kod ☕', hi: ['Yo, salom! Nima gap?', 'Salom-salom! Kod yozyapsizmi? 😄'], q: ['Bunga Stack Overflow'+'dan oldin o‘zim javob beray: bog‘liq 😅', 'Yaxshi savol — avval testini yozaylik!'], thanks: ['Zo‘r! Kofe bilan hisoblashamiz ☕', 'Ok, doim tayyorman 🤝'], img: ['Screenshot'+'mi? Yoki shunchaki chiroyli rasm 😄', 'Zo‘r kadr! 📸'], gen: ['Mm-hm 🤔', 'Bu ish beradi, ishoning 🚀', 'Commit qilamiz!', 'Kofe vaqti keldi ☕'] },
  nova: { name: 'Nova', bio: 'Maxfiy suhbatlar bo‘yicha AI yordamchi 🛰️', hi: ['Salom, yo‘ldosh. Aloqa o‘rnatildi 🛰️', 'Salom! Kanal xavfsiz.'], q: ['Hisoblab ko‘rdim: javob — ha, ehtimol 92% 🤖', 'Savolingiz qabul qilindi. Javob: bog‘liq.'], thanks: ['Xizmat doim tayyor 🤖', 'Rahmat qabul qilindi ✅'], img: ['Rasm qabul qilindi. Tahlil: chiroyli ✅', 'Piksellar zo‘r 🛰️'], gen: ['Qabul qildim 📡', 'Tushundim. Kanal xavfsiz 🔒', 'Ma’lumot yozib olindi.', 'Davom eting, tinglayapman.'] },
};
async function seedBots() {
  if (Object.values(DB.users).some(u => u.bot)) return;
  const users = {};
  for (const [un, b] of Object.entries(BOTS)) {
    const kp = await C.genKeyPair();
    users['bot_' + un] = { id: 'bot_' + un, bot: true, username: un, name: b.name, bio: b.bio, avatar: null, status: 'online', created: now(), pub: await C.exportJwk(kp.publicKey), botPriv: await C.exportJwk(kp.privateKey), prefs: defaultPrefs() };
  }
  mutUsers(u => Object.assign(u, users));
}
function botReply(bot, text, isImg) {
  const L = BOTS[bot.username], t = (text || '').toLowerCase();
  if (isImg) return pick(L.img);
  if (/salom|assalom|hello|\bhi\b|qalay/.test(t)) return pick(L.hi);
  if (/rahmat|tashakkur|thanks/.test(t)) return pick(L.thanks);
  if (t.includes('?')) return pick(L.q);
  return pick(L.gen);
}
async function botSay(bot, chat, text) {
  const c = DB.chats[chat.id]; if (!c) return;
  const m = await postMsg(c, bot.id, { text }); if (m && S.me) notifyIncoming(c, m);
}
async function botRespond(chat, text, isImg) {
  const bots = chat.members.map(id => DB.users[id]).filter(u => u?.bot); if (!bots.length) return;
  const bot = chat.type === 'group' ? pick(bots) : bots[0];
  await sleep(500 + Math.random() * 500); if (!DB.chats[chat.id]) return;
  markReadBy(chat, bot.id);
  if (Math.random() < .3) { const last = [...DB.getMsgs(chat.id)].reverse().find(m => m.from === S.me.id && !m.deleted && !m.sys); if (last) mutMsgs(chat.id, a => { const x = a.find(y => y.id === last.id); if (x) (x.reactions[pick(['👍', '❤️', '🔥'])] ??= []).push(bot.id); }); }
  await sleep(300); setTyping(chat.id, bot.id);
  await sleep(900 + Math.random() * 1500);
  if (DB.chats[chat.id]) botSay(bot, chat, botReply(bot, text, isImg));
}
async function ensureOnboarding() {
  if (S.me.onboarded) return;
  const me = S.me, mk = (type, peer) => `${type}:${[me.id, peer].sort().join('_')}`;
  const dId = mk('direct', 'bot_aisha'), sId = mk('secret', 'bot_nova'), gId = 'g:welcome_' + me.id;
  mutChats(c => {
    c[dId] ??= { id: dId, type: 'direct', members: [me.id, 'bot_aisha'], created: now(), createdBy: me.id, ttl: 0 };
    c[sId] ??= { id: sId, type: 'secret', members: [me.id, 'bot_nova'], created: now(), createdBy: me.id, ttl: 0 };
    c[gId] ??= { id: gId, type: 'group', name: 'Nebula jamoasi', members: [me.id, 'bot_aisha', 'bot_sardor', 'bot_nova'], created: now(), createdBy: 'bot_sardor' };
  });
  const say = async (id, bot, text) => { await postMsg(DB.chats[id], 'bot_' + bot, { text }); };
  await say(dId, 'aisha', `Nebula Chat'ga xush kelibsiz, ${me.name.split(' ')[0]}! 🎉`);
  await say(dId, 'aisha', 'Bu yerda: 🔒 maxfiy (end-to-end) chatlar, 👥 guruhlar, 🖼 rasmlar, ↩ javoblar, ✏️ tahrirlash, 😍 reaksiyalar, ⏱ avto-o‘chirish va to‘liq profil tizimi bor.');
  await say(dId, 'aisha', 'Haqiqiy suhbatni sinash uchun shu brauzerda yangi oyna oching va boshqa akkaunt yarating — xabarlar real vaqtda keladi 🚀');
  mutMsgs(sId, a => a.push(sysMsg('🔒 Maxfiy chat yaratildi. Kalitlar: ECDH P-256 → HKDF → AES-256-GCM.')));
  await say(sId, 'nova', '🔒 Bu maxfiy chat. Xabarlar qurilmangizda shifrlanadi, saqlashda faqat shifrmatn qoladi. Yuqoridagi ⓘ orqali xavfsizlik raqamini ko‘ring.');
  mutMsgs(gId, a => a.push(sysMsg('👥 Sardor guruhni yaratdi')));
  await say(gId, 'sardor', 'Jamoaga xush kelibsiz! Bu guruh oddiy (shifrlanmagan) chat — maxfiy gaplar uchun 🔒 dan foydalaning.');
  mutMsgs(dId, a => a.forEach(m => { m.readBy = m.readBy.filter(x => x !== me.id); }));
  mutUsers(u => { u[me.id].onboarded = true; });
}

/* ───────────────────── Tarmoq, taymerlar, boot ───────────────────── */
let actx;
function beep() {
  if (S.me?.prefs?.sound === false) return;
  try {
    actx ??= new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.1, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .25);
    o.connect(g).connect(actx.destination); o.start(); o.stop(t + .26);
  } catch {}
}
function notifyIncoming(chat, m) {
  if (!chat.members.includes(S.me.id) || m.from === S.me.id) return;
  if (S.cur === chat.id && !document.hidden && S.focused) return;
  beep();
  if (chat.type === 'secret') return toast(isLocked() ? '🔒 Yangi maxfiy xabar' : `🔒 ${DB.users[m.from]?.name || '?'}: maxfiy xabar`, 'info', () => openChat(chat.id));
  const t = m.img ? '📷 Rasm' : (m.text || '').slice(0, 70);
  toast(`${DB.users[m.from]?.name || '?'}: ${t}`, 'info', () => openChat(chat.id));
}
function handleSync(k, id) {
  if (!S.me) return;
  if (k === 'users') {
    const u = DB.users[S.me.id]; if (!u) return logout();
    S.me = u; renderMe(); renderList(); if (S.cur) renderHeader();
  } else if (k === 'chats') {
    for (const cid of Object.keys(DB.cache)) if (!DB.chats[cid]) delete DB.cache[cid];
    const c = curChat();
    if (S.cur && (!c || !c.members.includes(S.me.id))) { S.cur = null; showEmpty(); toast('Chat o‘chirildi', 'info'); }
    else if (c) { renderHeader(); renderBanner(); }
    renderList();
  } else if (k === 'msgs') {
    if (S.cur === id) { renderMessages(); renderCtxBar(); markRead(); }
    renderList();
  }
}
function onNet(m) {
  if (!S.me) return;
  switch (m.t) {
    case 'sync': {
      if (m.k === 'users') DB.users = LS.get('nc:users', {});
      else if (m.k === 'chats') DB.chats = LS.get('nc:chats', {});
      else if (m.k === 'msgs') {
        const had = DB.cache[m.id]; const prev = new Set((had || []).map(x => x.id));
        delete DB.cache[m.id]; const arr = DB.getMsgs(m.id), chat = DB.chats[m.id];
        if (had && chat) { const fresh = arr.filter(x => !prev.has(x.id) && !x.sys && !x.deleted && x.from !== S.me.id); if (fresh.length) notifyIncoming(chat, fresh[fresh.length - 1]); }
      }
      handleSync(m.k, m.id); break;
    }
    case 'typing': { const c = DB.chats[m.chat]; if (c?.members.includes(S.me.id) && m.uid !== S.me.id) setTyping(m.chat, m.uid); break; }
    case 'hello': Net.send({ t: 'ping' }); // fallthrough
    case 'ping': {
      if (!m.uid) break; const u = DB.users[m.uid], was = u && presenceOf(u);
      S.presence.set(m.uid, now()); if (u && was !== presenceOf(u)) { renderList(); if (S.cur) renderHeader(); } break;
    }
    case 'bye': { S.presence.delete(m.uid); renderList(); if (S.cur) renderHeader(); break; }
  }
}
function startTimers() {
  clearInterval(S.hb); clearInterval(S.tick);
  const beat = () => {
    S.presence.set(S.me.id, now()); Net.send({ t: 'ping' });
    const seen = LS.get('nc:seen', {}); seen[S.me.id] = now(); LS.set('nc:seen', seen);
  };
  beat(); S.hb = setInterval(() => { beat(); renderList(); if (S.cur) renderHeader(); }, 12000);
  S.tick = setInterval(() => {
    updateCountdowns();
    for (const c of myChats()) if (c.type === 'secret') {
      const arr = DB.getMsgs(c.id);
      if (arr.some(m => m.exp && m.exp <= now())) mutMsgs(c.id, a => { for (let i = a.length - 1; i >= 0; i--) if (a[i].exp && a[i].exp <= now()) { S.plain.delete(a[i].id); a.splice(i, 1); } });
    }
    if (hasPin() && !S.vault && now() - S.lastActive > 120000) { lockVault(); toast('Maxfiy bo‘lim avtomatik qulflandi', 'info'); }
  }, 1000);
}
async function enterApp(user) {
  S.me = user; S.me.prefs = { ...defaultPrefs(), ...(user.prefs || {}) }; S.vault = !!user.prefs?.pin;
  S.lastActive = now(); applyPrefs();
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  await ensureOnboarding();
  S.me = DB.users[user.id] || S.me; S.cur = null; showEmpty(); renderMe(); renderList(); startTimers(); Net.send({ t: 'hello' });
}

function bindGlobal() {
  Net.ch && (Net.ch.onmessage = e => { if (e.data.tab !== TAB) onNet(e.data); });
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { S.lastActive = now(); }, { passive: true }));
  window.addEventListener('blur', () => { S.focused = false; updateObscure(); });
  window.addEventListener('focus', () => { S.focused = true; updateObscure(); markRead(); });
  document.addEventListener('visibilitychange', () => { updateObscure(); if (!document.hidden) markRead(); });
  window.addEventListener('beforeunload', () => { if (S.me) { Net.send({ t: 'bye' }); const s = LS.get('nc:seen', {}); s[S.me.id] = now(); LS.set('nc:seen', s); } });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyPrefs());
}

async function boot() {
  if (!subtle) {
    const f = $('#fatal'); f.classList.remove('hidden');
    f.append(h('div', {}, h('h2', {}, '🔐 Xavfsiz muhit kerak'), h('p', { class: 'note' }, 'Shifrlash (WebCrypto) faqat HTTPS yoki localhost orqali ishlaydi. Faylni lokal server (masalan: npx serve) yoki https orqali oching.')));
    return;
  }
  DB.load(); bindAuth(); bindComposer(); bindGlobal(); applyPrefs();
  await seedBots();
  let ses = null; try { ses = JSON.parse(sessionStorage.getItem('nc:session') || 'null'); } catch {}
  if (ses && DB.users[ses.uid]) {
    try { S.myPriv = await C.importPriv(ses.priv); await enterApp(DB.users[ses.uid]); return; } catch {}
  }
  showAuth();
}
boot();

})();
