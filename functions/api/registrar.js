import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Cloudflare Registrar: registered domains, auto-renew and lock toggles.
// No purchases here — registering/transferring costs money and always goes
// through the official checkout with the owner's confirmation.
const A = (acct) => `/accounts/${acct.accountId}/registrar/domains`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const d = await cfApi(acct, `${A(acct)}?per_page=50`);
    return json({
      domains: (d.result || []).map((x) => ({
        name: x.name || x.id, expires: x.expires_at, autoRenew: x.auto_renew, locked: x.locked,
        privacy: x.privacy_redaction && x.privacy_redaction.enabled,
      })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const patch = {};
    if (typeof b.autoRenew === 'boolean') patch.auto_renew = b.autoRenew;
    if (typeof b.locked === 'boolean') patch.locked = b.locked;
    if (!Object.keys(patch).length) return json({ error: '没有要改的项' }, 400);
    await cfApi(acct, `${A(acct)}/${encodeURIComponent(b.domain)}`, { method: 'PUT', body: JSON.stringify(patch) });
    await addAudit(env, a.sess.user, 'registrar.update', `${acct.name} · ${b.domain} ${JSON.stringify(patch)}`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
