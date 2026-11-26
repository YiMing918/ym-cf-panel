import { getAdmin, hashPassword, sha256hex, timingSafeEq, missingKv, createSession, sessionCookie, json, readBody } from '../_auth.js';

// SETUP_TOKEN 失败限流（内存计数，口径同 login.js：同 IP 15 分钟失败
// >=5 次锁定 15 分钟；不写 KV，免得限流器反过来烧免费写额度）。
const WIN = 15 * 60 * 1000;
const fails = new Map();
function locked(ip, now) {
  const r = fails.get(ip);
  return !!(r && r.lockUntil > now); // 只看 lockUntil 本身：窗口判定会把锁截断到窗口结束（同 login.js 的修法）
}
function recordFail(ip, now) {
  const r = fails.get(ip);
  const cur = (r && now - r.winStart <= WIN) ? r : { n: 0, winStart: now, lockUntil: 0 };
  cur.n += 1;
  if (cur.n >= 5) cur.lockUntil = now + WIN;
  fails.set(ip, cur);
  if (fails.size > 1000) for (const [k, v] of fails) if ((!v.lockUntil || v.lockUntil <= now) && now - v.winStart > WIN) fails.delete(k);
}

export async function onRequestPost({ request, env }) {
  if (missingKv(env)) return json({ error: 'PANEL_KV 未绑定：请在 Pages 项目设置里把 KV 绑定名填为 PANEL_KV 后重新部署' }, 500);
  const existing = await getAdmin(env);
  if (existing) return json({ error: 'already_setup' }, 409);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  if (locked(ip, now)) return json({ error: '尝试过于频繁，请 15 分钟后再试' }, 429);
  let body;
  try { body = await readBody(request); } catch (e) { return json({ error: e.message }, e.status || 400); }
  // 防抢注：部署时若在 Pages 后台配了 SETUP_TOKEN（加密变量），首次设置
  // 必须带对它，部署完成到站长打开页面之间的窗口里别人猜到地址也设不了。
  // 没配这个变量时维持原行为（靠"尽快完成首次设置"），向后兼容。
  if (env.SETUP_TOKEN) {
    const given = await sha256hex(String(body.setupToken || ''));
    const want = await sha256hex(String(env.SETUP_TOKEN));
    // 双方都是定长 SHA-256 哈希，用恒时比较，避免按字节短路的时序侧信道
    if (!timingSafeEq(given, want)) { recordFail(ip, Date.now()); return json({ error: '需要正确的设置口令（SETUP_TOKEN）' }, 403); }
  }
  const u = String(body.user || '').trim();
  const p = String(body.password || '');
  if (!u || p.length < 10) return json({ error: '账号必填，密码至少 10 位' }, 400);
  const { salt, hash } = await hashPassword(p);
  // 写前重读：判空与落盘之间隔着哈希计算，并发首设可能双双通过判空；
  // 落盘前再确认一次 admin 仍不存在，已存在就放弃本次写入。
  const again = await getAdmin(env);
  if (again) return json({ error: 'already_setup' }, 409);
  await env.PANEL_KV.put('admin', JSON.stringify({ user: u, salt, hash, sv: 1, createdAt: Date.now() }));
  const token = await createSession(env, u, 1);
  return json({ ok: true, user: u }, 200, { 'Set-Cookie': sessionCookie(token) });
}
