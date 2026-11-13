// Management (write-capable) helpers for YM CF Panel v2.
// Every caller must pass requireAuth first. Tokens stay server-side.
import { getAccounts } from './_store.js';

const API = 'https://api.cloudflare.com/client/v4';

export async function resolveAccount(env, panelId) {
  const list = await getAccounts(env);
  const acct = list.find((x) => x.id === panelId);
  if (!acct) throw Object.assign(new Error('账号不存在'), { status: 404 });
  return acct;
}

export async function cfApi(account, path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + account.token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok || data.success === false) {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status);
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return data;
}

// ---- Full-pagination helpers (hidden-cap governance) -----------------------
// Cloudflare v4 list APIs are page-based (page / per_page + result_info).
// Calling them once with per_page=50 silently truncates every larger list, so
// every management list in the panel goes through these helpers instead.
// Guardrails (anti-runaway): per_page=100, at most 50 pages / 5000 items per
// list. If the real total exceeds the guard, the returned result_info carries
// truncated:true plus the real total_count so callers can surface it instead
// of pretending the list is complete.
export const LIST_GUARD = { perPage: 100, maxPages: 50, maxItems: 5000 };

function stripPaging(path) {
  const q = path.indexOf('?');
  if (q < 0) return path;
  const kept = path.slice(q + 1).split('&').filter((kv) => kv && !kv.startsWith('per_page=') && !kv.startsWith('page='));
  return kept.length ? path.slice(0, q) + '?' + kept.join('&') : path.slice(0, q);
}

// Merge every page of a list endpoint whose `result` is a plain array.
// Returns the cfApi shape ({ result, result_info }) so existing .result
// consumers keep working; result_info is normalised to
// { count, total_count, truncated }.
export async function cfApiAll(account, path, opts = {}) {
  const { perPage = LIST_GUARD.perPage, maxPages = LIST_GUARD.maxPages, maxItems = LIST_GUARD.maxItems, ...fetchOpts } = opts;
  const base = stripPaging(path);
  const sep = base.includes('?') ? '&' : '?';
  const all = [];
  let total = null;
  let prevFirst = null;
  let cursor = null, dupBreak = false;
  for (let page = 1; page <= maxPages; page++) {
    // Cursor-paginated endpoints (e.g. R2 buckets) ignore `page`; follow
    // result_info.cursor when the endpoint offers one.
    const qs = cursor ? `per_page=${perPage}&cursor=${encodeURIComponent(cursor)}` : `per_page=${perPage}&page=${page}`;
    const data = await cfApi(account, `${base}${sep}${qs}`, fetchOpts);
    const rows = Array.isArray(data.result) ? data.result : [];
    const info = data.result_info || {};
    if (typeof info.total_count === 'number') total = info.total_count;
    if (!rows.length) break;
    // If the endpoint ignored the paging params it returns page 1 again —
    // detect the repeated first row and stop instead of duplicating rows
    // until total is "reached" (the old guard skipped this when the
    // endpoint reported a total_count, which produced duplicated lists).
    const firstSig = JSON.stringify(rows[0]);
    if (page > 1 && prevFirst !== null && firstSig === prevFirst) { dupBreak = true; break; }
    prevFirst = firstSig;
    all.push(...rows);
    if (all.length >= maxItems) break;
    if (total !== null && all.length >= total) break;
    if (typeof info.cursor === 'string' && info.cursor) { cursor = info.cursor; continue; }
    if (cursor) break;
    if (info.total_pages && page >= info.total_pages) break;
    if (!info.total_pages && total === null && rows.length < perPage) break;
  }
  const truncated = dupBreak || (total !== null && all.length < total) || all.length >= maxItems && (total === null || all.length < total);
  return {
    result: all.slice(0, maxItems),
    result_info: { count: Math.min(all.length, maxItems), total_count: total !== null ? total : all.length, truncated: !!truncated },
  };
}

// Same, for endpoints whose array lives inside result, e.g.
// R2 buckets (result.buckets), Images (result.images), Workers versions
// (result.items). Other fields of the first page's result are preserved.
export async function cfApiAllNested(account, path, key, opts = {}) {
  const { perPage = LIST_GUARD.perPage, maxPages = LIST_GUARD.maxPages, maxItems = LIST_GUARD.maxItems, ...fetchOpts } = opts;
  const base = stripPaging(path);
  const sep = base.includes('?') ? '&' : '?';
  const all = [];
  let total = null;
  let firstResult = {};
  let prevFirst = null;
  let cursor = null, dupBreak = false;
  for (let page = 1; page <= maxPages; page++) {
    const qs = cursor ? `per_page=${perPage}&cursor=${encodeURIComponent(cursor)}` : `per_page=${perPage}&page=${page}`;
    const data = await cfApi(account, `${base}${sep}${qs}`, fetchOpts);
    if (page === 1 && data.result && typeof data.result === 'object') firstResult = data.result;
    const rows = (data.result && Array.isArray(data.result[key])) ? data.result[key] : [];
    const info = data.result_info || {};
    if (typeof info.total_count === 'number') total = info.total_count;
    if (!rows.length) break;
    const firstSig = JSON.stringify(rows[0]);
    if (page > 1 && prevFirst !== null && firstSig === prevFirst) { dupBreak = true; break; }
    prevFirst = firstSig;
    all.push(...rows);
    if (all.length >= maxItems) break;
    if (total !== null && all.length >= total) break;
    if (typeof info.cursor === 'string' && info.cursor) { cursor = info.cursor; continue; }
    if (cursor) break;
    if (info.total_pages && page >= info.total_pages) break;
    if (!info.total_pages && total === null && rows.length < perPage) break;
  }
  const truncated = dupBreak || (total !== null && all.length < total) || (all.length >= maxItems && (total === null || all.length < total));
  return {
    result: { ...firstResult, [key]: all.slice(0, maxItems) },
    result_info: { count: Math.min(all.length, maxItems), total_count: total !== null ? total : all.length, truncated: !!truncated },
  };
}

export function fail(e) {
  return new Response(JSON.stringify({ error: String(e.message || e) }), {
    status: e.status || 500,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
