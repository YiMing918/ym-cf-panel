import { getAdmin, hashPassword, createSession, sessionCookie, json, readBody } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const existing = await getAdmin(env);
  if (existing) return json({ error: 'already_setup' }, 409);
  const { user, password } = await readBody(request);
  const u = String(user || '').trim();
  const p = String(password || '');
  if (!u || p.length < 4) return json({ error: '账号必填，密码至少 4 位' }, 400);
  const { salt, hash } = await hashPassword(p);
  await env.PANEL_KV.put('admin', JSON.stringify({ user: u, salt, hash, createdAt: Date.now() }));
  const token = await createSession(env, u);
  return json({ ok: true, user: u }, 200, { 'Set-Cookie': sessionCookie(token) });
}
