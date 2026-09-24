import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Run the real authentication implementation and Better Auth/Drizzle code.
// Only Cloudflare's D1 transport is substituted with a real in-memory SQLite DB.
globalThis.__koraAuthTestBindings = {};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__koraAuthTestBindings;', shortCircuit: true };
    if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith(pathToFileURL(process.cwd() + '/').href) && !context.parentURL.includes('/node_modules/')) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (fs.existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts') && !url.includes('/node_modules/')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { createCustomerAuth, handleCustomerAuth, authCapabilities, resolveAuthOrigin, DEFAULT_AUTH_ORIGIN } = await import('../lib/auth-core.ts');
const { getCustomerSession } = await import('../lib/auth.ts');
const { magicLinkEmail } = await import('../lib/auth-email.ts');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON;');
sqlite.exec(fs.readFileSync('drizzle/0001_customer_auth.sql', 'utf8'));
// Applying the additive migration twice must not destroy existing records.
sqlite.exec(fs.readFileSync('drizzle/0001_customer_auth.sql', 'utf8'));
const DB = {
  prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async raw() { const stmt = sqlite.prepare(sql); stmt.setReturnArrays(true); return stmt.all(...values); },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values), meta: {} }; },
      async run() { return { success: true, results: [], meta: sqlite.prepare(sql).run(...values) }; },
      async first(column) { const row = sqlite.prepare(sql).get(...values); return column ? row?.[column] ?? null : row ?? null; },
    };
  },
};
const sent = [];
const env = {
  DB,
  BETTER_AUTH_SECRET: 'test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  AUTH_EMAIL_FROM: 'signin@kora.example',
  EMAIL: { async send(message) { sent.push(message); return { messageId: 'test-message' }; } },
};
Object.assign(globalThis.__koraAuthTestBindings, env);
const origin = DEFAULT_AUTH_ORIGIN;
let nextIp = 1;
function request(path, body, options = {}) {
  return new Request((options.originURL || origin) + '/api/auth' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': options.ip || `198.51.100.${nextIp++}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (path, body, options, bindings = env) => handleCustomerAuth(request(path, body, options), bindings);
function emailUrl(message) { return new URL(message.text.match(/account: (\S+)/)[1]); }
function sessionCookie(response) { return response.headers.getSetCookie().find(value => value.startsWith('__Secure-kora.auth.session_token='))?.split(';')[0]; }
async function issue(email, options = {}) {
  const response = await call('/sign-in/magic-link', { email, callbackURL: '/account', errorCallbackURL: '/account', name: 'Kora test' }, options);
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { status: true });
  return emailUrl(sent.at(-1));
}
function redeem(url, options = {}) {
  return handleCustomerAuth(new Request(url, { headers: { 'CF-Connecting-IP': `198.51.100.${nextIp++}`, ...options.headers } }), env);
}
const checks = [];

assert.deepEqual(authCapabilities({}), { configured: false, google: false, magicLink: false });
assert.equal(resolveAuthOrigin({}), origin);
for (const BETTER_AUTH_URL of ['https://attacker.example/path', '//attacker.example', 'javascript:alert(1)', 'https://user:pass@kora.example', 'http://kora.example', 'https://localhost', 'http://127.0.0.1:8787', 'https://kora.example?x=1']) assert.equal(resolveAuthOrigin({ BETTER_AUTH_URL }), null);
assert.equal(resolveAuthOrigin({ BETTER_AUTH_URL: 'http://localhost:8787', KORA_AUTH_ALLOW_LOCAL: 'true' }), 'http://localhost:8787');
let response = await call('/sign-in/magic-link', { email: 'test@example.com' }, {}, {});
assert.equal(response.status, 503);
assert.equal(response.headers.get('cache-control'), 'no-store');
const before = sqlite.prepare('SELECT COUNT(*) AS n FROM auth_verification').get().n;
response = await call('/sign-in/magic-link', { email: 'test@example.com' }, {}, { ...env, EMAIL: undefined });
assert.equal(response.status, 503);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM auth_verification').get().n, before);
checks.push('missing configuration stays unavailable without fake mail or database writes');

const url = await issue('customer@example.com');
assert.equal(url.origin, origin);
const token = url.searchParams.get('token');
const record = sqlite.prepare('SELECT * FROM auth_verification').get();
assert.notEqual(record.identifier, token);
assert(!JSON.stringify(record).includes(token));
assert(Math.abs(record.expires_at - Date.now() - 600_000) < 5000);
assert.equal(sent[0].from.email, env.AUTH_EMAIL_FROM);
assert(sent[0].html.includes('Sign in to Kora') && sent[0].text.includes('10 minutes'));
assert(magicLinkEmail('https://kora.example/?x="<&').html.includes('&quot;&lt;&amp;'));
response = await redeem(new URL(url.href.replace(token, 'invalid-token')));
assert(!sessionCookie(response));
response = await redeem(url);
assert.equal(response.status, 302);
assert.equal(response.headers.get('location'), origin + '/account');
const cookie = sessionCookie(response);
assert(cookie);
const fullCookie = response.headers.getSetCookie().find(value => value.startsWith(cookie));
for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert(fullCookie.includes(attribute));
assert(!fullCookie.includes('Domain='));
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
const auth = createCustomerAuth(env);
const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) });
assert.equal(session.user.email, 'customer@example.com');
assert.equal(session.user.emailVerified, true);
assert.equal((await getCustomerSession(request('/get-session', undefined, { headers: { Cookie: cookie } }))).user.id, session.user.id);
assert.equal(await getCustomerSession(request('/get-session', undefined, { headers: { 'oai-authenticated-user-id': session.user.id } })), null);
const savedSecret = globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET;
delete globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET;
await assert.rejects(() => getCustomerSession(request('/get-session', undefined, { headers: { Cookie: cookie } })), /temporarily unavailable/);
assert.equal(await getCustomerSession(request('/get-session')), null);
globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET = savedSecret;
response = await redeem(url);
assert(!sessionCookie(response));
assert(new URL(response.headers.get('location')).searchParams.get('error') === 'INVALID_TOKEN');
checks.push('hashed ten-minute magic links, verified signup, signed secure cookie and single-use redemption');

