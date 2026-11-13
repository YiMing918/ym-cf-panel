import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

function bodyOf(b) {
  const out = { type: String(b.type || 'A').toUpperCase(), name: String(b.name || '').trim(), content: String(b.content || '').trim(), ttl: Number(b.ttl) || 1 };
  if (['A', 'AAAA', 'CNAME'].includes(out.type)) out.proxied = !!b.proxied;
  if (out.type === 'MX') out.priority = Number(b.priority) || 10;
  if (b.comment !== undefined) out.comment = String(b.comment || '').slice(0, 100);
  if (Array.isArray(b.tags)) out.tags = b.tags.map((t) => String(t).slice(0, 50)).slice(0, 20);
  // SRV / CAA 在 CF API 里要 data 对象，只给 content 大概率被拒：
  // 把常见文本形态解析成 data（SRV: "权重 端口 目标"（优先级走 priority
  // 字段或写在最前）；CAA: "flags tag value"）
  if (out.type === 'SRV') {
    const parts = out.content.split(/\s+/);
    const nums = parts.length === 4 ? parts : (parts.length === 3 ? [String(Number(b.priority) || 0), ...parts] : null);
    if (nums && nums.slice(0, 3).every((x) => /^\d+$/.test(x))) {
      out.data = { priority: Number(nums[0]), weight: Number(nums[1]), port: Number(nums[2]), target: nums[3] };
      delete out.content;
    }
  }
  if (out.type === 'CAA') {
    const m = out.content.match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (m) { out.data = { flags: Number(m[1]), tag: m[2], value: m[3].replace(/^"|"$/g, '') }; delete out.content; }
  }
  if (!out.name || (!out.content && !out.data)) throw new Error('名称和内容都要填');
  return out;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    if (!zone) return json({ error: '缺少 zone' }, 400);
    const all = [];
    let totalCount = 0;
    for (let page = 1; page <= 50; page++) { // guard: 50 pages x 100 = 5000 records max; total/truncated below surface any excess
      const data = await cfApi(acct, `/zones/${zone}/dns_records?per_page=100&page=${page}`);
      const rows = data.result || [];
      if (data.result_info && data.result_info.total_count) totalCount = data.result_info.total_count;
      all.push(...rows);
      const totalPages = (data.result_info && data.result_info.total_pages) || 0;
      if (!rows.length || (totalPages ? page >= totalPages : rows.length < 100)) break;
    }
    return json({ records: all.map((r) => ({ id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: !!r.proxied, priority: r.priority, comment: r.comment || '', tags: r.tags || [] })), total: totalCount || all.length, truncated: totalCount > all.length });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const data = await cfApi(acct, `/zones/${b.zone}/dns_records`, { method: 'POST', body: JSON.stringify(bodyOf(b)) });
    await addAudit(env, a.sess.user, 'dns.create', `${acct.name} · ${b.type || ''} ${b.name || ''}`);
    return json({ ok: true, record: data.result });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    // 改 PATCH 部分更新：以前 PUT 整条覆盖，bodyOf 没组装的字段
    // （comment / tags）会被 CF 清掉；PATCH 只改提交的字段，其余保留
    const data = await cfApi(acct, `/zones/${b.zone}/dns_records/${b.id}`, { method: 'PATCH', body: JSON.stringify(bodyOf(b)) });
    await addAudit(env, a.sess.user, 'dns.update', `${acct.name} · ${b.type || ''} ${b.name || ''}`);
    return json({ ok: true, record: data.result });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/dns_records/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'dns.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
