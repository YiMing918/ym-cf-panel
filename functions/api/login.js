import { getAdmin, verifyPassword, createSession, sessionCookie, json, readBody } from '../_auth.js';

// 登录失败限流：同来源 IP 15 分钟内失败 >=5 次锁定 15 分钟（计数存 PANEL_KV，与博客同口径）
async function rlState(env, ip) {
  try { return JSON.parse((await env.PANEL_KV.get('rl:login:' + ip)) || 'null'); } catch { return null; }
}
export async function onRequestPost({ request, env }) {
  const admin = await getAdmin(env);
  if (!admin) return json({ error: 'needs_setup' }, 428);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const st = await rlState(env, ip);
  if (st && st.lockUntil && st.lockUntil > Date.now()) return json({ error: '登录尝试过于频繁，请 15 分钟后再试' }, 429);
  const { user, password } = await readBody(request);
  if (String(user || '').trim() !== admin.user || !(await verifyPassword(String(password || ''), admin))) {
    const now = Date.now();
    const r = st && st.winStart && now - st.winStart <= 15 * 60 * 1000 ? st : { fails: 0, winStart: now, lockUntil: 0 };
    r.fails = (r.fails || 0) + 1;
    if (r.fails >= 5) r.lockUntil = now + 15 * 60 * 1000;
    await env.PANEL_KV.put('rl:login:' + ip, JSON.stringify(r), { expirationTtl: 2 * 24 * 3600 });
    return json({ error: '账号或密码不对' }, 401);
  }
  await env.PANEL_KV.delete('rl:login:' + ip);
  const token = await createSession(env, admin.user);
  return json({ ok: true, user: admin.user }, 200, { 'Set-Cookie': sessionCookie(token) });
}
