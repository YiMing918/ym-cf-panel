import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// DNS export (BIND text) + import. Needs Zone → DNS → Edit.
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${url.searchParams.get('zone')}/dns_records/export`, { headers: { 'Authorization': 'Bearer ' + acct.token } });
    if (!r.ok) throw new Error('导出失败 HTTP ' + r.status);
    return json({ text: await r.text() });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const content = String(b.content || '');
    if (!content.trim()) return json({ error: '导入内容为空' }, 400);
    if (content.length > 1024 * 1024) return json({ error: '内容超过 1MB' }, 400);
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'text/plain' }), 'import.zone');
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${b.zone}/dns_records/import`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + acct.token }, body: form,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.success === false) throw new Error((data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status));
    return json({ ok: true, added: data.result && data.result.total_records_added, parsed: data.result && data.result.total_records_parsed });
  } catch (e) { return fail(e); }
}
