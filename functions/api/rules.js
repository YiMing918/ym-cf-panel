import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Zone rulesets (WAF custom / cache / redirect / transform phases) with per-rule
// enable/disable, plus legacy Page Rules list/toggle/create/delete.
// Reads need Zone Read + ruleset access; writes need Rulesets Edit / Page Rules Edit.
const PHASE_LABEL = {
  http_request_firewall_custom: 'WAF 自定义规则',
  http_request_cache_settings: '缓存规则',
  http_request_dynamic_redirect: '重定向规则',
  http_request_transform: '转换规则',
  http_request_firewall_managed: 'WAF 托管规则',
  http_ratelimit: '速率限制规则',
};

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    const what = url.searchParams.get('what');
    if (what === 'pagerules') {
      const d = await cfApi(acct, `/zones/${zone}/pagerules?per_page=50`);
      return json({
        rules: (d.result || []).map((r) => ({
          id: r.id, status: r.status, priority: r.priority,
          targets: (r.targets || []).map((t) => t.constraint && t.constraint.value).filter(Boolean),
          actions: (r.actions || []).map((x) => x.id),
        })),
      });
    }
    // rulesets: list zone rulesets, keep the interesting phases with their rules
    const d = await cfApi(acct, `/zones/${zone}/rulesets`);
    const sets = [];
    for (const rs of d.result || []) {
      if (!PHASE_LABEL[rs.phase]) continue;
      let rules = [];
      try {
        const full = await cfApi(acct, `/zones/${zone}/rulesets/${rs.id}`);
        rules = ((full.result && full.result.rules) || []).map((r) => ({
          id: r.id, description: r.description || r.expression || '(无名规则)',
          expression: r.expression || '', action: r.action || '', enabled: r.enabled !== false,
        }));
      } catch { /* keep empty */ }
      sets.push({ id: rs.id, phase: rs.phase, label: PHASE_LABEL[rs.phase], name: rs.name || '', rules });
    }
    return json({ rulesets: sets });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'toggle-rule') {
      // Flip one rule's enabled flag: fetch ruleset, patch the rule, put it back.
      const full = await cfApi(acct, `/zones/${b.zone}/rulesets/${b.ruleset}`);
      const rs = full.result;
      const rules = (rs.rules || []).map((r) => (r.id === b.rule ? { ...r, enabled: !!b.enabled } : r));
      await cfApi(acct, `/zones/${b.zone}/rulesets/${b.ruleset}`, {
        method: 'PUT',
        body: JSON.stringify({ name: rs.name, kind: rs.kind, phase: rs.phase, rules }),
      });
      return json({ ok: true });
    }
    if (b.what === 'pagerule-toggle') {
      await cfApi(acct, `/zones/${b.zone}/pagerules/${b.id}`, { method: 'PATCH', body: JSON.stringify({ status: b.enabled ? 'active' : 'disabled' }) });
      return json({ ok: true });
    }
    if (b.what === 'rule-create' || b.what === 'rule-edit') {
      const ACTIONS = ['block', 'challenge', 'js_challenge', 'managed_challenge', 'log'];
      const expression = String(b.expression || '').trim();
      if (!expression) return json({ error: '规则表达式不能为空' }, 400);
      if (!ACTIONS.includes(b.action)) return json({ error: '动作只能是 block/challenge/js_challenge/managed_challenge/log' }, 400);
      const rule = { expression, action: b.action, description: String(b.description || '').slice(0, 100), enabled: b.enabled !== false };
      if (b.what === 'rule-create') {
        await cfApi(acct, `/zones/${b.zone}/rulesets/${b.ruleset}/rules`, { method: 'POST', body: JSON.stringify(rule) });
      } else {
        await cfApi(acct, `/zones/${b.zone}/rulesets/${b.ruleset}/rules/${b.rule}`, { method: 'PATCH', body: JSON.stringify(rule) });
      }
      await addAudit(env, a.sess.user, 'rule.' + b.what, `${acct.name} · ${rule.action} ${rule.expression.slice(0, 80)}`);
      return json({ ok: true });
    }
    if (b.what === 'ruleset-create') {
      const ACTIONS = ['block', 'challenge', 'js_challenge', 'managed_challenge', 'log'];
      const expression = String(b.expression || '').trim();
      if (!expression || !ACTIONS.includes(b.action)) return json({ error: '表达式或动作不对' }, 400);
      await cfApi(acct, `/zones/${b.zone}/rulesets`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'default', kind: 'zone', phase: 'http_request_firewall_custom',
          rules: [{ expression, action: b.action, description: String(b.description || '').slice(0, 100), enabled: true }],
        }),
      });
      await addAudit(env, a.sess.user, 'rule.ruleset-create', `${acct.name} · ${b.action} ${expression.slice(0, 80)}`);
      return json({ ok: true });
    }
    if (b.what === 'pagerule-create') {
      const urlPattern = String(b.url || '').trim();
      if (!urlPattern) return json({ error: 'URL 匹配模式不能为空' }, 400);
      let action;
      if (b.kind === 'forward') {
        const to = String(b.forwardUrl || '').trim();
        if (!to) return json({ error: '跳转目标不能为空' }, 400);
        action = { id: 'forwarding_url', value: { url: to, status_code: Number(b.statusCode) || 301 } };
      } else if (b.kind === 'cache') action = { id: 'cache_level', value: String(b.cacheLevel || 'cache_everything') };
      else if (b.kind === 'ssl') action = { id: 'ssl', value: String(b.sslMode || 'flexible') };
      else return json({ error: '未知规则类型' }, 400);
      await cfApi(acct, `/zones/${b.zone}/pagerules`, {
        method: 'POST',
        body: JSON.stringify({ targets: [{ target: 'url', constraint: { operator: 'matches', value: urlPattern } }], actions: [action], status: 'active' }),
      });
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
    if (url.searchParams.get('what') === 'rule') {
      await cfApi(acct, `/zones/${url.searchParams.get('zone')}/rulesets/${url.searchParams.get('ruleset')}/rules/${url.searchParams.get('rule')}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/pagerules/${url.searchParams.get('id')}`, { method: 'DELETE' });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
