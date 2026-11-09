import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Queues: list / create / delete. Needs Workers Queues (Edit) permission.
const A = (acct) => `/accounts/${acct.accountId}/queues`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const d = await cfApiAll(acct, A(acct));
    const queues = [];
    for (const q of d.result || []) {
      let detail = null;
      try { detail = (await cfApi(acct, `${A(acct)}/${q.queue_id}`)).result; } catch { /* counts optional */ }
      queues.push({
        id: q.queue_id, name: q.queue_name,
        producers: detail ? (detail.producers || []).length : null,
        consumers: detail ? (detail.consumers || []).length : null,
        created: q.created_on, backlog: detail && detail.settings ? undefined : undefined,
      });
    }
    return json({ queues, total: d.result_info ? d.result_info.total_count : queues.length, truncated: !!(d.result_info && d.result_info.truncated) });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const name = String(b.name || '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return json({ error: '队列名只能是小写字母、数字和连字符' }, 400);
    await cfApi(acct, A(acct), { method: 'POST', body: JSON.stringify({ queue_name: name }) });
    await addAudit(env, a.sess.user, 'queue.create', `${acct.name} · ${name}`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${A(acct)}/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'queue.delete', `${acct.name} · 删除队列`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
