import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// KV bulk export (all keys+values of a namespace as JSON) + bulk import.
// Needs Workers KV Storage Edit for import; export uses the same data APIs.
const MAX_KEYS = 1000;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const ns = url.searchParams.get('ns');
    const base = `/accounts/${acct.accountId}/storage/kv/namespaces/${ns}`;
    const names = [];
    let cursor = '';
    while (names.length < MAX_KEYS) {
      const d = await cfApi(acct, `${base}/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const k of d.result || []) names.push(k.name);
      cursor = (d.result_info && d.result_info.cursor) || '';
      if (!cursor) break;
    }
    const entries = [];
    let bytes = 0;
    for (const name of names) {
      const r = await fetch(`https://api.cloudflare.com/client/v4${base}/values/${encodeURIComponent(name)}`, { headers: { 'Authorization': 'Bearer ' + acct.token } });
      const value = r.ok ? await r.text() : '';
      bytes += value.length;
      if (bytes > 4 * 1024 * 1024) return json({ error: '数据总量超过 4MB，请分批处理' }, 413);
      entries.push({ name, value });
    }
    return json({ entries, total: names.length });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const entries = Array.isArray(b.entries) ? b.entries : [];
    if (!entries.length) return json({ error: '没有可导入的条目' }, 400);
    if (entries.length > MAX_KEYS) return json({ error: `一次最多导入 ${MAX_KEYS} 条` }, 400);
    const pairs = entries.map((e) => ({ key: String(e.name ?? e.key ?? ''), value: String(e.value ?? '') })).filter((p) => p.key);
    for (let i = 0; i < pairs.length; i += 100) {
      await cfApi(acct, `/accounts/${acct.accountId}/storage/kv/namespaces/${b.ns}/bulk`, { method: 'PUT', body: JSON.stringify(pairs.slice(i, i + 100)) });
    }
    await addAudit(env, a.sess.user, 'kv.import', `${acct.name} · 导入 ${pairs.length} 条`);
    return json({ ok: true, written: pairs.length });
  } catch (e) { return fail(e); }
}
