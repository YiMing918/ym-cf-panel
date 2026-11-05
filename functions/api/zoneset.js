import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// Zone settings (whitelist) + DNSSEC. Needs Zone Settings Edit for writes.
export const SETTINGS = [
  { id: 'always_use_https', label: '强制 HTTPS（Always Use HTTPS）', type: 'toggle' },
  { id: 'automatic_https_rewrites', label: '自动 HTTPS 重写', type: 'toggle' },
  { id: 'tls_1_3', label: 'TLS 1.3', type: 'toggle' },
  { id: 'http3', label: 'HTTP/3 (QUIC)', type: 'toggle' },
  { id: 'websockets', label: 'WebSockets', type: 'toggle' },
  { id: 'ip_geolocation', label: 'IP 地理位置标头', type: 'toggle' },
  { id: 'opportunistic_encryption', label: '机会性加密', type: 'toggle' },
  { id: 'browser_check', label: '浏览器完整性检查', type: 'toggle' },
  { id: 'always_online', label: 'Always Online（源站挂了显示缓存）', type: 'toggle' },
  { id: 'development_mode', label: '开发模式（绕过缓存 3 小时）', type: 'toggle' },
  { id: 'min_tls_version', label: '最低 TLS 版本', type: 'select', options: ['1.0', '1.1', '1.2', '1.3'] },
  { id: 'security_level', label: '安全级别', type: 'select', options: ['essentially_off', 'low', 'medium', 'high', 'under_attack'] },
  { id: 'cache_level', label: '缓存级别', type: 'select', options: ['aggressive', 'basic', 'simplified'] },
];
const IDS = new Set(SETTINGS.map((s) => s.id));

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    const results = await Promise.all(SETTINGS.map(async (s) => {
      try {
        const d = await cfApi(acct, `/zones/${zone}/settings/${s.id}`);
        return [s.id, { value: d.result && d.result.value, editable: !!(d.result && d.result.editable) }];
      } catch (e) { return [s.id, { error: String(e.message || e) }]; }
    }));
    let dnssec = null;
    try { const d = await cfApi(acct, `/zones/${zone}/dnssec`); dnssec = { status: d.result && d.result.status }; } catch { /* needs DNS perm */ }
    return json({ settings: Object.fromEntries(results), defs: SETTINGS, dnssec });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'dnssec') {
      const status = b.enabled ? 'active' : 'disabled';
      await cfApi(acct, `/zones/${b.zone}/dnssec`, { method: 'PATCH', body: JSON.stringify({ status }) });
      return json({ ok: true });
    }
    if (!IDS.has(b.id)) return json({ error: '该设置不在允许列表里' }, 400);
    const def = SETTINGS.find((s) => s.id === b.id);
    let value = b.value;
    if (def.type === 'toggle') value = value === 'on' || value === true ? 'on' : 'off';
    if (def.type === 'select' && !def.options.includes(value)) return json({ error: '取值不对' }, 400);
    await cfApi(acct, `/zones/${b.zone}/settings/${b.id}`, { method: 'PATCH', body: JSON.stringify({ value }) });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
