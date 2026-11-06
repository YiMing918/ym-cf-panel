import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

function bodyOf(b) {
  const out = { type: String(b.type || 'A').toUpperCase(), name: String(b.name || '').trim(), content: String(b.content || '').trim(), ttl: Number(b.ttl) || 1 };
  if (['A', 'AAAA', 'CNAME'].includes(out.type)) out.proxied = !!b.proxied;
  if (out.type === 'MX') out.priority = Number(b.priority) || 10;
  if (!out.name || !out.content) throw new Error('名称和内容都要填');
  return out;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    if (!zone) return json({ error: '缺少 zone' }, 400);
    const data = await cfApi(acct, `/zones/${zone}/dns_records?per_page=100`);
    return json({ records: (data.result || []).map((r) => ({ id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: !!r.proxied, priority: r.priority })) });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const data = await cfApi(acct, `/zones/${b.zone}/dns_records`, { method: 'POST', body: JSON.stringify(bodyOf(b)) });
    await addAudit(env, a.sess.user, 'dns.post', acct.name);
    return json({ ok: true, record: data.result });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const data = await cfApi(acct, `/zones/${b.zone}/dns_records/${b.id}`, { method: 'PUT', body: JSON.stringify(bodyOf(b)) });
    await addAudit(env, a.sess.user, 'dns.put', acct.name);
    return json({ ok: true, record: data.result });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/dns_records/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'dns.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
