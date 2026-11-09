import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// SSL status for a zone: Universal SSL settings + edge certificate packs.
// Needs Zone → SSL and Certificates (Read is enough for viewing).
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    let universal = null, packs = [], uniErr = null, packsTotal = 0, packsTruncated = false, customTotal = 0, customTruncated = false;
    try {
      const d = await cfApi(acct, `/zones/${zone}/ssl/universal/settings`);
      universal = { enabled: !!(d.result && d.result.enabled) };
    } catch (e) { uniErr = String(e.message || e); }
    try {
      const d = await cfApiAll(acct, `/zones/${zone}/ssl/certificate_packs?status[]=active&status[]=pending&status[]=initializing`);
      packsTotal = d.result_info ? d.result_info.total_count : (d.result || []).length; packsTruncated = !!(d.result_info && d.result_info.truncated);
      packs = (d.result || []).map((p) => ({
        type: p.type, status: p.status,
        hosts: p.hosts || [],
        expires: (p.certificates && p.certificates[0] && p.certificates[0].expires_on) || null,
        issuer: (p.certificates && p.certificates[0] && p.certificates[0].issuer) || null,
      }));
    } catch { /* list is optional */ }
    let custom = [];
    try {
      const d = await cfApiAll(acct, `/zones/${zone}/custom_certificates`);
      customTotal = d.result_info ? d.result_info.total_count : (d.result || []).length; customTruncated = !!(d.result_info && d.result_info.truncated);
      custom = (d.result || []).map((c) => ({ id: c.id, issuer: c.issuer, expires: c.expires_on, hosts: c.hosts || [], status: c.status, priority: c.priority }));
    } catch { /* custom certs optional */ }
    return json({ universal, universalError: uniErr, packs, custom, packsTotal, packsTruncated, customTotal, customTruncated });
  } catch (e) { return fail(e); }
}

// Upload a custom certificate (cert + private key PEM). The key is forwarded
// to Cloudflare only — never stored or logged by the panel.
export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'universal') {
      await cfApi(acct, `/zones/${b.zone}/ssl/universal/settings`, { method: 'PATCH', body: JSON.stringify({ enabled: !!b.enabled }) });
      await addAudit(env, a.sess.user, 'cert.universal', `${acct.name} · 通用 SSL ${b.enabled ? '开' : '关'}`);
      return json({ ok: true });
    }
    const certificate = String(b.certificate || '');
    const privateKey = String(b.privateKey || '');
    if (!certificate.includes('BEGIN CERTIFICATE') || !/BEGIN .*PRIVATE KEY/.test(privateKey)) {
      return json({ error: '证书或私钥格式不对（需要 PEM 文本）' }, 400);
    }
    await cfApi(acct, `/zones/${b.zone}/custom_certificates`, {
      method: 'POST',
      body: JSON.stringify({ certificate, private_key: privateKey, bundle_method: 'ubiquitous' }),
    });
    await addAudit(env, a.sess.user, 'cert.upload', `${acct.name} · 上传自定义证书`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/custom_certificates/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'cert.delete', `${acct.name} · 删除自定义证书`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
