import { env } from 'cloudflare:workers';
import { catalogue, ghPrice, ghanaPesewas } from '@/lib/catalogue';
import { storeIdentity, claimGuest, guestCookie } from '@/lib/store-identity';
import { getProductOptionSnapshot } from '@/lib/product-variants';
import { allowRequest, readJsonObject, RequestInputError, sha256 } from '@/lib/request-input';
import { requestKinds } from '@/lib/request-status';

const products = new Map(catalogue.map(product => [product.id, product]));
const guestWriteGuard = 'NOT EXISTS (SELECT 1 FROM guest_claims WHERE guest_owner=?)';
function db() { const value = (env as unknown as { DB: D1Database }).DB; if (!value) throw new Error('Storage unavailable'); return value; }
function response(data: unknown, cookie = '', status = 200, headers: Record<string,string> = {}) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}), ...headers } }); }
function record(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestInputError('Check your form details.'); return value as Record<string,unknown>; }
function field(value: unknown, maximum: number) { if (value == null) return ''; if (typeof value !== 'string' || value.length > maximum) throw new RequestInputError('A form field is invalid or too long.'); return value.trim(); }
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
async function rejectRetiredGuest(owner: string) {
  if (owner.startsWith('guest:') && await db().prepare('SELECT account_owner FROM guest_claims WHERE guest_owner=?').bind(owner).first()) throw new RequestInputError('Your sign-in changed while saving. Please retry; your form has been kept.',409);
}
async function applyShoppingChange(statement: D1PreparedStatement, owner: string) {
  const result = await statement.run();
  if (!result.meta.changes) await rejectRetiredGuest(owner);
}
type BasketRow = { product: string; quantity: number };
type RequestRow = { id: string; kind: string; data: string; status: string; created: string };
type RequestUpdate = { request_id: string; status: string; message: string; created: string };