const raceUrl = await issue('race@example.com');
const raced = await Promise.all([redeem(raceUrl), redeem(raceUrl)]);
assert.equal(raced.filter(result => sessionCookie(result)).length, 1);
const expiredUrl = await issue('expired@example.com');
sqlite.prepare('UPDATE auth_verification SET expires_at=?').run(Date.now() - 10_000);
response = await redeem(expiredUrl);
assert(!sessionCookie(response));
assert.equal(sqlite.prepare('SELECT id FROM auth_user WHERE email=?').get('expired@example.com'), undefined);
checks.push('concurrent token redemption is atomic; expired links cannot create users');

const signedValue = decodeURIComponent(cookie.split('=')[1]);
const rawToken = signedValue.slice(0, signedValue.lastIndexOf('.'));
for (const forged of [cookie + 'tampered', cookie.split('=')[0] + '=' + rawToken, '__Secure-kora.auth.session_token=fake']) {
  assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: forged }) }), null);
}
response = await call('/sign-out', {}, { headers: { Cookie: cookie } });
assert.equal(response.status, 200);
assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) }), null);
assert.equal(sqlite.prepare('SELECT id FROM auth_session WHERE id=?').get(session.session.id), undefined);
const secondUrl = await issue('customer@example.com');
const secondCookie = sessionCookie(await redeem(secondUrl));
sqlite.prepare('UPDATE auth_session SET expires_at=? WHERE user_id=?').run(Date.now() - 1000, session.user.id);
assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: secondCookie }) }), null);
checks.push('forged and expired cookies fail; logout revokes the database session immediately');

for (const headers of [{ Origin: 'https://outside.example' }, { Origin: '' }, { Origin: 'null' }]) {
  response = await call('/sign-in/magic-link', { email: 'cross-origin@example.com' }, { headers });
  assert.equal(response.status, 403);
}
for (const callbackURL of ['https://outside.example/steal', '//outside.example', '/\\outside.example']) {
  response = await call('/sign-in/magic-link', { email: 'redirect@example.com', callbackURL });
  assert.equal(response.status, 403);
}
const redirectUrl = await issue('redirect@example.com');
redirectUrl.searchParams.set('callbackURL', 'https://outside.example');
response = await redeem(redirectUrl);
assert.equal(response.status, 403);
assert(!sessionCookie(response));
checks.push('cross-origin requests and callback open redirects are rejected');

response = await call('/sign-in/magic-link', { email: 'delivery@example.com' }, {}, { ...env, EMAIL: { async send() { throw new Error('Simulated provider failure'); } } });
assert.equal(response.status, 503);
assert.equal((await response.json()).code, 'EMAIL_DELIVERY_FAILED');
checks.push('Cloudflare email delivery failure never reports a successful send');

const rateIp = '203.0.113.15';
const rateResponses = await Promise.all(Array.from({ length: 7 }, (_, index) => call('/sign-in/magic-link', { email: `rate${index}@example.com` }, { ip: rateIp })));
assert.equal(rateResponses.filter(result => result.status === 200).length, 3);
assert.equal(rateResponses.filter(result => result.status === 429).length, 4);
assert(rateResponses.find(result => result.status === 429).headers.get('retry-after'));
response = await handleCustomerAuth(request('/sign-in/magic-link', { email: 'rate-next@example.com' }, { ip: rateIp }), { ...env });
assert.equal(response.status, 429, 'Fresh auth instances share D1 rate limits');
checks.push('D1 rate limits hold under concurrency and across fresh Worker auth instances');

const googleEnv = { ...env, GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-secret' };
assert.deepEqual(authCapabilities(googleEnv), { configured: true, google: true, magicLink: true });
response = await call('/sign-in/social', { provider: 'google', callbackURL: '/account' }, { originURL: 'https://attacker.example' }, googleEnv);
assert.equal(response.status, 200);
const authorization = new URL((await response.json()).url);
assert.equal(authorization.hostname, 'accounts.google.com');
assert.equal(authorization.searchParams.get('redirect_uri'), origin + '/api/auth/callback/google');
assert.deepEqual(new Set(authorization.searchParams.get('scope').split(' ')), new Set(['openid', 'email', 'profile']));
assert.equal(authorization.searchParams.get('access_type'), 'online');
assert(authorization.searchParams.get('state'));
assert(response.headers.getSetCookie().some(value => value.includes('oauth_state') || value.includes('state')));
const googleAuth = createCustomerAuth(googleEnv);
assert.equal(googleAuth.options.account.accountLinking.requireLocalEmailVerified, true);
assert.deepEqual(googleAuth.options.account.accountLinking.trustedProviders, []);
assert.equal(googleAuth.options.account.encryptOAuthTokens, true);
await assert.rejects(() => googleAuth.options.databaseHooks.user.create.before({ emailVerified: false }), /verified email/);
checks.push('Google uses only identity scopes, fixed callback origin, state cookie, encrypted tokens and verified-email linking');

console.log(JSON.stringify({ passed: true, checks, transport: 'Actual Better Auth 1.7.5 + Drizzle D1 adapter against SQLite', sends: 'Stub Cloudflare binding only; no real email or OAuth account used' }, null, 2));
sqlite.close();
