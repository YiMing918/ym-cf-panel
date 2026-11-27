import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Zero Trust Access: applications, policies and service tokens.
// Needs "Access: Apps and Policies" (+ Service Tokens) account permissions.
const A = (acct) => `/accounts/${acct.accountId}/access`;

// The apps list is the first thing this page loads, and on an account
// whose Zero Trust was never initialized the upstream API fails with a
// bare 502 — the panel used to relay that as a raw "HTTP 502"
// (2026-11-18 button-walk finding). Translate the known failure shapes
// into plain Chinese hints; anything else keeps the original message.
// Wording only — initializing Zero Trust happens in the CF dashboard,
// and the permission is granted on the token, neither from here.
export const ZT_NOT_INIT_HINT = '这个账号还没初始化 Zero Trust，去 Cloudflare 控制台开一次就好';
export const ZT_PERM_HINT = '这个账号的令牌还没开 Zero Trust（Access）权限，去补上权限后这里就能看了';
export function friendlyAccessError(e) {
  const msg = String((e && (e.message || e.error)) || e);
  const s = (e && e.status) || 0;
  if (s === 502 || /bad gateway/i.test(msg)) return ZT_NOT_INIT_HINT;
  if (s === 401 || s === 403 || /auth|unauthori|forbidden|permission/i.test(msg)) return ZT_PERM_HINT;
  if (s === 404 || /not found/i.test(msg)) return ZT_NOT_INIT_HINT;
  return msg;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const [apps, svct] = await Promise.all([
      cfApiAll(acct, `${A(acct)}/apps`).catch((e) => ({ error: String(e.message || e), status: (e && e.status) || 0 })),
      cfApiAll(acct, `${A(acct)}/service_tokens`).catch((e) => ({ error: String(e.message || e), status: (e && e.status) || 0 })),
    ]);
    // Apps 拉失败（未初始化 Zero Trust 的账号上游直接 502 等）不再回
    // HTTP 502——那一层到了浏览器只剩一句裸的「HTTP 502」，看不出原因。
    // 改成 200 + appsError 内嵌提示（与 serviceTokensError 同口径），
    // 前端原样展示中文原因（2026-11-27 逐按钮实测发现）。
    const appsError = apps.error ? friendlyAccessError(apps) : '';
    return json({
      appsError,
      apps: appsError ? [] : (apps.result || []).map((x) => ({
        id: x.id, name: x.name, domain: x.domain, type: x.type,
        policies: (x.policies || []).map((p) => p.name).filter(Boolean),
        session: x.session_duration || '',
      })),
      serviceTokens: ((svct && svct.result) || []).map((x) => ({ id: x.id, name: x.name, clientId: x.client_id, expires: x.expires_at })),
      appsTotal: appsError ? 0 : (apps.result_info ? apps.result_info.total_count : (apps.result || []).length), appsTruncated: !appsError && !!(apps.result_info && apps.result_info.truncated),
      serviceTokensTotal: svct && svct.result_info ? svct.result_info.total_count : ((svct && svct.result) || []).length, serviceTokensTruncated: !!(svct && svct.result_info && svct.result_info.truncated),
      // 拉失败要如实标注，别让前端把「缺权限」显示成「暂无服务令牌」
      serviceTokensError: svct && svct.error ? friendlyAccessError(svct) : '',
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'app-create') {
      const name = String(b.name || '').trim();
      const domain = String(b.domain || '').trim();
      const emails = String(b.emails || '').split(/[,\s]+/).filter(Boolean);
      if (!name || !domain) return json({ error: '应用名和域名都要填' }, 400);
      if (!emails.length) return json({ error: '至少填一个允许登录的邮箱' }, 400);
      await cfApi(acct, `${A(acct)}/apps`, {
        method: 'POST',
        body: JSON.stringify({
          name, domain, type: 'self_hosted', session_duration: '24h',
          policies: [{ name: 'allow-emails', decision: 'allow', include: emails.map((email) => ({ email: { email } })) }],
        }),
      });
      await addAudit(env, a.sess.user, 'access.app-create', `${acct.name} · ${name} (${domain})`);
      return json({ ok: true });
    }
    if (b.what === 'svctoken-create') {
      const name = String(b.name || '').trim() || 'panel-token';
      const d = await cfApi(acct, `${A(acct)}/service_tokens`, { method: 'POST', body: JSON.stringify({ name }) });
      await addAudit(env, a.sess.user, 'access.svctoken-create', `${acct.name} · ${name}`);
      // Secrets are shown once to the logged-in admin.
      return json({ ok: true, clientId: d.result && d.result.client_id, clientSecret: d.result && d.result.client_secret });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const kind = url.searchParams.get('kind');
    if (kind === 'app') {
      await cfApi(acct, `${A(acct)}/apps/${encodeURIComponent(url.searchParams.get('id') || '')}`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'access.app-delete', `${acct.name} · 删除 Access 应用`);
    } else if (kind === 'svctoken') {
      await cfApi(acct, `${A(acct)}/service_tokens/${encodeURIComponent(url.searchParams.get('id') || '')}`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'access.svctoken-delete', `${acct.name} · 删除服务令牌`);
    } else return json({ error: '未知类型' }, 400);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
