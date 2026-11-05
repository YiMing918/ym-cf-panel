import { requireAuth, json } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// Workers script info: bindings, cron schedules, account subdomain.
// Needs Workers Scripts Read; each part is best-effort.
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const script = encodeURIComponent(url.searchParams.get('script'));
    let bindings = null, schedules = null, subdomain = null;
    try {
      const d = await cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/settings`);
      bindings = ((d.result && d.result.bindings) || []).map((b) => ({
        type: b.type, name: b.name,
        target: b.namespace || b.bucket_name || b.database_name || b.service || b.queue_name || b.class_name || '',
      }));
    } catch { /* settings optional */ }
    try {
      const d = await cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/schedules`);
      schedules = ((d.result && d.result.schedules) || []).map((s) => ({ cron: s.cron, created: s.created_on }));
    } catch { /* schedules optional */ }
    try {
      const d = await cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/subdomain`);
      subdomain = { enabled: !!(d.result && d.result.enabled) };
    } catch { /* subdomain optional */ }
    return json({ bindings, schedules, subdomain });
  } catch (e) { return fail(e); }
}
