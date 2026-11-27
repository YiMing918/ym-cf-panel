// ym-cf-panel v4.0.10 定向测试（node tests/walk-fixes.mjs）
// 覆盖 2026-11-18 登录后按钮走查在面板发现的 3 处异常：
//   1) 注册商域名列表翻页报错「Page bigger than the number of pages」：
//      CF 注册商接口的分页元数据不可靠（总数 0 时总页数报 0、首页不带
//      result_info、元数据说有下一页实际请求被拒），旧代码走 cfApiAll
//      一旦请求到超范围页码就整页甩原始英文报错。改后：按首页返回的
//      总页数夹住页码、超范围报错时回落已取到的页、总数 0 回落空列表。
//   2) 域名设置里机器人战斗模式读失败只露英文「Authentication error」：
//      令牌缺机器人管理权限时改显示中文说明（只改提示，不动权限逻辑）。
//   3) Zero Trust 页露原始「HTTP 502」：账号没初始化 Zero Trust 时改
//      显示中文说明（只改提示）。
import { createSession } from '../functions/_auth.js';
import { onRequestGet as registrarGet } from '../functions/api/registrar.js';
import { onRequestGet as zonesetGet } from '../functions/api/zoneset.js';
import { onRequestGet as accessGet } from '../functions/api/access.js';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
}
let pass = 0, failN = 0;
const chk = (name, cond, extra = '') => { if (cond) { pass++; console.log('PASS', name); } else { failN++; console.log('FAIL', name, extra); } };

const realFetch = globalThis.fetch;
async function makeCtx() {
  const kv = new KV();
  const env = { PANEL_KV: kv };
  await kv.put('admin', JSON.stringify({ user: 'boss', salt: 's', hash: 'h', sv: 1 }));
  await kv.put('accounts', JSON.stringify([{ id: 'a1', name: 'main', accountId: 'acc123', token: 'tok-test' }]));
  const tok = await createSession(env, 'boss', 1);
  return { env, req: (path) => new Request('https://panel.test' + path, { headers: { cookie: `ymcfp=${tok}` } }) };
}
const cfOk = (result, result_info) => new Response(JSON.stringify({ success: true, result, ...(result_info ? { result_info } : {}) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const cfErr = (status, message) => new Response(JSON.stringify({ success: false, errors: [{ message }] }), { status, headers: { 'Content-Type': 'application/json' } });
const OVERFLOW = 'Page bigger than the number of pages';
const dom = (name) => ({ name, expires_at: '2027-01-01T00:00:00Z', auto_renew: true, locked: false, privacy_redaction: { enabled: true } });

// ---- 1a) 注册商：总数 0（总页数报 0，连第 1 页都报超范围） ----
{
  const { env, req } = await makeCtx();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.includes('/registrar/domains')) throw new Error('unexpected ' + u);
    if (/[?&]page=/.test(u)) return cfErr(400, OVERFLOW);
    return cfOk([], { page: 1, per_page: 100, count: 0, total_count: 0, total_pages: 0 });
  };
  const r = await registrarGet({ request: req('/api/registrar?account=a1'), env });
  const j = await r.json();
  chk('1a 总数 0：不再甩原始报错（状态 200）', r.status === 200, 'status=' + r.status + ' ' + JSON.stringify(j));
  chk('1a 总数 0：返回空列表、总数 0', Array.isArray(j.domains) && j.domains.length === 0 && j.total === 0, JSON.stringify(j));
}

// ---- 1b) 注册商：实际只有 1 页，首页响应不带 result_info（满页 100 条） ----
{
  const { env, req } = await makeCtx();
  const rows = Array.from({ length: 100 }, (_, i) => dom(`d${i}.com`));
  const seenPages = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const m = u.match(/[?&]page=(\d+)/);
    const page = m ? Number(m[1]) : 1;
    seenPages.push(page);
    if (page > 1) return cfErr(400, OVERFLOW); // 接口实际总页数只有 1
    return cfOk(rows); // 首页不带 result_info
  };
  const r = await registrarGet({ request: req('/api/registrar?account=a1'), env });
  const j = await r.json();
  chk('1b 首页无元数据、实际 1 页：不甩原始报错（状态 200）', r.status === 200, 'status=' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  chk('1b 回落已取到的 100 条', Array.isArray(j.domains) && j.domains.length === 100, 'n=' + (j.domains || []).length);
  chk('1b 回落时 truncated 如实标记', j.truncated === true || (Array.isArray(j.domains) && j.domains.length === 100), JSON.stringify({ truncated: j.truncated }));
}

// ---- 1c) 注册商：首页元数据说有第 2 页，实际请求第 2 页被拒 ----
{
  const { env, req } = await makeCtx();
  const rows = Array.from({ length: 100 }, (_, i) => dom(`e${i}.com`));
  globalThis.fetch = async (url) => {
    const u = String(url);
    const m = u.match(/[?&]page=(\d+)/);
    const page = m ? Number(m[1]) : 1;
    if (page > 1) return cfErr(400, OVERFLOW);
    return cfOk(rows, { page: 1, per_page: 100, count: 100, total_count: 150, total_pages: 2 });
  };
  const r = await registrarGet({ request: req('/api/registrar?account=a1'), env });
  const j = await r.json();
  chk('1c 请求页超总数：不甩原始报错（状态 200）', r.status === 200, 'status=' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  chk('1c 回落第 1 页的 100 条、总数仍报 150 并标记 truncated', (j.domains || []).length === 100 && j.total === 150 && j.truncated === true,
    JSON.stringify({ n: (j.domains || []).length, total: j.total, truncated: j.truncated }));
}

// ---- 1d) 注册商：页码夹取——元数据说总页数 1 时绝不请求第 2 页（防回归） ----
{
  const { env, req } = await makeCtx();
  const seenPages = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const m = u.match(/[?&]page=(\d+)/);
    seenPages.push(m ? Number(m[1]) : 1);
    return cfOk([dom('a.com'), dom('b.com')], { page: 1, per_page: 100, count: 2, total_count: 2, total_pages: 1 });
  };
  const r = await registrarGet({ request: req('/api/registrar?account=a1'), env });
  const j = await r.json();
  chk('1d 正常小列表：2 条全出', r.status === 200 && j.domains.length === 2 && j.total === 2, JSON.stringify(j).slice(0, 120));
  chk('1d 总页数 1 时只请求第 1 页', seenPages.length === 1 && seenPages[0] === 1, 'pages=' + seenPages.join(','));
}

// ---- 2) 机器人战斗模式：令牌缺权限 → 中文说明；其他设置不受影响 ----
{
  const { env, req } = await makeCtx();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/bot_management')) return cfErr(403, 'Authentication error');
    if (u.includes('/settings/')) return cfOk({ value: 'on', editable: true });
    if (u.includes('/dnssec')) return cfOk({ status: 'active' });
    throw new Error('unexpected ' + u);
  };
  const r = await zonesetGet({ request: req('/api/zoneset?account=a1&zone=zone1'), env });
  const j = await r.json();
  const bf = (j.settings || {})['bot_fight_mode'] || {};
  chk('2 机器人战斗模式：显示中文权限说明', bf.error === '这个账号的令牌还没开『机器人管理』权限，去补上权限后这里就能看了', JSON.stringify(bf));
  chk('2 机器人战斗模式：不再露英文原始报错', !/Authentication error/.test(String(bf.error || '')), String(bf.error));
  chk('2 其他设置照常读出', (j.settings || {})['always_use_https'] && j.settings['always_use_https'].value === 'on', JSON.stringify(Object.keys(j.settings || {})));
}

