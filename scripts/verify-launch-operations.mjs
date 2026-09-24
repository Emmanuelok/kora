import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Execute the actual API, Better Auth and Drizzle code. Only Cloudflare's D1
// transport is replaced by SQLite, including serial, atomic batch transactions.
globalThis.__koraLaunchTestBindings = {};
const rootUrl = pathToFileURL(process.cwd() + '/').href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__koraLaunchTestBindings;', shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL(specifier.slice(2) + '.ts', rootUrl).href, shortCircuit: true };
    if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith(rootUrl) && !context.parentURL.includes('/node_modules/')) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (fs.existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(rootUrl) && !url.includes('/node_modules/')) {
      if (url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: 'export default ' + fs.readFileSync(fileURLToPath(url), 'utf8') };
      if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
    }
    return nextLoad(url, context);
  },
});

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const migration of ['0000_redundant_wolfsbane.sql', '0001_customer_auth.sql', '0002_launch_operations.sql']) sqlite.exec(fs.readFileSync('drizzle/' + migration, 'utf8'));
let batchQueue = Promise.resolve(), failSqlContaining = '', beforeWriteHook;
const DB = {
  prepare(sql) {
    let values = [];
    const statement = () => {
      if (failSqlContaining && sql.includes(failSqlContaining)) throw new Error('Synthetic D1 failure');
      return sqlite.prepare(sql);
    };
    const execute = () => ({ success: true, results: statement().all(...values), meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n } });
    return {
      bind(...args) { values = args; return this; },
      _execute: execute,
      _sql: sql, _values: () => values,
      async run() {
        if (beforeWriteHook?.matches(sql, values)) {
          const hook = beforeWriteHook; beforeWriteHook = undefined;
          await hook.run();
        }
        return { success: true, results: [], meta: statement().run(...values) };
      },
      async all() { return execute(); },
      async raw() { const query = statement(); query.setReturnArrays(true); return query.all(...values); },
      async first(column) { const row = statement().get(...values); return column ? row?.[column] ?? null : row ?? null; },
    };
  },
  batch(statements) {
    // Interleave a real claim before BEGIN, never inside an atomic D1 batch.
    if (beforeWriteHook && statements.some(statement => beforeWriteHook.matches(statement._sql, statement._values()))) {
      const hook = beforeWriteHook; beforeWriteHook = undefined;
      return hook.run().then(() => DB.batch(statements));
    }
    const result = batchQueue.then(() => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement._execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    batchQueue = result.catch(() => {});
    return result;
  },
};
const origin = 'https://kora.example';
const bindings = globalThis.__koraLaunchTestBindings;
Object.assign(bindings, { DB, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: 'launch-test-only-secret-abcdefghijklmnopqrstuvwxyz-0123456789' });
const store = await import('../app/api/store/route.ts');
const admin = await import('../app/api/admin/requests/route.ts');
const { handleCustomerAuth } = await import('../lib/auth-core.ts');
const { catalogue, ghPrice } = await import('../lib/catalogue.ts');
const { productFamilies, getProductOptionSnapshot } = await import('../lib/product-variants.ts');
const checks = [];
let nextIp = 1;
function request(endpoint, customer, body, headers = {}, raw) {
  const hasBody = body !== undefined || raw !== undefined;
  return new Request(origin + endpoint, {
    method: hasBody ? 'POST' : 'GET',
    headers: { Origin: origin, Cookie: customer?.cookie || '', ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(hasBody ? { body: raw === undefined ? JSON.stringify(body) : raw } : {}),
  });
}
const storePost = (customer, body, headers = {}) => store.POST(request('/api/store', customer, body, headers));
const adminPost = (customer, body, headers = {}) => admin.POST(request('/api/admin/requests', customer, body, headers));
const adminGet = (customer, query = '', headers = {}) => admin.GET(request('/api/admin/requests' + query, customer, undefined, headers));
async function expect(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
async function customerState(customer, query = '') { return expect(await store.GET(request('/api/store' + query, customer)), 200); }
async function signup(email, name) {
  const response = await handleCustomerAuth(request('/api/auth/sign-up/email', null, { email, name, password: 'Launch-fixture-password-2026', callbackURL: '/account' }, { 'CF-Connecting-IP': `198.51.100.${nextIp++}` }), bindings);
  const data = await expect(response, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('__Secure-kora.auth.session_token='))?.split(';')[0];
  assert(cookie, 'Actual Better Auth signup must return a signed session');
  return { id: data.user.id, owner: 'account:' + data.user.id, email, cookie };
}
const alice = await signup('launch-alice@example.com', 'Private Alice Fixture');
const bob = await signup('launch-bob@example.com', 'Private Bob Fixture');
const manager = await signup('launch-team@example.com', 'Team Fixture');
const guest = { cookie: 'kora_session=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', owner: 'guest:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' };
const contact = (marker, idempotencyKey = crypto.randomUUID()) => ({ action: 'request', kind: 'contact', idempotencyKey, form: { name: 'Fixture contact', email: 'fixture@example.com', message: marker, city: 'Accra' } });
const quoteBody = {
  action: 'request', kind: 'quote', idempotencyKey: crypto.randomUUID(),
  form: { name: 'Private Alice Fixture', email: alice.email, city: 'Kumasi', address: 'PRIVATE-ADDRESS-TEST-ONLY', message: 'PRIVATE-CUSTOMER-MESSAGE', paymentPreference: 'MTN MoMo' },
};
const selected = catalogue.find(product => product.id === productFamilies[0].variants[0].productId);
await expect(await storePost(alice, { action: 'cart', product: selected.id, quantity: 2 }), 200);
const created = await expect(await storePost(alice, quoteBody), 200);
assert.match(created.id, /^KR-/);
const initialQuote = (await customerState(alice)).requests.find(item => item.id === created.id);
assert.deepEqual(initialQuote.data.items[0].options, getProductOptionSnapshot(selected.id));
assert.equal(initialQuote.data.paymentStatus, 'No payment collected');
assert.equal(initialQuote.data.items[0].indicativeUnitPrice, ghPrice(selected), 'Quote snapshots use current approved prices without test-created catalogue offers');
const bobReceipt = await expect(await storePost(bob, contact('BOB-PRIVATE-MESSAGE')), 200);
sqlite.exec(fs.readFileSync('drizzle/0002_launch_operations.sql', 'utf8'));
assert.equal(sqlite.prepare('SELECT owner FROM requests WHERE id=?').get(created.id).owner, alice.owner, 'Reapplying the additive migration preserves existing requests');

async function assertNoPrivateResponse(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const text = await response.text();
  for (const secret of [alice.email, bob.email, 'Private Alice Fixture', 'PRIVATE-ADDRESS-TEST-ONLY', 'PRIVATE-CUSTOMER-MESSAGE', 'BOB-PRIVATE-MESSAGE', alice.owner, created.id]) assert(!text.includes(secret), 'Unauthorized response leaked owner/request information');
}
await assertNoPrivateResponse(await adminGet(manager, '?id=' + created.id), 503);
await assertNoPrivateResponse(await adminPost(manager, { id: created.id }), 503);
bindings.KORA_ADMIN_USER_IDS = manager.id;
await assertNoPrivateResponse(await adminGet(guest, '?id=' + created.id), 401);
await assertNoPrivateResponse(await adminGet(alice, '?id=' + created.id), 403);
const forged = { 'oai-authenticated-user-id': manager.id, 'oai-authenticated-user-email': manager.email, 'CF-Access-Authenticated-User-Email': manager.email, 'X-User-Role': 'admin' };
await assertNoPrivateResponse(await adminGet(bob, '?id=' + created.id, forged), 403);
await assertNoPrivateResponse(await adminPost(bob, { id: created.id, status: 'Completed', message: 'Forged', version: 0, userId: manager.id }, forged), 403);
await assertNoPrivateResponse(await adminGet(guest, '', forged), 401);
bindings.KORA_ADMIN_USER_IDS = manager.email;
await assertNoPrivateResponse(await adminGet(manager), 403, 'Email addresses must never grant staff authority');
bindings.KORA_ADMIN_USER_IDS = ` prefix-${manager.id}, ${manager.id}-suffix `;
await assertNoPrivateResponse(await adminGet(manager), 403);
bindings.KORA_ADMIN_USER_IDS = ` other-immutable-id, ${manager.id} `;
const listing = await expect(await adminGet(manager), 200);
assert(listing.requests.some(item => item.id === created.id));
assert(listing.requests.some(item => item.id === bobReceipt.id));
assert.equal((await expect(await adminGet(manager, '?id=' + created.id), 200)).request.version, 0);
checks.push('team workspace defaults closed; real immutable account IDs authorize; guests, ordinary accounts, emails and forged headers cannot reveal private records');

const proposal = { id: created.id, status: 'Quotation ready', message: 'Your synthetic test quotation is ready.', version: 0, amountMinor: 75025, validUntil: new Date(Date.now() + 86400000).toISOString() };
for (const foreignOrigin of ['https://outside.example', '', 'null']) {
  await assertNoPrivateResponse(await adminPost(manager, proposal, { Origin: foreignOrigin }), 403);
  await expect(await storePost(alice, contact('Cross-origin rejected'), { Origin: foreignOrigin }), 403);
}
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM request_updates').get().n, 0);
await expect(await adminPost(manager, { ...proposal, amountMinor: 75025.5 }), 400);
await expect(await adminPost(manager, { ...proposal, amountMinor: 0 }), 400);
await expect(await adminPost(manager, { ...proposal, validUntil: new Date(Date.now() - 1000).toISOString() }), 400);
assert.deepEqual(await expect(await adminPost(manager, proposal), 200), { ok: true, version: 1 });
const aliceState = await customerState(alice);
const quoted = aliceState.requests.find(item => item.id === created.id);
assert.equal(quoted.status, 'Quotation ready');
assert.equal(quoted.data.quote.amountMinor, 75025);
assert.equal(quoted.data.quote.currency, 'GHS');
assert.equal(quoted.data.quote.validUntil, proposal.validUntil);
assert(Number.isFinite(Date.parse(quoted.data.quote.issuedAt)));
assert.equal(quoted.updates.length, 1);
assert.deepEqual(Object.keys(quoted.updates[0]).sort(), ['created', 'message', 'status']);
assert.equal(quoted.updates[0].message, proposal.message);
assert.equal(quoted.updates[0].status, 'Quotation ready');
assert(!JSON.stringify(aliceState).includes(manager.id));
for (const customer of [bob, guest]) {
  const state = await customerState(customer, '?id=' + created.id);
  const text = JSON.stringify(state);
  for (const privateValue of [created.id, proposal.message, 'PRIVATE-ADDRESS-TEST-ONLY', 'PRIVATE-CUSTOMER-MESSAGE', alice.email]) assert(!text.includes(privateValue));
}
const snapshot = () => ({ request: sqlite.prepare('SELECT * FROM requests WHERE id=?').get(created.id), version: sqlite.prepare('SELECT * FROM request_versions WHERE request_id=?').get(created.id), updates: sqlite.prepare('SELECT * FROM request_updates WHERE request_id=? ORDER BY id').all(created.id) });
const beforeConflict = snapshot();
await expect(await adminPost(manager, { ...proposal, message: 'Stale conflicting update' }), 409);
assert.deepEqual(snapshot(), beforeConflict, 'Version conflicts cannot alter price, status or event history');
const concurrent = await Promise.all([
  adminPost(manager, { id: created.id, status: 'In review', message: 'Concurrent update A', version: 1 }),
  adminPost(manager, { id: created.id, status: 'Awaiting details', message: 'Concurrent update B', version: 1 }),
]);
assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
assert.equal(snapshot().version.version, 2);
assert.equal(snapshot().updates.length, 2);
const beforeFailure = snapshot();
failSqlContaining = 'INSERT INTO request_updates';
await expect(await adminPost(manager, { id: created.id, status: 'Completed', message: 'Synthetic failure', version: 2 }), 503);
failSqlContaining = '';
assert.deepEqual(snapshot(), beforeFailure, 'Failure writing the update rolls back both version and request changes');
checks.push('staff can publish one GHS quotation and public updates; only the request owner sees them; stale/concurrent writes and partial database failures leave no extra events');

for (const endpoint of ['/api/store', '/api/admin/requests']) {
  const handler = endpoint === '/api/store' ? store : admin;
  const customer = endpoint === '/api/store' ? alice : manager;
  for (const raw of ['{', 'null', '[]', 'false', '"text"', '']) await expect(await handler.POST(request(endpoint, customer, undefined, {}, raw)), 400);
  for (const headers of [{}, { 'Content-Length': '1' }]) await expect(await handler.POST(request(endpoint, customer, undefined, headers, JSON.stringify({ data: 'x'.repeat(25000) }))), 413);
  // Non-ASCII text verifies an actual UTF-8 byte bound, not a JS character bound.
  const limit = endpoint === '/api/store' ? 20000 : 10000;
  const multibyte = JSON.stringify({ data: 'é'.repeat(limit / 2) });
  assert(multibyte.length < limit);
  await expect(await handler.POST(request(endpoint, customer, undefined, {}, multibyte)), 413);
  for (const cancellation of ['rejecting', 'pending']) {
    for (const declaredSize of [undefined, String(limit + 1)]) {
      let cancelled = false;
      const stream = new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(limit + 1)); },
        cancel() {
          cancelled = true;
          return cancellation === 'rejecting' ? Promise.reject(new Error('Synthetic cancellation rejection')) : new Promise(() => {});
        },
      });
      const oversized = new Request(origin + endpoint, {
        method: 'POST', duplex: 'half', body: stream,
        headers: { Origin: origin, Cookie: customer.cookie, 'Content-Type': 'application/json', ...(declaredSize ? { 'Content-Length': declaredSize } : {}) },
      });
      let timer;
      try {
        const response = await Promise.race([
          handler.POST(oversized),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${endpoint} waited for ${cancellation} stream cancellation`)), 2000); }),
        ]);
        await expect(response, 413);
        assert(cancelled, 'The size guard should request cancellation without awaiting its result');
      } finally { clearTimeout(timer); }
    }
  }
}
assert.deepEqual(snapshot(), beforeFailure, 'Malformed and oversized input must not mutate existing requests');
await expect(await storePost(alice, { ...quoteBody, idempotencyKey: crypto.randomUUID(), form: { ...quoteBody.form, address: '' } }), 400);
await expect(await storePost(alice, { ...contact(''), form: { name: 'Fixture', email: 'fixture@example.com' } }), 400);
checks.push('same-origin mutations, required quote address/enquiry message, valid-object JSON and UTF-8 body limits fail safely without writes; rejecting or never-ending stream cancellation cannot block 413');

const ownerCount = owner => sqlite.prepare('SELECT COUNT(*) AS n FROM requests WHERE owner=?').get(owner).n;
const beforeRetry = ownerCount(alice.owner);
const duplicate = await expect(await storePost(alice, quoteBody), 200);
assert.equal(duplicate.id, created.id);
assert.equal(ownerCount(alice.owner), beforeRetry);
await expect(await storePost(alice, { ...quoteBody, form: { ...quoteBody.form, message: 'Changed request content' } }), 409);
assert.equal(ownerCount(alice.owner), beforeRetry);
const raceBody = contact('Concurrent identical request');
const raceCreates = await Promise.all([storePost(bob, raceBody), storePost(bob, raceBody)]);
const raceReceipts = await Promise.all(raceCreates.map(response => expect(response, 200)));
assert.equal(raceReceipts[0].id, raceReceipts[1].id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM request_keys WHERE owner=? AND key=?').get(bob.owner, raceBody.idempotencyKey).n, 1);
assert.equal(ownerCount(bob.owner), 2, 'Concurrent same-key retries create one additional request');
const aliceSameKey = await expect(await storePost(alice, { ...contact('Different owner, same key'), idempotencyKey: raceBody.idempotencyKey }), 200);
assert.notEqual(aliceSameKey.id, raceReceipts[0].id, 'Retry keys are private to each owner');
for (const idempotencyKey of ['short', 'x'.repeat(101), 'invalid space key-12345']) await expect(await storePost(guest, contact('Invalid key', idempotencyKey)), 400);
checks.push('same-key retries return the original receipt; changed bodies conflict; concurrent retries and different owners cannot duplicate or cross-link requests');

const claimable = { cookie: 'kora_session=dddddddd-dddd-4ddd-bddd-dddddddddddd', owner: 'guest:dddddddd-dddd-4ddd-bddd-dddddddddddd' };
const guestRequest = contact('Guest request preserved across sign-in');
const guestReceipt = await expect(await storePost(claimable, guestRequest), 200);
assert.equal(sqlite.prepare('SELECT request_id FROM request_keys WHERE owner=? AND key=?').get(claimable.owner, guestRequest.idempotencyKey).request_id, guestReceipt.id);
const accountBeforeClaim = ownerCount(alice.owner);
await expect(await storePost({ ...alice, cookie: alice.cookie + '; ' + claimable.cookie }, { action: 'claimGuest' }), 200);
assert.equal(sqlite.prepare('SELECT owner FROM requests WHERE id=?').get(guestReceipt.id).owner, alice.owner);
assert.equal(sqlite.prepare('SELECT request_id FROM request_keys WHERE owner=? AND key=?').get(alice.owner, guestRequest.idempotencyKey).request_id, guestReceipt.id);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM request_keys WHERE owner=?').get(claimable.owner).n, 0);
assert.equal(ownerCount(alice.owner), accountBeforeClaim + 1);
const afterSigninRetry = await expect(await storePost(alice, guestRequest), 200);
assert.equal(afterSigninRetry.id, guestReceipt.id, 'A request submitted as a guest must retain its receipt when retried after sign-in/claim');
assert.equal(ownerCount(alice.owner), accountBeforeClaim + 1, 'Claiming a guest retry key cannot create a duplicate account request');
await expect(await storePost(alice, { ...guestRequest, form: { ...guestRequest.form, message: 'Changed after sign-in' } }), 409);
checks.push('guest request retry keys move with their request on sign-in; account retries preserve the original receipt without duplicate creation');

// Resolve the original guest identity normally, then interleave a real signed
// account claim at the final SQL write. Retired owners must never regain rows.
const retirementCases = [
  { label: 'cart add', sql: 'INSERT INTO basket', body: { action: 'cart', product: selected.id, quantity: 4 } },
  { label: 'cart remove', sql: 'DELETE FROM basket', body: { action: 'cart', product: selected.id, quantity: 0 } },
  { label: 'save', sql: 'INSERT OR IGNORE INTO saved', body: { action: 'save', product: selected.id, value: true } },
  { label: 'unsave', sql: 'DELETE FROM saved', body: { action: 'save', product: selected.id, value: false } },
  { label: 'profile', sql: 'INSERT INTO profiles', body: { action: 'profile', profile: { name: 'Profile retried after sign-in', city: 'Tamale' } } },
  { label: 'contact request', sql: 'INSERT INTO request_keys', body: contact('Request retried after concurrent sign-in') },
  { label: 'quote request', sql: 'INSERT INTO request_keys', body: { ...quoteBody, idempotencyKey: crypto.randomUUID(), form: { ...quoteBody.form, name: 'Race quote fixture', email: bob.email } } },
];
for (const scenario of retirementCases) {
  const guestId = crypto.randomUUID();
  const retiring = { cookie: 'kora_session=' + guestId, owner: 'guest:' + guestId };
  await expect(await storePost(retiring, { action: 'cart', product: selected.id, quantity: 1 }), 200);
  await expect(await storePost(retiring, { action: 'save', product: selected.id, value: true }), 200);
  await expect(await storePost(retiring, { action: 'profile', profile: { name: 'Guest before retirement', city: 'Kumasi' } }), 200);
  let injected = false;
  beforeWriteHook = {
    matches: (sql, values) => sql.startsWith(scenario.sql) && values.includes(retiring.owner),
    async run() {
      injected = true;
      assert.equal(sqlite.prepare('SELECT * FROM guest_claims WHERE guest_owner=?').get(retiring.owner), undefined);
      await expect(await storePost({ ...bob, cookie: bob.cookie + '; ' + retiring.cookie }, { action: 'claimGuest' }), 200);
    },
  };
  const failed = await expect(await storePost(retiring, scenario.body), 409);
  assert(injected, `${scenario.label} must reach the final SQL interleaving point`);
  assert.match(failed.error, /retry.*form has been kept/i);
  assert.equal(beforeWriteHook, undefined);
  assert.equal(sqlite.prepare('SELECT account_owner FROM guest_claims WHERE guest_owner=?').get(retiring.owner).account_owner, bob.owner);
  for (const table of ['basket', 'saved', 'profiles', 'requests', 'request_keys']) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE owner=?`).get(retiring.owner).n, 0, `${scenario.label} left orphan ${table} rows on a retired guest`);
  }
  if (scenario.body.idempotencyKey) assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM request_keys WHERE key=?').get(scenario.body.idempotencyKey).n, 0, 'The rejected write must not reserve an orphan retry key');
  const accountCount = ownerCount(bob.owner);
  const retried = await expect(await storePost(bob, scenario.body), 200);
  if (scenario.body.action === 'request') {
    assert.equal(ownerCount(bob.owner), accountCount + 1);
    assert.equal(sqlite.prepare('SELECT owner FROM requests WHERE id=?').get(retried.id).owner, bob.owner);
    assert.equal(sqlite.prepare('SELECT request_id FROM request_keys WHERE owner=? AND key=?').get(bob.owner, scenario.body.idempotencyKey).request_id, retried.id);
  } else if (scenario.body.action === 'cart') {
    assert.equal(sqlite.prepare('SELECT quantity FROM basket WHERE owner=? AND product=?').get(bob.owner, selected.id)?.quantity || 0, scenario.body.quantity);
  } else if (scenario.body.action === 'save') {
    assert.equal(Boolean(sqlite.prepare('SELECT product FROM saved WHERE owner=? AND product=?').get(bob.owner, selected.id)), scenario.body.value);
  } else {
    assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM profiles WHERE owner=?').get(bob.owner).data).name, scenario.body.profile.name);
  }
}
checks.push('guest retirement interleaved before final bag/save/profile/request writes returns 409 without orphan data; the signed-in account can retry successfully');

