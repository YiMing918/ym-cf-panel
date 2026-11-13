import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

async function query(acct, db, sql, params = []) {
  const data = await cfApi(acct, `/accounts/${acct.accountId}/d1/database/${db}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
  // D1 对多语句返回每条一个结果；以前只取第一条，后面的结果被静默
  // 丢掉，用户会以为只跑了一条。现在全部带回，展示层标明语句数。
  const results = (data.result || []).map((r) => ({ rows: r.results || [], success: r.success !== false, meta: r.meta || {} }));
  const first = results[0] || { rows: [], success: true, meta: {} };
  return { rows: first.rows, success: first.success, meta: first.meta, results };
}

export async function onRequestGet({ request, env }) { // table list
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const r = await query(acct, url.searchParams.get('db'), "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
    return json({ tables: r.rows.map((x) => x.name) });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) { // run SQL (writes are REAL — UI warns)
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const sql = String(b.sql || '').trim();
    if (!sql) return json({ error: 'SQL 不能为空' }, 400);
    if (sql.length > 20000) return json({ error: 'SQL 太长' }, 400);
    const acct = await resolveAccount(env, b.account);
    const r = await query(acct, b.db, sql);
    await addAudit(env, a.sess.user, 'd1.sql', `${acct.name} · ${sql.slice(0, 60)}`);
    return json({ ok: true, rows: r.rows.slice(0, 500), totalRows: r.rows.length, truncated: r.rows.length > 500, statements: r.results.length, allResults: r.results.map((x) => ({ rows: x.rows.slice(0, 500), success: x.success })), meta: { rowsRead: r.meta.rows_read, rowsWritten: r.meta.rows_written, changes: r.meta.changes, duration: r.meta.duration } });
  } catch (e) { return fail(e); }
}
