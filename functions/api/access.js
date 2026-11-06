import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Zero Trust Access: applications, policies and service tokens.
// Needs "Access: Apps and Policies" (+ Service Tokens) account permissions.
const A = (acct) => `/accounts/${acct.accountId}/access`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const [apps, svct] = await Promise.all([
      cfApi(acct, `${A(acct)}/apps?per_page=50`).catch((e) => ({ error: String(e.message || e) })),
      cfApi(acct, `${A(acct)}/service_tokens?per_page=50`).catch(() => null),
    ]);
    if (apps.error) return json({ error: apps.error });
    return json({
      apps: (apps.result || []).map((x) => ({
        id: x.id, name: x.name, domain: x.domain, type: x.type,
        policies: (x.policies || []).map((p) => p.name).filter(Boolean),
        session: x.session_duration || '',
      })),
      serviceTokens: ((svct && svct.result) || []).map((x) => ({ id: x.id, name: x.name, clientId: x.client_id, expires: x.expires_at })),
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
      await cfApi(acct, `${A(acct)}/apps/${url.searchParams.get('id')}`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'access.app-delete', `${acct.name} · 删除 Access 应用`);
    } else if (kind === 'svctoken') {
      await cfApi(acct, `${A(acct)}/service_tokens/${url.searchParams.get('id')}`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'access.svctoken-delete', `${acct.name} · 删除服务令牌`);
    } else return json({ error: '未知类型' }, 400);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
