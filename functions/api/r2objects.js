import { requireAuth, json, readBody } from '../_auth.js';
import { getAccounts, addAudit } from '../_store.js';
import { resolveAccount, fail } from '../_manage.js';

// R2 object storage via the S3-compatible API (SigV4 signed in-function).
// The REST API cannot touch objects, so per-account S3 credentials (created in
// the R2 dashboard) are stored server-side in the panel KV, never returned.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256(data) { return crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data); }
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
async function signingKey(secret, date) {
  let k = await hmac('AWS4' + secret, date);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  return k;
}
const credKey = (id) => 'r2s3:' + id;

async function getCred(env, panelId) {
  const raw = await env.PANEL_KV.get(credKey(panelId));
  return raw ? JSON.parse(raw) : null;
}
async function s3(acct, cred, method, path, { query = {}, body = null, payloadHash = null } = {}) {
  const host = `${acct.accountId}.r2.cloudflarestorage.com`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = stamp.slice(0, 8);
  const hash = payloadHash || hex(await sha256(body || ''));
  const qs = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const headers = { host, 'x-amz-content-sha256': hash, 'x-amz-date': stamp };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canon = [method, path, qs, canonHeaders, signedHeaders, hash].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hex(await sha256(canon))].join('\n');
  const sig = hex(await hmac(await signingKey(cred.sk, date), toSign));
  const url = `https://${host}${path}${qs ? '?' + qs : ''}`;
  const resp = await fetch(url, { method, headers: { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${cred.ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` }, body });
  return resp;
}
async function presign(acct, cred, bucket, key, expiresSec) {
  const host = `${acct.accountId}.r2.cloudflarestorage.com`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = stamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const path = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cred.ak}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'host',
  };
  const qs = Object.entries(query).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canon = ['GET', path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hex(await sha256(canon))].join('\n');
  const sig = hex(await hmac(await signingKey(cred.sk, date), toSign));
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}
const objPath = (bucket, key) => `/${bucket}/${(key || '').split('/').map(encodeURIComponent).join('/')}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const panelId = url.searchParams.get('account');
    const cred = await getCred(env, panelId);
    if (url.searchParams.get('what') === 'cred') {
      return json({ configured: !!cred, akLast4: cred ? cred.ak.slice(-4) : '' });
    }
    if (!cred) return json({ error: '这个账号还没填 R2 的 S3 密钥（在 CF 后台 R2 页右上角「管理 R2 API 令牌」创建）' }, 400);
    const acct = await resolveAccount(env, panelId);
    const bucket = url.searchParams.get('bucket');
    const prefix = url.searchParams.get('prefix') || '';
    if (url.searchParams.get('what') === 'download') {
      const link = await presign(acct, cred, bucket, url.searchParams.get('key'), 3600);
      return json({ url: link });
    }
    const resp = await s3(acct, cred, 'GET', `/${bucket}`, { query: { 'list-type': '2', prefix, delimiter: '/', 'max-keys': '200' } });
    const text = await resp.text();
    if (!resp.ok) return json({ error: `S3 接口 ${resp.status}：${text.slice(0, 160)}` }, 502);
    const folders = [...text.matchAll(/<CommonPrefixes><Prefix>([^<]*)<\/Prefix>/g)].map((m) => m[1]);
    const objects = [...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => {
      const block = m[1];
      const pick = (tag) => { const mm = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)); return mm ? mm[1] : ''; };
      return { key: pick('Key'), size: Number(pick('Size')), modified: pick('LastModified') };
    }).filter((o) => o.key && o.key !== prefix);
    return json({ folders, objects, prefix });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    if (b.what === 'setcred') {
      const accounts = await getAccounts(env);
      if (!accounts.some((x) => x.id === b.account)) return json({ error: '账号不存在' }, 404);
      if (b.clear) { await env.PANEL_KV.delete(credKey(b.account)); return json({ ok: true }); }
      const ak = String(b.ak || '').trim(); const sk = String(b.sk || '').trim();
      if (ak.length < 10 || sk.length < 10) return json({ error: 'Access Key ID / Secret 太短，不像有效密钥' }, 400);
      await env.PANEL_KV.put(credKey(b.account), JSON.stringify({ ak, sk }));
      await addAudit(env, a.sess.user, 'r2.s3cred', '已保存 R2 S3 密钥');
      return json({ ok: true });
    }
    const cred = await getCred(env, b.account);
    if (!cred) return json({ error: '还没填 S3 密钥' }, 400);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'upload') {
      const bytes = Uint8Array.from(atob(String(b.data || '')), (c) => c.charCodeAt(0));
      if (bytes.length > 4 * 1024 * 1024) return json({ error: '面板上传上限 4MB，更大的文件请用 S3 工具' }, 400);
      const resp = await s3(acct, cred, 'PUT', objPath(b.bucket, b.key), { body: bytes, payloadHash: hex(await sha256(bytes)) });
      if (!resp.ok) return json({ error: `上传失败 ${resp.status}：${(await resp.text()).slice(0, 160)}` }, 502);
      await addAudit(env, a.sess.user, 'r2.upload', `${b.bucket}/${b.key}`);
      return json({ ok: true });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const cred = await getCred(env, url.searchParams.get('account'));
    if (!cred) return json({ error: '还没填 S3 密钥' }, 400);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const resp = await s3(acct, cred, 'DELETE', objPath(url.searchParams.get('bucket'), url.searchParams.get('key')));
    if (!resp.ok && resp.status !== 204) return json({ error: `删除失败 ${resp.status}` }, 502);
    await addAudit(env, a.sess.user, 'r2.delete', `${url.searchParams.get('bucket')}/${url.searchParams.get('key')}`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
