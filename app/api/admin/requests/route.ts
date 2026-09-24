import { env } from 'cloudflare:workers';
import { getCustomerSession } from '@/lib/auth';
import { readJsonObject, RequestInputError } from '@/lib/request-input';
import { requestKinds, requestStatuses } from '@/lib/request-status';

type Bindings = { DB: D1Database; KORA_ADMIN_USER_IDS?: string };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }); }
async function authorize(request: Request) {
  const bindings = env as unknown as Bindings;
  const ids = (bindings.KORA_ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!ids.length) return { response: json({ error: 'The team workspace is not activated yet.' }, 503) };
  const session = await getCustomerSession(request);
  if (!session) return { response: json({ error: 'Sign in with your team account.' }, 401) };
  if (!ids.includes(session.user.id)) return { response: json({ error: 'This account does not have team access.' }, 403) };
  return { db: bindings.DB, userId: session.user.id };
}

export async function GET(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const { db } = access;
    const search = new URL(request.url).searchParams;
    const id = search.get('id');
    if (id) {
      const result = await db.prepare('SELECT r.*,COALESCE(v.version,0) AS version FROM requests r LEFT JOIN request_versions v ON v.request_id=r.id WHERE r.id=?').bind(id.slice(0,80)).first();
      if (!result) return json({ error: 'Request not found.' }, 404);
      const updates = await db.prepare('SELECT id,status,message,created FROM request_updates WHERE request_id=? ORDER BY created DESC,id DESC LIMIT 100').bind(id).all();
      return json({ request: { ...result, data: JSON.parse(String(result.data)), updates: updates.results } });
    }
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    const status = search.get('status'), kind = search.get('kind'), query = search.get('q')?.trim().slice(0,120);
    if (status) { if (!(requestStatuses as readonly string[]).includes(status)) return json({ error: 'Unknown status.' }, 400); conditions.push('r.status=?'); values.push(status); }
    if (kind) { if (!(requestKinds as readonly string[]).includes(kind)) return json({ error: 'Unknown request type.' }, 400); conditions.push('r.kind=?'); values.push(kind); }
    if (query) { conditions.push("(instr(lower(r.id),lower(?))>0 OR instr(lower(json_extract(r.data,'$.name')),lower(?))>0 OR instr(lower(json_extract(r.data,'$.email')),lower(?))>0)"); values.push(query,query,query); }
    const offset = Number(search.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return json({ error: 'Invalid page.' }, 400);
    const results = await db.prepare(`SELECT r.id,r.kind,r.status,r.created,json_extract(r.data,'$.name') AS name,json_extract(r.data,'$.city') AS city FROM requests r ${conditions.length ? 'WHERE '+conditions.join(' AND ') : ''} ORDER BY r.created DESC,r.id DESC LIMIT 41 OFFSET ?`).bind(...values,offset).all();
    return json({ requests: results.results.slice(0,40), hasMore: results.results.length > 40, offset });
  } catch { console.error('Team request read unavailable'); return json({ error: 'The request workspace is temporarily unavailable.' }, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403);
    const access = await authorize(request);
    if (access.response) return access.response;
    const { db, userId } = access;
    const body = await readJsonObject(request, 10000);
    const id = typeof body.id === 'string' ? body.id : '';
    const status = typeof body.status === 'string' ? body.status : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const version = body.version;
    if (!id || id.length > 80 || !(requestStatuses as readonly string[]).includes(status) || !message || message.length > 2000 || !Number.isInteger(version) || Number(version) < 0) return json({ error: 'Choose a status and add a customer update of up to 2,000 characters.' }, 400);
    const existing = await db.prepare('SELECT id,kind FROM requests WHERE id=?').bind(id).first();
    if (!existing) return json({ error: 'Request not found.' }, 404);
    const now = new Date().toISOString();
    let quote: { amountMinor: number; currency: string; validUntil: string; issuedAt: string } | null = null;
    if (status === 'Quotation ready') {
      const amountMinor = body.amountMinor;
      const validUntil = typeof body.validUntil === 'string' ? body.validUntil : '';
      const expiry = Date.parse(validUntil);
      if (!Number.isSafeInteger(amountMinor) || Number(amountMinor) <= 0 || Number(amountMinor) > 100000000 || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 90*86400000) return json({ error: 'Enter the complete GHS total and a future expiry within 90 days.' }, 400);
      quote = { amountMinor: Number(amountMinor), currency: 'GHS', validUntil: new Date(expiry).toISOString(), issuedAt: now };
    }
    const operation = crypto.randomUUID();
    const guard = 'EXISTS (SELECT 1 FROM request_versions WHERE request_id=? AND last_operation=?)';
    const results = await db.batch([
      db.prepare('INSERT OR IGNORE INTO request_versions(request_id,version) VALUES(?,0)').bind(id),
      db.prepare('UPDATE request_versions SET version=version+1,last_operation=? WHERE request_id=? AND version=? RETURNING version').bind(operation,id,version),
      quote ? db.prepare(`UPDATE requests SET status=?,data=json_set(data,'$.quote',json(?)) WHERE id=? AND ${guard}`).bind(status,JSON.stringify(quote),id,id,operation) : db.prepare(`UPDATE requests SET status=? WHERE id=? AND ${guard}`).bind(status,id,id,operation),
      db.prepare(`INSERT INTO request_updates(id,request_id,actor,status,message,created) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(operation,id,userId,status,message,now,id,operation),
    ]);
    if (!results[1].results.length) return json({ error: 'Another team member updated this request. Refresh it before saving again.' }, 409);
    return json({ ok: true, version: Number(version)+1 });
  } catch (error) {
    if (error instanceof RequestInputError) return json({ error: error.message }, error.status);
    console.error('Team request update unavailable'); return json({ error: 'The update could not be saved. Please retry.' }, 503);
  }
}
