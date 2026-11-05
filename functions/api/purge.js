import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    let payload;
    if (b.mode === 'urls') {
      const urls = (b.urls || []).map((u) => String(u).trim()).filter(Boolean).slice(0, 30);
      if (!urls.length) return json({ error: '至少填一个网址' }, 400);
      payload = { files: urls };
    } else payload = { purge_everything: true };
    await cfApi(acct, `/zones/${b.zone}/purge_cache`, { method: 'POST', body: JSON.stringify(payload) });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
