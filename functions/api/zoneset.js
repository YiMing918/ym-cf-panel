import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

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
  { id: 'brotli', label: 'Brotli 压缩', type: 'toggle' },
  { id: 'early_hints', label: 'Early Hints（103 预加载提示）', type: 'toggle' },
  { id: 'rocket_loader', label: 'Rocket Loader（JS 延迟加速）', type: 'toggle' },
  { id: 'ipv6', label: 'IPv6 兼容', type: 'toggle' },
  { id: 'pseudo_ipv4', label: '伪 IPv4（给纯 IPv6 源站加兼容头）', type: 'select', options: ['off', 'add_header', 'overwrite_header'] },
  { id: 'email_obfuscation', label: '邮箱地址混淆（防爬虫抓邮箱）', type: 'toggle' },
  { id: 'server_side_exclude', label: 'Server Side Exclude（对可疑访客隐藏内容块）', type: 'toggle' },
  { id: 'hotlink_protection', label: '防盗链（Hotlink 保护）', type: 'toggle' },
  { id: 'http2', label: 'HTTP/2', type: 'toggle' },
  { id: 'bot_fight_mode', label: '机器人战斗模式（Bot Fight Mode）', type: 'toggle' },
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
        if (s.id === 'bot_fight_mode') {
          const d = await cfApi(acct, `/zones/${zone}/bot_management`);
          return [s.id, { value: d.result && d.result.fight_mode ? 'on' : 'off', editable: true }];
        }
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
      await addAudit(env, a.sess.user, 'zone.dnssec', `${acct.name} · DNSSEC ${status}`);
      return json({ ok: true });
    }
    if (b.id === 'bot_fight_mode') {
      await cfApi(acct, `/zones/${b.zone}/bot_management`, { method: 'PUT', body: JSON.stringify({ fight_mode: b.value === 'on' || b.value === true }) });
      await addAudit(env, a.sess.user, 'zone.botfight', `${acct.name} · 机器人战斗模式 ${b.value}`);
      return json({ ok: true });
    }
    if (!IDS.has(b.id)) return json({ error: '该设置不在允许列表里' }, 400);
    const def = SETTINGS.find((s) => s.id === b.id);
    let value = b.value;
    if (def.type === 'toggle') value = value === 'on' || value === true ? 'on' : 'off';
    if (def.type === 'select' && !def.options.includes(value)) return json({ error: '取值不对' }, 400);
    await cfApi(acct, `/zones/${b.zone}/settings/${b.id}`, { method: 'PATCH', body: JSON.stringify({ value }) });
    await addAudit(env, a.sess.user, 'zone.setting', `${acct.name} · ${b.id} = ${value}`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
