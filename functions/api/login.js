import { getAdmin, verifyPassword, createSession, sessionCookie, json, readBody } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const admin = await getAdmin(env);
  if (!admin) return json({ error: 'needs_setup' }, 428);
  const { user, password } = await readBody(request);
  if (String(user || '').trim() !== admin.user || !(await verifyPassword(String(password || ''), admin))) {
    return json({ error: '账号或密码不对' }, 401);
  }
  const token = await createSession(env, admin.user);
  return json({ ok: true, user: admin.user }, 200, { 'Set-Cookie': sessionCookie(token) });
}
