import { getAdmin, hashPassword, sha256hex, createSession, sessionCookie, json, readBody } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const existing = await getAdmin(env);
  if (existing) return json({ error: 'already_setup' }, 409);
  const body = await readBody(request);
  // 防抢注：部署时若在 Pages 后台配了 SETUP_TOKEN（加密变量），首次设置
  // 必须带对它，部署完成到站长打开页面之间的窗口里别人猜到地址也设不了。
  // 没配这个变量时维持原行为（靠"尽快完成首次设置"），向后兼容。
  if (env.SETUP_TOKEN) {
    const given = await sha256hex(String(body.setupToken || ''));
    const want = await sha256hex(String(env.SETUP_TOKEN));
    if (given !== want) return json({ error: '需要正确的设置口令（SETUP_TOKEN）' }, 403);
  }
  const u = String(body.user || '').trim();
  const p = String(body.password || '');
  if (!u || p.length < 10) return json({ error: '账号必填，密码至少 10 位' }, 400);
  const { salt, hash } = await hashPassword(p);
  await env.PANEL_KV.put('admin', JSON.stringify({ user: u, salt, hash, sv: 1, createdAt: Date.now() }));
  const token = await createSession(env, u, 1);
  return json({ ok: true, user: u }, 200, { 'Set-Cookie': sessionCookie(token) });
}