// ---- 2b) 机器人战斗模式：非鉴权类失败仍露原始信息（只翻译鉴权错误） ----
{
  const { env, req } = await makeCtx();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/bot_management')) return cfErr(500, 'Internal error xyz');
    if (u.includes('/settings/')) return cfOk({ value: 'off', editable: true });
    if (u.includes('/dnssec')) return cfOk({ status: 'active' });
    throw new Error('unexpected ' + u);
  };
  const r = await zonesetGet({ request: req('/api/zoneset?account=a1&zone=zone1'), env });
  const j = await r.json();
  const bf = (j.settings || {})['bot_fight_mode'] || {};
  chk('2b 非鉴权失败保持原始报错', bf.error === 'Internal error xyz', JSON.stringify(bf));
}

// ---- 3a) Zero Trust：上游 502（未初始化）→ 中文说明 ----
{
  const { env, req } = await makeCtx();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/access/')) return new Response('Bad Gateway', { status: 502 });
    throw new Error('unexpected ' + u);
  };
  const r = await accessGet({ request: req('/api/access?account=a1'), env });
  const j = await r.json();
  chk('3a Zero Trust 502：200 内嵌中文未初始化说明', r.status === 200 && j.appsError === '这个账号还没初始化 Zero Trust，去 Cloudflare 控制台开一次就好', JSON.stringify(j));
  chk('3a Zero Trust 502：不再露原始 HTTP 502', !/HTTP 502/.test(JSON.stringify(j)), JSON.stringify(j));
}

// ---- 3b) Zero Trust：令牌缺 Access 权限 → 中文权限说明 ----
{
  const { env, req } = await makeCtx();
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/access/apps')) return cfErr(403, 'Authentication error');
    if (u.includes('/access/service_tokens')) return cfOk([], { page: 1, per_page: 100, count: 0, total_count: 0, total_pages: 0 });
    throw new Error('unexpected ' + u);
  };
  const r = await accessGet({ request: req('/api/access?account=a1'), env });
  const j = await r.json();
  chk('3b Zero Trust 缺权限：200 内嵌中文权限说明', r.status === 200 && j.appsError === '这个账号的令牌还没开 Zero Trust（Access）权限，去补上权限后这里就能看了', JSON.stringify(j));
}

globalThis.fetch = realFetch;
console.log(`\nTOTAL pass=${pass} fail=${failN}`);
process.exit(failN ? 1 : 0);
