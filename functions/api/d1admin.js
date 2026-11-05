import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

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
      return json({ ok: true, db: { id: d.result && (d.result.uuid || d.result.id), name } });
    }
    if (b.action === 'export') {
      // Polling-mode export: first call returns a bookmark, follow-ups return a signed URL.
      let bookmark = b.bookmark || undefined;
      for (let i = 0; i < 4; i++) {
        const d = await cfApi(acct, `${base(acct)}/${b.db}/export`, {
          method: 'POST',
          body: JSON.stringify(bookmark ? { output_format: 'polling', current_bookmark: bookmark } : { output_format: 'polling' }),
        });
        const r = d.result || {};
        if (r.signed_url) return json({ ok: true, url: r.signed_url, filename: r.filename || '' });
        bookmark = r.at_bookmark || bookmark;
        if (r.status && r.status !== 'active' && !r.at_bookmark) break;
      }
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
    await cfApi(acct, `${base(acct)}/${url.searchParams.get('db')}`, { method: 'DELETE' });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
