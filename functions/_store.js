// KV-backed storage for panel accounts + settings.
export async function getAccounts(env) {
  const raw = await env.PANEL_KV.get('accounts');
  return raw ? JSON.parse(raw) : [];
}

export async function saveAccounts(env, list) {
  await env.PANEL_KV.put('accounts', JSON.stringify(list));
}

export function maskAccount(a) {
  return {
    id: a.id, name: a.name, accountId: a.accountId,
    tokenMasked: a.token ? '••••••••' + a.token.slice(-4) : '',
    createdAt: a.createdAt || null,
  };
}

// Panel-local audit log of management actions (last 100). Never stores tokens
// or secret values — action name + a short human detail only.
export async function addAudit(env, user, action, detail) {
  try {
    const raw = await env.PANEL_KV.get('audit');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({ at: Date.now(), user: user || '', action, detail: String(detail || '').slice(0, 200) });
    await env.PANEL_KV.put('audit', JSON.stringify(list.slice(0, 100)));
  } catch { /* auditing must never break the action itself */ }
}

export async function getAudit(env) {
  const raw = await env.PANEL_KV.get('audit');
  return raw ? JSON.parse(raw) : [];
}

export async function getSettings(env) {
  const raw = await env.PANEL_KV.get('settings');
  const s = raw ? JSON.parse(raw) : {};
  return { panelName: 'YM CF 面板', publicSummary: false, ...s };
}

export async function saveSettings(env, s) {
  await env.PANEL_KV.put('settings', JSON.stringify(s));
}
