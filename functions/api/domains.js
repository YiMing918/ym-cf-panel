import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Zone settings (SSL mode) + Pages project custom domains.
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const what = url.searchParams.get('what');
    if (what === 'ssl') {
      const data = await cfApi(acct, `/zones/${url.searchParams.get('zone')}/settings/ssl`);
      return json({ ssl: data.result && data.result.value });
    }
    if (what === 'pagesdomains') {
      const data = await cfApi(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(url.searchParams.get('project'))}/domains`);
      return json({ domains: (data.result || []).map((d) => ({ name: d.name, status: d.status })) });
    }
    return json({ error: '未知查询' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'ssl') {
      const mode = ['off', 'flexible', 'full', 'strict'].includes(b.mode) ? b.mode : null;
      if (!mode) return json({ error: 'SSL 模式不对' }, 400);
      await cfApi(acct, `/zones/${b.zone}/settings/ssl`, { method: 'PATCH', body: JSON.stringify({ value: mode }) });
      await addAudit(env, a.sess.user, 'domain.post', acct.name);
      return json({ ok: true });
    }
    if (b.what === 'pagesdomain-add') {
      const name = String(b.name || '').trim();
      if (!name) return json({ error: '域名不能为空' }, 400);
      await cfApi(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(b.project)}/domains`, { method: 'POST', body: JSON.stringify({ name }) });
      await addAudit(env, a.sess.user, 'domain.post', acct.name);
      return json({ ok: true });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(url.searchParams.get('project'))}/domains/${encodeURIComponent(url.searchParams.get('name'))}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'domain.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
