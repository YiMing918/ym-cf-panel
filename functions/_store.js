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

export async function getSettings(env) {
  const raw = await env.PANEL_KV.get('settings');
  const s = raw ? JSON.parse(raw) : {};
  return { panelName: 'YM CF 面板', publicSummary: false, ...s };
}

export async function saveSettings(env, s) {
  await env.PANEL_KV.put('settings', JSON.stringify(s));
}
