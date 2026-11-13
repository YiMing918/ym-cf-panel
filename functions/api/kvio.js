import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// KV bulk export (all keys+values of a namespace as JSON) + bulk import.
// Needs Workers KV Storage Edit for import; export uses the same data APIs.
const MAX_KEYS = 1000; // import cap: enforced with an explicit 400 error below, not silent
// Export guard: values are read with the KV bulk-get endpoint (100 keys
// per subrequest). 4000 keys ≈ 40 bulk calls + a few list pages, which
// stays inside the free plan's 50-subrequest budget; the old per-key
// fetch died around key #44 and made export unusable for any real
// namespace. Excess is flagged via `truncated`, never silent.
const MAX_EXPORT_KEYS = 4000;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const ns = url.searchParams.get('ns');
    const base = `/accounts/${acct.accountId}/storage/kv/namespaces/${encodeURIComponent(ns)}`;
    const names = [];
    let cursor = '';
    let exportTruncated = false;
    while (true) {
      const d = await cfApi(acct, `${base}/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const k of d.result || []) names.push(k.name);
      cursor = (d.result_info && d.result_info.cursor) || '';
      if (!cursor) break;
      if (names.length >= MAX_EXPORT_KEYS) { exportTruncated = true; break; }
    }
    if (exportTruncated) names.length = MAX_EXPORT_KEYS;
    const entries = [];
    let bytes = 0;
    // Bulk get: up to 100 keys per call. Same loud-failure contract as
    // before: any batch failure or a listed key missing from the result
    // aborts the whole export with a 502 — a failed read must NEVER be
    // exported as an empty value (restoring it would wipe the real one).
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100);
      let d;
      try {
        d = await cfApi(acct, `${base}/bulk/get`, { method: 'POST', body: JSON.stringify({ keys: chunk }) });
      } catch (e) {
        return json({ error: `批量读取键值失败（${String(e.message || e).slice(0, 120)}），导出已终止：这份备份不完整，请勿使用` }, 502);
      }
      const map = d.result || {};
      for (const name of chunk) {
        const value = map[name];
        if (value === undefined || value === null) {
          return json({ error: `读取键「${name}」失败，导出已终止：这份备份不完整，请勿使用` }, 502);
        }
        const v = String(value);
        bytes += v.length;
        if (bytes > 4 * 1024 * 1024) return json({ error: '数据总量超过 4MB，请分批处理' }, 413);
        entries.push({ name, value: v });
      }
    }
    return json({ entries, total: names.length, truncated: exportTruncated });
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
