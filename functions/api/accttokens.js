import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Account-owned API tokens: list / create / delete, using Cloudflare's
// permission groups. Needs the "API Tokens" account permission (Edit).
// The panel's own token is just a user token and is NOT listed here.
const A = (acct) => `/accounts/${acct.accountId}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    if (url.searchParams.get('what') === 'groups') {
      const d = await cfApi(acct, `${A(acct)}/tokens/permission_groups`);
      return json({ groups: (d.result || []).map((g) => ({ id: g.id, name: g.name, scopes: g.scopes || [] })) });
    }
    const d = await cfApi(acct, `${A(acct)}/tokens?per_page=50`);
    return json({
      tokens: (d.result || []).map((t) => ({
        id: t.id, name: t.name, status: t.status, issued: t.issued_on, modified: t.modified_on, lastUsed: t.last_used_on,
        policies: (t.policies || []).length,
      })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const name = String(b.name || '').trim();
    const groupIds = Array.isArray(b.groupIds) ? b.groupIds : [];
    if (!name) return json({ error: '令牌名不能为空' }, 400);
    if (!groupIds.length) return json({ error: '至少选一个权限组' }, 400);
    const resource = { [`com.cloudflare.api.account.${acct.accountId}`]: '*' };
    const d = await cfApi(acct, `${A(acct)}/tokens`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        policies: [{ effect: 'allow', resources: resource, permission_groups: groupIds.map((id) => ({ id })) }],
      }),
    });
    await addAudit(env, a.sess.user, 'token.create', `${acct.name} · 新建账号令牌 ${name}`);
    // The token value is returned ONCE to the logged-in admin.
    return json({ ok: true, value: d.result && d.result.value, id: d.result && d.result.id });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${A(acct)}/tokens/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'token.delete', `${acct.name} · 删除账号令牌`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
