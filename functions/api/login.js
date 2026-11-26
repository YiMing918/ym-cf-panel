import { getAdmin, verifyPassword, hashPassword, isLegacyHash, createSession, sessionCookie, json, readBody, timingSafeEq} from '../_auth.js';

// 登录失败限流：同来源 IP 15 分钟内失败 >=5 次锁定 15 分钟；另加全局
// 失败计数——不做全局硬锁定（那会让攻击者能把站长本人锁在门外），改
// 为全局失败攒高后给每次尝试加渐进延迟（最高 2 秒），拖慢分布式爆破。
// 语义与旧版（KV 计数）完全一致，只有计数存放位置变了：
// 计数改存进程内存（按 isolate），不再写 KV。旧版每失败
// 一次写 2 笔 KV（rl:login:<ip> + rl:login:global），攻击者换着 IP
// 失败约 500 次就能烧光全账号 1000 次/天的免费写额度，连累同账号
// 所有项目。内存计数是尽力而为：每个 isolate 独立计数、冷启动/回收
// 即清零——对单人面板挡爆破足够（与 ym-nav 当年的同款改法一致），
// 且限流器再也烧不掉写额度。成功登录清掉本 IP 计数也在内存里做。
const WIN = 15 * 60 * 1000;
const ipFails = new Map(); // ip -> { fails, winStart, lockUntil}
let gFails = { fails: 0, winStart: 0}; // 全局失败计数（单值，无需 Map）

function ipState(ip, now) {
const r = ipFails.get(ip);
if (r && r.lockUntil && r.lockUntil > now) return r; // 锁定期不受窗口截断：锁定从触发时刻起算整 15 分钟（旧写法窗口一过锁就提前解开，失败摊到窗口尾部时实际只锁约 1 分钟）
return r && r.winStart && now - r.winStart <= WIN? r: null;
}
function recordIpFail(ip, now) {
const r = ipState(ip, now) || { fails: 0, winStart: now, lockUntil: 0};
r.fails = (r.fails || 0) + 1;
if (r.fails >= 5) r.lockUntil = now + 15 * 60 * 1000;
ipFails.set(ip, r);
// 顺手清理过期条目，防 Map 无限长（换 IP 攻击会灌入大量条目）
if (ipFails.size > 1000) {
for (const [k, v] of ipFails) {
if ((!v.lockUntil || v.lockUntil <= now) && now - (v.winStart || 0) > WIN) ipFails.delete(k);
}
}
}
function globalFails(now) {
return gFails.winStart && now - gFails.winStart <= WIN? (gFails.fails || 0): 0;
}
function recordGlobalFail(now) {
if (!gFails.winStart || now - gFails.winStart > WIN) gFails = { fails: 0, winStart: now};
gFails.fails = (gFails.fails || 0) + 1;
}

export async function onRequestPost({ request, env}) {
if (!env.PANEL_KV) return json({ error: 'PANEL_KV 未绑定：请在 Pages 项目设置里把 KV 绑定名填为 PANEL_KV 后重新部署'}, 500);
const admin = await getAdmin(env);
if (!admin) return json({ error: 'needs_setup'}, 428);
const ip = request.headers.get('cf-connecting-ip') || 'unknown';
const now0 = Date.now();
const st = ipState(ip, now0);
if (st && st.lockUntil && st.lockUntil > now0) return json({ error: '登录尝试过于频繁，请 15 分钟后再试'}, 429);
const gfails = globalFails(now0);
if (gfails >= 20) await new Promise((r) => setTimeout(r, Math.min(2000, (gfails - 19) * 100)));
let _lb; try { _lb = await readBody(request); } catch (e) { return json({ error: e.message}, e.status || 400); }
const { user, password} = _lb;
// 用户名与口令分开验：用户名不对时也照样对管理员盐跑
// 一遍口令哈希再判失败，避免「用户名错 → 立刻返回、用户名对 → 慢」
// 的耗时差把真实用户名漏出去（旧版是 || 短路，用户名错时不跑哈希）。
// 用户名本身也用定长比较：=== 是短路比较，首字符不同就立刻返回，
// 与上面的口径对齐（口令哈希占耗时大头，实际风险低，顺手补齐）。
const userOk = timingSafeEq(String(user || '').trim(), String(admin.user || ''));
const passOk = await verifyPassword(String(password || ''), admin);
if (!userOk ||!passOk) {
const now = Date.now();
recordIpFail(ip, now);
recordGlobalFail(now);
return json({ error: '账号或密码不对'}, 401);
}
ipFails.delete(ip);
// 旧版单轮 SHA-256 哈希在登录成功时顺手升级为 PBKDF2（站长无感、无需改密）
let adm = admin;
if (isLegacyHash(admin)) {
try {
const { salt, hash} = await hashPassword(String(password || ''));
adm = {...admin, salt, hash};
await env.PANEL_KV.put('admin', JSON.stringify(adm));
} catch { /* 升级失败不阻塞登录，下次再试 */}
}
const token = await createSession(env, adm.user, adm.sv || 1);
return json({ ok: true, user: adm.user}, 200, { 'Set-Cookie': sessionCookie(token)});
}
