// Shared auth helpers for YM CF Panel.
// KV binding: PANEL_KV. Keys: admin / sess:<token> / accounts / settings / cache:*
const enc = new TextEncoder();

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  const salt = randomToken().slice(0, 16);
  const hash = await sha256hex(salt + ':' + password);
  return { salt, hash };
}

export async function verifyPassword(password, admin) {
  if (!admin || !admin.salt || !admin.hash) return false;
  return (await sha256hex(admin.salt + ':' + password)) === admin.hash;
}

export function cookieOf(request) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(/(?:^|;\s*)ymcfp=([a-f0-9]+)/);
  return m ? m[1] : null;
}

export async function getAdmin(env) {
  const raw = await env.PANEL_KV.get('admin');
  return raw ? JSON.parse(raw) : null;
}

export async function getSession(env, request) {
  const token = cookieOf(request);
  if (!token) return null;
  const raw = await env.PANEL_KV.get('sess:' + token);
  if (!raw) return null;
  return { token, user: JSON.parse(raw).user };
}

export async function createSession(env, user) {
  const token = randomToken();
  await env.PANEL_KV.put('sess:' + token, JSON.stringify({ user, at: Date.now() }), { expirationTtl: 60 * 60 * 24 * 7 });
  return token;
}

export function sessionCookie(token) {
  return `ymcfp=${token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie() {
  return 'ymcfp=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export async function requireAuth(env, request) {
  const admin = await getAdmin(env);
  if (!admin) return { error: json({ error: 'needs_setup' }, 428) };
  const sess = await getSession(env, request);
  if (!sess) return { error: json({ error: 'unauthorized' }, 401) };
  return { admin, sess };
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}
