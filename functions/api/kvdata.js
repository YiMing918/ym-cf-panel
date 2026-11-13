import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

const base = (acct, ns) => `/accounts/${acct.accountId}/storage/kv/namespaces/${encodeURIComponent(ns)}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const ns = url.searchParams.get('ns');
    const key = url.searchParams.get('key');
    if (key !== null && key !== undefined && url.searchParams.has('key')) {
      const r = await fetch(`https://api.cloudflare.com/client/v4${base(acct, ns)}/values/${encodeURIComponent(key)}`, { headers: { 'Authorization': 'Bearer ' + acct.token } });
      if (!r.ok) throw new Error('读取失败 HTTP ' + r.status);
      // 二进制安全读：以前 r.text() 按 UTF-8 有损解码，非文本值读出来
      // 已被替换字符污染，在编辑器里再保存一次就把原值彻底写坏。
      // 现在严格解码，失败则回 base64 并标记 binary，前端只读展示、
      // 保存时按 base64 原样写回字节。
      const buf = await r.arrayBuffer();
      try {
        const value = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return json({ key, value, binary: false });
      } catch {
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return json({ key, value: btoa(bin), binary: true });
      }
    }
    const prefix = url.searchParams.get('prefix') || '';
    const cursor = url.searchParams.get('cursor') || '';
    // Cursor pagination is driven by the caller (cursor in, cursor out), so
    // this is not a hidden cap; limit raised to the KV maximum of 1000/page.
    const data = await cfApi(acct, `${base(acct, ns)}/keys?limit=1000&prefix=${encodeURIComponent(prefix)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    return json({ keys: (data.result || []).map((k) => ({ name: k.name, expiration: k.expiration || null })), cursor: (data.result_info && data.result_info.cursor) || null });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    // binary 标记的值按 base64 解回原始字节写（前端对二进制值只读，
    // 能走到这里的是原样回写或脚本调用）；普通值维持文本写
    let putBody = String(b.value ?? '');
    let putType = 'text/plain';
    if (b.binary === true) {
      const bin = atob(String(b.value || ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      putBody = bytes;
      putType = 'application/octet-stream';
    }
    const r = await fetch(`https://api.cloudflare.com/client/v4${base(acct, b.ns)}/values/${encodeURIComponent(b.key)}`, {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + acct.token, 'Content-Type': putType }, body: putBody,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.success === false) throw new Error((data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status));
    await addAudit(env, a.sess.user, 'kv.put', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${base(acct, url.searchParams.get('ns'))}/values/${encodeURIComponent(url.searchParams.get('key'))}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'kv.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
