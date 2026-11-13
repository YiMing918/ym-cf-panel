import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// D1 database create / delete / export. Needs D1 → Edit.
const base = (acct) => `/accounts/${acct.accountId}/d1/database`;

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.action === 'create') {
      const name = String(b.name || '').trim();
      if (!name) return json({ error: '数据库名不能为空' }, 400);
      const d = await cfApi(acct, base(acct), { method: 'POST', body: JSON.stringify({ name }) });
      await addAudit(env, a.sess.user, 'd1.create', `${acct.name} · 新建数据库 ${name}`);
      return json({ ok: true, db: { id: d.result && (d.result.uuid || d.result.id), name } });
    }
    if (b.action === 'restore') {
      // D1 Time Travel: restore the database to a point in time (last 30 days).
      // 官方端点是 .../time_travel/restore 且 timestamp 走 query 参数；
      // 以前写成 .../restore + JSON body，那个路径不存在、必然 404，
      // 「恢复到时间点」从来没通过。恢复结果里的 previous_bookmark
      // 是撤销这次恢复的凭据，一并回给前端展示。
      const ts = String(b.timestamp || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) return json({ error: '时间格式不对，请用如 2026-11-01T12:00:00Z' }, 400);
      const d = await cfApi(acct, `${base(acct)}/${encodeURIComponent(b.db)}/time_travel/restore?timestamp=${encodeURIComponent(ts)}`, { method: 'POST' });
      await addAudit(env, a.sess.user, 'd1.restore', `${acct.name} · 恢复 ${b.db} 到 ${ts}`);
      return json({ ok: true, result: d.result || {}, previous_bookmark: (d.result && d.result.previous_bookmark) || '' });
    }
    if (b.action === 'export') {
      // Polling-mode export: first call returns a bookmark, follow-ups return a signed URL.
      // 轮询之间留 1.5 秒间隔：以前连发 4 次中间不等待，基本都还是
      // pending，白白耗子请求；一次导出只记一条审计（以前每轮一条）。
      let bookmark = b.bookmark || undefined;
      for (let i = 0; i < 4; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));
        const d = await cfApi(acct, `${base(acct)}/${encodeURIComponent(b.db)}/export`, {
          method: 'POST',
          body: JSON.stringify(bookmark ? { output_format: 'polling', current_bookmark: bookmark } : { output_format: 'polling' }),
        });
        const r = d.result || {};
        if (r.signed_url) {
          await addAudit(env, a.sess.user, 'd1.export', `${acct.name} · 导出 ${b.db}`);
          return json({ ok: true, url: r.signed_url, filename: r.filename || '' });
        }
        bookmark = r.at_bookmark || bookmark;
        if (r.status && r.status !== 'active' && !r.at_bookmark) break;
      }
      await addAudit(env, a.sess.user, 'd1.export', `${acct.name} · 导出 ${b.db}（生成中）`);
      return json({ ok: true, pending: true, bookmark, note: '导出还在生成中，稍后再点一次导出即可拿到下载链接' });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${base(acct)}/${encodeURIComponent(url.searchParams.get('db'))}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'd1.delete', `${acct.name} · 删除数据库 ${url.searchParams.get('db')}`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
