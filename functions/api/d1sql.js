import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

async function query(acct, db, sql, params = []) {
  const data = await cfApi(acct, `/accounts/${acct.accountId}/d1/database/${db}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
  const first = (data.result || [])[0] || {};
  return { rows: first.results || [], success: first.success !== false, meta: first.meta || {} };
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
    return json({ ok: true, rows: r.rows.slice(0, 500), meta: { rowsRead: r.meta.rows_read, rowsWritten: r.meta.rows_written, changes: r.meta.changes, duration: r.meta.duration } });
  } catch (e) { return fail(e); }
}
