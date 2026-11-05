import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// KV namespace create / rename / delete. Needs Workers KV Storage → Edit.
const base = (acct) => `/accounts/${acct.accountId}/storage/kv/namespaces`;

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const title = String(b.title || '').trim();
    if (!title) return json({ error: '命名空间名称不能为空' }, 400);
    const d = await cfApi(acct, base(acct), { method: 'POST', body: JSON.stringify({ title }) });
    return json({ ok: true, ns: { id: d.result && d.result.id, title } });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    await cfApi(acct, `${base(acct)}/${b.ns}`, { method: 'PUT', body: JSON.stringify({ title: String(b.title || '').trim() }) });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${base(acct)}/${url.searchParams.get('ns')}`, { method: 'DELETE' });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
