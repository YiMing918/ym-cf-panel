import { getAdmin, verifyPassword, hashPassword, isLegacyHash, createSession, sessionCookie, json, readBody } from '../_auth.js';

// 登录失败限流：同来源 IP 15 分钟内失败 >=5 次锁定 15 分钟（计数存 PANEL_KV，与博客同口径）
// 另加全局失败计数：不做全局硬锁定（那会让攻击者能把站长本人锁在门外），
// 改为全局失败攒高后给每次尝试加渐进延迟，拖慢分布式爆破。
async function rlState(env, key) {
  try { return JSON.parse((await env.PANEL_KV.get(key)) || 'null'); } catch { return null; }
}
const WIN = 15 * 60 * 1000;
export async function onRequestPost({ request, env }) {
  const admin = await getAdmin(env);
  if (!admin) return json({ error: 'needs_setup' }, 428);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const st = await rlState(env, 'rl:login:' + ip);
  if (st && st.lockUntil && st.lockUntil > Date.now()) return json({ error: '登录尝试过于频繁，请 15 分钟后再试' }, 429);
  const gst = await rlState(env, 'rl:login:global');
  const now0 = Date.now();
  const gfails = gst && gst.winStart && now0 - gst.winStart <= WIN ? (gst.fails || 0) : 0;
  if (gfails >= 20) await new Promise((r) => setTimeout(r, Math.min(2000, (gfails - 19) * 100)));
  const { user, password } = await readBody(request);
  if (String(user || '').trim() !== admin.user || !(await verifyPassword(String(password || ''), admin))) {
    const now = Date.now();
    const r = st && st.winStart && now - st.winStart <= WIN ? st : { fails: 0, winStart: now, lockUntil: 0 };
    r.fails = (r.fails || 0) + 1;
    if (r.fails >= 5) r.lockUntil = now + 15 * 60 * 1000;
    await env.PANEL_KV.put('rl:login:' + ip, JSON.stringify(r), { expirationTtl: 2 * 24 * 3600 });
    const g = gst && gst.winStart && now - gst.winStart <= WIN ? gst : { fails: 0, winStart: now };
    g.fails = (g.fails || 0) + 1;
    await env.PANEL_KV.put('rl:login:global', JSON.stringify(g), { expirationTtl: 2 * 24 * 3600 });
    return json({ error: '账号或密码不对' }, 401);
  }
  await env.PANEL_KV.delete('rl:login:' + ip);
  // 旧版单轮 SHA-256 哈希在登录成功时顺手升级为 PBKDF2（站长无感、无需改密）
  let adm = admin;
  if (isLegacyHash(admin)) {
    try {
      const { salt, hash } = await hashPassword(String(password || ''));
      adm = { ...admin, salt, hash };
      await env.PANEL_KV.put('admin', JSON.stringify(adm));
    } catch { /* 升级失败不阻塞登录，下次再试 */ }
  }
  const token = await createSession(env, adm.user, adm.sv || 1);
  return json({ ok: true, user: adm.user }, 200, { 'Set-Cookie': sessionCookie(token) });
}
