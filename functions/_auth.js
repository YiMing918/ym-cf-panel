// Shared auth helpers for YM CF Panel.
// KV binding: PANEL_KV. Keys: admin / sess:<sha256(token)> / accounts / settings / cache:*
// 会话键只存令牌的 SHA-256（Cookie 里仍放原文）：KV 读面一旦泄露，键名
// 不再是可直接复用的令牌本体（与 ym-blog 的 token_hash 做法一致）。
// 改键后存量会话查不到、自动失效，站长重登一次即可。
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

// 口令哈希：新哈希一律 PBKDF2-SHA256 100,000 轮（WebCrypto deriveBits）。
// v4.0.4 及以前是单轮 SHA-256(salt:密码)——面板代持 3 个账号的 Edit 令牌，
// 这个强度不匹配。旧哈希保持可验，登录成功后由 login.js 顺手升级（见
// isLegacyHash），站长无需改密码即可完成迁移。
const PBKDF2_ITER = 100000;

async function pbkdf2hex(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = randomToken().slice(0, 16);
  const hash = 'pbkdf2:' + PBKDF2_ITER + ':' + (await pbkdf2hex(password, salt, PBKDF2_ITER));
  return { salt, hash };
}

export function isLegacyHash(admin) {
  return !!(admin && admin.hash && !String(admin.hash).startsWith('pbkdf2:'));
}

export async function verifyPassword(password, admin) {
  if (!admin || !admin.salt || !admin.hash) return false;
  if (String(admin.hash).startsWith('pbkdf2:')) {
    const parts = String(admin.hash).split(':');
    // 迭代次数钳制（与 ym-dash 的 clampIter 同款）：admin 文档被改坏或
    // 被篡改时，天文数字的 iter 会把一次登录拖成 DoS。存量哈希都由
    // 本代码以 PBKDF2_ITER 生成，超出 [10000, 200000] 的只可能是坏数据。
    const iter = Math.min(200000, Math.max(10000, parseInt(parts[1], 10) || PBKDF2_ITER));
    return timingSafeEq(await pbkdf2hex(password, admin.salt, iter), parts[2] || '');
  }
  return timingSafeEq(await sha256hex(admin.salt + ':' + password), admin.hash);
}

export function cookieOf(request) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(/(?:^|;\s*)ymcfp=([a-f0-9]+)/);
  return m ? m[1] : null;
}

export function missingKv(env) { return !env || !env.PANEL_KV; }

export async function getAdmin(env) {
  if (missingKv(env)) throw new Error('PANEL_KV 未绑定：请在 Pages 项目设置里把 KV 绑定名填为 PANEL_KV 后重新部署');
  const raw = await env.PANEL_KV.get('admin');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // admin 文档损坏（写一半、被手工改坏）绝不能静默当成「未初始化」：那会让
    // requireAuth 回 needs_setup，把站长引向重设覆盖、毁掉尚可修复的数据。
    // 显式抛错：登录/鉴权以 500 失败、日志里留下明确原因，照 MAINTENANCE 恢复。
    throw new Error('admin 文档 JSON 损坏：请按 MAINTENANCE.md 的 admin 恢复流程处理（KV 键 admin）');
  }
}

export async function getSession(env, request) {
  const token = cookieOf(request);
  if (!token) return null;
  const raw = await env.PANEL_KV.get('sess:' + (await sha256hex(token)));
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch { return null; } // 会话损坏按未登录处理，不拖垮全站鉴权
  if (!s || typeof s !== 'object') return null;
  return { token, user: s.user, sv: s.sv || 1 };
}

// 会话带版本号 sv：与 admin.sv 对齐才有效。改密码时 sv+1，所有旧会话
// （含别的设备上已登录的）立即失效——v4.0.4 及以前改密不动会话，
// 旧会话能活满 7 天。
export async function createSession(env, user, sv = 1) {
  const token = randomToken();
  await env.PANEL_KV.put('sess:' + (await sha256hex(token)), JSON.stringify({ user, at: Date.now(), sv }), { expirationTtl: 60 * 60 * 24 * 7 });
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
  if (missingKv(env)) return { error: json({ error: 'PANEL_KV 未绑定：请在 Pages 项目设置里把 KV 绑定名填为 PANEL_KV 后重新部署' }, 500) };
  const admin = await getAdmin(env);
  if (!admin) return { error: json({ error: 'needs_setup' }, 428) };
  const sess = await getSession(env, request);
  if (!sess) return { error: json({ error: 'unauthorized' }, 401) };
  if ((sess.sv || 1) !== (admin.sv || 1)) return { error: json({ error: 'unauthorized' }, 401) };
  // 来源校验（纵深防御）：带会话 Cookie 的非 GET 请求若带了 Origin，
  // 必须与本站同源。SameSite=Lax 已挡住经典 CSRF，这里再收一层；
  // 不带 Origin 的客户端（如脚本直调）不受影响。
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === new URL(request.url).host; } catch { ok = false; }
      if (!ok) return { error: json({ error: 'bad_origin' }, 403) };
    }
  }
  return { admin, sess };
}

// 请求体上限 8MB：要容下 R2 面板上传（4MB 文件的 base64 约 5.5MB）与
// Workers 代码上传，又不能让超大/坏 JSON 静默变成 {} 被当成正常参数。
// 空体按 {} 处理（兼容无体调用）；解析失败/超限显式抛带 status 的错，
// 调用方 try/catch 的 fail() 会回对应的 JSON 4xx/413。
export async function readBody(request) {
  const MAX_BODY = 8 * 1024 * 1024;
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw Object.assign(new Error('请求体太大'), { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('请求体太大'), { status: 413 });
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }); }
}
