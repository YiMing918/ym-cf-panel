import { requireAuth, json } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// SSL status for a zone: Universal SSL settings + edge certificate packs.
// Needs Zone → SSL and Certificates (Read is enough for viewing).
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    let universal = null, packs = [], uniErr = null;
    try {
      const d = await cfApi(acct, `/zones/${zone}/ssl/universal/settings`);
      universal = { enabled: !!(d.result && d.result.enabled) };
    } catch (e) { uniErr = String(e.message || e); }
    try {
      const d = await cfApi(acct, `/zones/${zone}/ssl/certificate_packs?status[]=active&status[]=pending&status[]=initializing`);
      packs = (d.result || []).map((p) => ({
        type: p.type, status: p.status,
        hosts: p.hosts || [],
        expires: (p.certificates && p.certificates[0] && p.certificates[0].expires_on) || null,
        issuer: (p.certificates && p.certificates[0] && p.certificates[0].issuer) || null,
      }));
    } catch { /* list is optional */ }
    return json({ universal, universalError: uniErr, packs });
  } catch (e) { return fail(e); }
}