const limited = { cookie: 'kora_session=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', owner: 'guest:bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
const submissions = Array.from({ length: 13 }, (_, index) => contact('Rate-limit fixture ' + index));
let firstReceipt;
for (let index = 0; index < 12; index++) {
  const receipt = await expect(await storePost(limited, submissions[index]), 200);
  if (index === 0) firstReceipt = receipt;
}
const throttled = await storePost(limited, submissions[12]);
await expect(throttled, 429);
assert(Number(throttled.headers.get('retry-after')) > 0);
assert.equal(ownerCount(limited.owner), 12);
const retryAtLimit = await expect(await storePost(limited, submissions[0]), 200);
assert.equal(retryAtLimit.id, firstReceipt.id, 'A safe retry does not create or consume another submission');
await expect(await storePost(limited, { ...submissions[0], form: { ...submissions[0].form, message: 'Mismatch at limit' } }), 409);
assert.equal(ownerCount(limited.owner), 12);
const anotherGuest = { cookie: 'kora_session=cccccccc-cccc-4ccc-bccc-cccccccccccc' };
await expect(await storePost(anotherGuest, contact('Independent owner allowance')), 200);
checks.push('twelve requests per owner/hour; the thirteenth receives 429 with Retry-After; retries and mismatch errors remain stable at the limit');

sqlite.close();
delete globalThis.__koraLaunchTestBindings;
console.log('PASS: ' + checks.join('; ') + '.');
