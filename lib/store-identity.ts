import { getCustomerSession } from './auth';

const guestPattern = /(?:^|;\s*)kora_session=([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(?:;|$)/;
export function guestCookie(request: Request, id = '', maxAge = 2592000) {
  return `kora_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export async function storeIdentity(request: Request, db: D1Database) {
  const session = await getCustomerSession(request);
  const guestId = guestPattern.exec(request.headers.get('cookie') || '')?.[1];
  if (session) return { owner: `account:${session.user.id}`, user: session.user, guestOwner: guestId ? `guest:${guestId}` : null, cookie: '' };
  let id = guestId;
  // A claimed guest cookie is permanently retired, including after sign-out.
  if (id) {
    const claim = await db.prepare('SELECT account_owner FROM guest_claims WHERE guest_owner=?').bind(`guest:${id}`).all();
    if (claim.results.length) id = undefined;
  }
  id ||= crypto.randomUUID();
  return { owner: `guest:${id}`, user: null, guestOwner: null, cookie: id === guestId ? '' : guestCookie(request, id) };
}

export async function claimGuest(db: D1Database, guestOwner: string, accountOwner: string) {
  // D1 batches are transactional. Every write checks the first claim, so a
  // replay or a concurrent sign-in cannot give the same guest data to two users.
  const guard = 'EXISTS (SELECT 1 FROM guest_claims WHERE guest_owner=? AND account_owner=?)';
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO guest_claims(guest_owner,account_owner,created) VALUES(?,?,?)').bind(guestOwner, accountOwner, new Date().toISOString()),
    db.prepare(`INSERT INTO basket(owner,product,quantity) SELECT ?,product,quantity FROM basket WHERE owner=? AND ${guard} ON CONFLICT(owner,product) DO UPDATE SET quantity=MIN(20,basket.quantity+excluded.quantity)`).bind(accountOwner, guestOwner, guestOwner, accountOwner),
    db.prepare(`INSERT OR IGNORE INTO saved(owner,product) SELECT ?,product FROM saved WHERE owner=? AND ${guard}`).bind(accountOwner, guestOwner, guestOwner, accountOwner),
    db.prepare(`INSERT OR IGNORE INTO profiles(owner,data) SELECT ?,data FROM profiles WHERE owner=? AND ${guard}`).bind(accountOwner, guestOwner, guestOwner, accountOwner),
    db.prepare(`UPDATE requests SET owner=? WHERE owner=? AND ${guard}`).bind(accountOwner, guestOwner, guestOwner, accountOwner),
    ...['basket', 'saved', 'profiles'].map(table => db.prepare(`DELETE FROM ${table} WHERE owner=? AND ${guard}`).bind(guestOwner, guestOwner, accountOwner)),
  ]);
}
