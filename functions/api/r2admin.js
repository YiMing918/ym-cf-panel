import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// R2 bucket create / delete (bucket-level only; object ops need S3 keys, not API tokens).
// Needs Workers R2 Storage → Edit.
export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const name = String(b.name || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(name)) return json({ error: '桶名只用小写字母、数字、连字符（3-63 位）' }, 400);
    const payload = { name };
    if (b.location) payload.locationHint = String(b.location);
    await cfApi(acct, `/accounts/${acct.accountId}/r2/buckets`, { method: 'POST', body: JSON.stringify(payload) });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/accounts/${acct.accountId}/r2/buckets/${encodeURIComponent(url.searchParams.get('bucket'))}`, { method: 'DELETE' });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
