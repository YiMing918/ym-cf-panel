import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

const base = (acct, ns) => `/accounts/${acct.accountId}/storage/kv/namespaces/${ns}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const ns = url.searchParams.get('ns');
    const key = url.searchParams.get('key');
    if (key !== null && key !== undefined && url.searchParams.has('key')) {
      const r = await fetch(`https://api.cloudflare.com/client/v4${base(acct, ns)}/values/${encodeURIComponent(key)}`, { headers: { 'Authorization': 'Bearer ' + acct.token } });
      if (!r.ok) throw new Error('读取失败 HTTP ' + r.status);
      return json({ key, value: await r.text() });
    }
    const prefix = url.searchParams.get('prefix') || '';
    const cursor = url.searchParams.get('cursor') || '';
    const data = await cfApi(acct, `${base(acct, ns)}/keys?limit=100&prefix=${encodeURIComponent(prefix)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    return json({ keys: (data.result || []).map((k) => ({ name: k.name, expiration: k.expiration || null })), cursor: (data.result_info && data.result_info.cursor) || null });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const r = await fetch(`https://api.cloudflare.com/client/v4${base(acct, b.ns)}/values/${encodeURIComponent(b.key)}`, {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + acct.token, 'Content-Type': 'text/plain' }, body: String(b.value ?? ''),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.success === false) throw new Error((data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status));
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${base(acct, url.searchParams.get('ns'))}/values/${encodeURIComponent(url.searchParams.get('key'))}`, { method: 'DELETE' });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
