import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Workers script code: view (best-effort multipart extraction), upload new
// code (preserving existing bindings), workers.dev subdomain toggle,
// zone routes list/create/delete, and script deletion.
const A = (acct) => `/accounts/${acct.accountId}/workers/scripts`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const what = url.searchParams.get('what') || 'content';
    if (what === 'routes') {
      const d = await cfApiAll(acct, `/zones/${url.searchParams.get('zone')}/workers/routes`);
      return json({ routes: (d.result || []).map((r) => ({ id: r.id, pattern: r.pattern, script: r.script || '' })), total: d.result_info ? d.result_info.total_count : (d.result || []).length, truncated: !!(d.result_info && d.result_info.truncated) });
    }
    const script = url.searchParams.get('script');
    const resp = await fetch(`https://api.cloudflare.com/client/v4${A(acct)}/${script}`, {
      headers: { Authorization: `Bearer ${acct.token}` },
    });
    const raw = await resp.text();
    if (!resp.ok) return json({ error: `读取脚本失败（HTTP ${resp.status}）` }, 502);
    const parts = [];
    const boundary = (resp.headers.get('content-type') || '').match(/boundary=([^;]+)/);
    if (boundary) {
      for (const chunk of raw.split('--' + boundary[1])) {
        const nameM = chunk.match(/name="([^"]+)"/);
        if (!nameM) continue;
        const bodyAt = chunk.indexOf('\r\n\r\n');
        const body = bodyAt >= 0 ? chunk.slice(bodyAt + 4).replace(/\r\n$/, '') : '';
        parts.push({ name: nameM[1], size: body.length, text: body.slice(0, 60000) });
      }
    }
    if (!parts.length) parts.push({ name: 'script', size: raw.length, text: raw.slice(0, 60000) });
    return json({ parts, truncated: parts.some((p) => p.size > 60000) });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'upload') {
      const script = String(b.script || '');
      const code = String(b.code || '');
      if (!code.trim()) return json({ error: '代码不能为空' }, 400);
      let bindings = [];
      try { const s = await cfApi(acct, `${A(acct)}/${script}/settings`); bindings = (s.result && s.result.bindings) || []; } catch { /* new script */ }
      const module = !!b.module;
      const metadata = module ? { main_module: 'index.js', bindings, compatibility_date: '2024-11-01' } : { body_part: 'script', bindings };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append(module ? 'index.js' : 'script', new Blob([code], { type: 'application/javascript' }), module ? 'index.js' : 'script.js');
      const resp = await fetch(`https://api.cloudflare.com/client/v4${A(acct)}/${script}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${acct.token}` }, body: form,
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok || !d || !d.success) return json({ error: `部署失败：${(d && d.errors && d.errors[0] && d.errors[0].message) || ('HTTP ' + resp.status)}` }, 502);
      await addAudit(env, a.sess.user, 'worker.upload', `${acct.name} · ${script} 代码已更新`);
      return json({ ok: true });
    }
    if (b.what === 'subdomain') {
      await cfApi(acct, `${A(acct)}/${b.script}/subdomain`, { method: 'POST', body: JSON.stringify({ enabled: !!b.enabled, previews_enabled: !!b.enabled }) });
      await addAudit(env, a.sess.user, 'worker.subdomain', `${acct.name} · ${b.script} workers.dev ${b.enabled ? '开' : '关'}`);
      return json({ ok: true });
    }
    if (b.what === 'route') {
      await cfApi(acct, `/zones/${b.zone}/workers/routes`, { method: 'POST', body: JSON.stringify({ pattern: b.pattern, script: b.script }) });
      await addAudit(env, a.sess.user, 'worker.route-create', `${acct.name} · ${b.pattern} → ${b.script}`);
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
    const kind = url.searchParams.get('kind');
    if (kind === 'route') {
      await cfApi(acct, `/zones/${url.searchParams.get('zone')}/workers/routes/${url.searchParams.get('id')}`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'worker.route-delete', `${acct.name} · 删除路由`);
    } else {
      await cfApi(acct, `${A(acct)}/${url.searchParams.get('script')}?force=true`, { method: 'DELETE' });
      await addAudit(env, a.sess.user, 'worker.delete', `${acct.name} · 删除脚本 ${url.searchParams.get('script')}`);
    }
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