export async function GET(request: Request) {
  let cookie = '';
  try {
    const identity = await storeIdentity(request, db());
    const { owner, user, guestOwner } = identity; cookie = identity.cookie;
    const results = await db().batch([
      db().prepare('SELECT product,quantity FROM basket WHERE owner=?').bind(owner),
      db().prepare('SELECT product FROM saved WHERE owner=?').bind(owner),
      db().prepare('SELECT data FROM profiles WHERE owner=?').bind(owner),
      db().prepare('SELECT id,kind,data,status,created FROM requests WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner),
      db().prepare('SELECT u.request_id,u.status,u.message,u.created FROM request_updates u JOIN requests r ON r.id=u.request_id WHERE r.owner=? ORDER BY u.created DESC,u.id DESC LIMIT 500').bind(owner),
    ]);
    const updates = results[4].results as unknown as RequestUpdate[];
    return response({
      cart: results[0].results,
      saved: (results[1].results as unknown as { product: string }[]).map(value => value.product),
      profile: results[2].results[0] ? JSON.parse(String((results[2].results[0] as { data: string }).data)) : user ? { name: user.name, email: user.email } : {},
      requests: (results[3].results as unknown as RequestRow[]).map(value => ({ ...value, data: JSON.parse(value.data), updates: updates.filter(update => update.request_id === value.id).map(({ status, message, created }) => ({ status, message, created })) })),
      email: user?.email || null, user: user ? { name: user.name, email: user.email } : null,
      guestPending: Boolean(user && guestOwner),
    }, cookie);
  } catch { console.error('Store read unavailable'); return response({ error: 'Your saved shopping information is temporarily unavailable. Please try again.' }, cookie, 503); }
}

export async function POST(request: Request) {
  let cookie = '';
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return response({ error: 'Invalid request origin' }, cookie, 403);
    // Bound/validate input before resolving sessions or touching database storage.
    const body = await readJsonObject(request);
    const identity = await storeIdentity(request, db());
    const { owner, user, guestOwner } = identity; cookie = identity.cookie;
    const action = body.action;
    if (action === 'claimGuest') {
      if (!user) return response({ error: 'Sign in to save this shopping session to your account.' }, cookie, 401);
      if (guestOwner) await claimGuest(db(), guestOwner, owner);
      return response({ ok: true }, guestCookie(request, '', 0));
    }
    if (action === 'cart') {
      if (typeof body.product !== 'string' || !products.has(body.product) || !Number.isInteger(body.quantity) || Number(body.quantity) < 0 || Number(body.quantity) > 20) return response({ error: 'Choose a valid product and a quantity from 1 to 20.' }, cookie, 400);
      if (body.quantity === 0) await applyShoppingChange(db().prepare(`DELETE FROM basket WHERE owner=? AND product=? AND ${guestWriteGuard}`).bind(owner, body.product, owner),owner);
      else await applyShoppingChange(db().prepare(`INSERT INTO basket(owner,product,quantity) SELECT ?,?,? WHERE ${guestWriteGuard} ON CONFLICT(owner,product) DO UPDATE SET quantity=excluded.quantity`).bind(owner, body.product, body.quantity,owner),owner);
    } else if (action === 'save') {
      if (typeof body.product !== 'string' || !products.has(body.product) || typeof body.value !== 'boolean') return response({ error: 'Choose a valid product and saved state.' }, cookie, 400);
      if (body.value) await applyShoppingChange(db().prepare(`INSERT OR IGNORE INTO saved(owner,product) SELECT ?,? WHERE ${guestWriteGuard}`).bind(owner, body.product,owner),owner);
      else await applyShoppingChange(db().prepare(`DELETE FROM saved WHERE owner=? AND product=? AND ${guestWriteGuard}`).bind(owner, body.product,owner),owner);
    } else if (action === 'profile') {
      const profile = record(body.profile);
      const value = { name: field(profile.name,120), email: field(profile.email,160), phone: field(profile.phone,30), city: field(profile.city,70) || 'Accra', address: field(profile.address,300), digitalAddress: field(profile.digitalAddress,50) };
      if (value.email && !validEmail(value.email)) return response({ error: 'Enter a valid email address.' }, cookie, 400);
      await applyShoppingChange(db().prepare(`INSERT INTO profiles(owner,data) SELECT ?,? WHERE ${guestWriteGuard} ON CONFLICT(owner) DO UPDATE SET data=excluded.data`).bind(owner,JSON.stringify(value),owner),owner);
    } else if (action === 'request') {
      if (typeof body.kind !== 'string' || !(requestKinds as readonly string[]).includes(body.kind)) return response({ error: 'Choose a valid request type' }, cookie, 400);
      const form = record(body.form);
      if (field(form.website,200)) return response({ error: 'Please leave the optional website field empty.' }, cookie, 400);
      const payload: Record<string,unknown> = { name: field(form.name,120), email: field(form.email,160), phone: field(form.phone,30), city: field(form.city,70) || 'Accra', address: field(form.address,300), digitalAddress: field(form.digitalAddress,50), service: body.kind==='quote'?'':field(form.service,150), message: field(form.message,3000), paymentPreference: field(form.paymentPreference,80) || 'Mobile money' };
      if (!payload.name || !validEmail(String(payload.email))) return response({ error: 'Your name and a valid email are required.' }, cookie, 400);
      if (body.kind === 'quote' && !payload.address) return response({ error: 'Add your delivery address so we can prepare a complete quotation.' }, cookie, 400);
      if (body.kind !== 'quote' && !payload.message) return response({ error: 'Tell us what you need before saving your request.' }, cookie, 400);
      const key = body.idempotencyKey === undefined ? crypto.randomUUID() : body.idempotencyKey;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) return response({ error: 'Invalid request reference. Reload the form and try again.' }, cookie, 400);
      const hash = await sha256(JSON.stringify({ kind: body.kind, form: payload }));
      const previous = await db().prepare('SELECT request_id,body_hash FROM request_keys WHERE owner=? AND key=?').bind(owner,key).first();
      if (previous) return previous.body_hash === hash ? response({ ok: true, id: previous.request_id }, cookie) : response({ error: 'This request has already been saved with different details. Start a new request.' }, cookie, 409);
      if (body.kind === 'quote') {
        const basket = await db().prepare('SELECT product,quantity FROM basket WHERE owner=?').bind(owner).all();
        const items = (basket.results as unknown as BasketRow[]).map(value => { const product = products.get(value.product); return product ? { id: product.id, name: product.name, quantity: value.quantity, options: getProductOptionSnapshot(product.id), indicativeUnitPrice: ghPrice(product) } : null; }).filter((value): value is NonNullable<typeof value> => value !== null);
        if (!items.length) return response({ error: 'Add a product before requesting a quote.' }, cookie, 400);
        payload.items = items;
        payload.indicativeTotal = items.some(item => item.indicativeUnitPrice !== null) ? items.reduce((sum,item) => sum + item.quantity*(ghanaPesewas(item.indicativeUnitPrice || 0) ?? 0),0)/100 : null;
        payload.unpricedQuantity = items.filter(item => item.indicativeUnitPrice === null).reduce((sum,item)=>sum+item.quantity,0);
        payload.priceType = 'Approved KORA GHS selling prices; unpriced items require quotation';
        payload.currency = 'GHS'; payload.paymentStatus = 'No payment collected';
      }
      if (!await allowRequest(db(),request,owner)) return response({ error: 'You have sent several requests recently. Please wait before sending another; your existing requests are saved.' },cookie,429,{'Retry-After':'3600'});
      const id = 'KR-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
      const created = new Date().toISOString();
      await db().batch([
        db().prepare(`INSERT INTO request_keys(owner,key,request_id,body_hash,created) SELECT ?,?,?,?,? WHERE ${guestWriteGuard} ON CONFLICT(owner,key) DO NOTHING`).bind(owner,key,id,hash,created,owner),
        db().prepare(`INSERT INTO requests(id,owner,kind,data,status,created) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM request_keys WHERE owner=? AND key=? AND request_id=?) AND ${guestWriteGuard}`).bind(id,owner,body.kind,JSON.stringify(payload),'Request received',created,owner,key,id,owner),
      ]);
      const saved = await db().prepare('SELECT request_id,body_hash FROM request_keys WHERE owner=? AND key=?').bind(owner,key).first();
      if (!saved) { await rejectRetiredGuest(owner); throw new Error('Request was not saved'); }
      return saved.body_hash === hash ? response({ ok: true, id: saved.request_id }, cookie) : response({ error: 'This request has already been saved with different details. Start a new request.' }, cookie, 409);
    } else return response({ error: 'Unknown action' },cookie,400);
    return response({ ok: true },cookie);
  } catch (error) {
    if (error instanceof RequestInputError) return response({ error: error.message },cookie,error.status);
    console.error('Store update unavailable'); return response({ error: 'We could not save that change. Your form has been kept. Please try again.' },cookie,503);
  }
}
