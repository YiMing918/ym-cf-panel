import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Email Routing: zone settings + rules + catch-all, account destination addresses.
// Needs Zone → Email Routing Rules Edit (+ Account Email Routing Addresses for destinations).
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const what = url.searchParams.get('what');
    if (what === 'destinations') {
      try {
        const d = await cfApi(acct, `/accounts/${acct.accountId}/email/routing/addresses?per_page=50`);
        return json({ addresses: (d.result || []).map((x) => ({ id: x.id, email: x.email, verified: x.verified })) });
      } catch (e) { return json({ addresses: [], error: String(e.message || e) }); }
    }
    const zone = url.searchParams.get('zone');
    const [settings, rules, ca] = await Promise.all([
      cfApi(acct, `/zones/${zone}/email/routing`).catch(() => null),
      cfApi(acct, `/zones/${zone}/email/routing/rules?per_page=50`).catch(() => null),
      cfApi(acct, `/zones/${zone}/email/routing/rules/catch_all`).catch(() => null),
    ]);
    const catchall = ca && ca.result;
    return json({
      enabled: !!(settings && settings.result && settings.result.enabled),
      synced: !!(settings && settings.result && settings.result.synced),
      rules: ((rules && rules.result) || []).map((r) => ({
        id: r.id, name: r.name || '', enabled: r.enabled !== false,
        match: (r.matchers || []).map((m) => m.value || m.type).join(', '),
        forwardTo: (r.actions || []).filter((x) => x.type === 'forward').flatMap((x) => x.value || []),
      })),
      catchall: catchall ? { id: catchall.id, enabled: catchall.enabled !== false, forwardTo: (catchall.actions || []).filter((x) => x.type === 'forward').flatMap((x) => x.value || []) } : null,
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'toggle') {
      await cfApi(acct, `/zones/${b.zone}/email/routing/${b.enabled ? 'enable' : 'disable'}`, { method: 'POST', body: '{}' });
      await addAudit(env, a.sess.user, 'email.post', acct.name);
      return json({ ok: true });
    }
    if (b.what === 'catchall') {
      const d = await cfApi(acct, `/zones/${b.zone}/email/routing/rules/catch_all`);
      const cur = d.result || {};
      await cfApi(acct, `/zones/${b.zone}/email/routing/rules/catch_all`, {
        method: 'PUT',
        body: JSON.stringify({
          name: cur.name || 'catch-all', enabled: !!b.enabled,
          matchers: [{ type: 'all' }],
          actions: b.forwardTo ? [{ type: 'forward', value: [String(b.forwardTo)] }] : (cur.actions || []),
        }),
      });
      await addAudit(env, a.sess.user, 'email.post', acct.name);
      return json({ ok: true });
    }
    if (b.what === 'add-rule') {
      const email = String(b.email || '').trim();
      const to = String(b.forwardTo || '').trim();
      if (!email.includes('@') || !to.includes('@')) return json({ error: '邮箱格式不对' }, 400);
      await cfApi(acct, `/zones/${b.zone}/email/routing/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: email, enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: email }],
          actions: [{ type: 'forward', value: [to] }],
        }),
      });
      await addAudit(env, a.sess.user, 'email.post', acct.name);
      return json({ ok: true });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/email/routing/rules/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'email.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
