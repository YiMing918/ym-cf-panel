import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Pages project detail / create / delete. Detail needs Pages Read; writes need Edit.
// Env var VALUES are never returned — names and types only.
function envNames(cfg) {
  if (!cfg || !cfg.env_vars) return [];
  return Object.entries(cfg.env_vars).map(([name, v]) => ({ name, type: (v && v.type) || 'plain_text' }));
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const d = await cfApi(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(url.searchParams.get('project'))}`);
    const p = d.result || {};
    const dc = p.deployment_configs || {};
    const bc = (dc.production && dc.production.build_config) || {};
    return json({
      project: {
        name: p.name, subdomain: p.subdomain, domains: p.domains || [], productionBranch: p.production_branch,
        created: p.created_on, source: p.source && p.source.type,
        build: { command: bc.build_command || '', destination: bc.destination_dir || '', root: bc.root_dir || '' },
        envProduction: envNames(dc.production), envPreview: envNames(dc.preview),
      },
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const name = String(b.name || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(name)) return json({ error: '项目名只用小写字母、数字和连字符' }, 400);
    await cfApi(acct, `/accounts/${acct.accountId}/pages/projects`, {
      method: 'POST', body: JSON.stringify({ name, production_branch: String(b.branch || 'main').trim() || 'main' }),
    });
    await addAudit(env, a.sess.user, 'pages.post', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(url.searchParams.get('project'))}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'pages.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
