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
const env = {
  DB,
  BETTER_AUTH_SECRET: 'test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
};
Object.assign(globalThis.__koraAuthTestBindings, env);
const origin = DEFAULT_AUTH_ORIGIN;
const password = 'Kora-test-password-2026';
let nextIp = 1;
function request(path, body, options = {}) {
  return new Request((options.originURL || origin) + '/api/auth' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': options.ip || `198.51.100.${nextIp++}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (path, body, options, bindings = env) => handleCustomerAuth(request(path, body, options), bindings);
function sessionCookie(response) { return response.headers.getSetCookie().find(value => value.startsWith('__Secure-kora.auth.session_token='))?.split(';')[0]; }
const signup = (email, extra = {}, options = {}) => call('/sign-up/email', { email, password, name: 'Kora test', callbackURL: '/account', ...extra }, options);
const signin = (email, suppliedPassword = password, options = {}) => call('/sign-in/email', { email, password: suppliedPassword, callbackURL: '/account' }, options);
const checks = [];

assert.deepEqual(authCapabilities({}), { configured: false, password: false, google: false });
assert.deepEqual(authCapabilities(env), { configured: true, password: true, google: false });
assert.equal(resolveAuthOrigin({}), origin);
for (const BETTER_AUTH_URL of ['https://attacker.example/path', '//attacker.example', 'javascript:alert(1)', 'https://user:pass@kora.example', 'http://kora.example', 'https://localhost', 'http://127.0.0.1:8787', 'https://kora.example?x=1']) assert.equal(resolveAuthOrigin({ BETTER_AUTH_URL }), null);
assert.equal(resolveAuthOrigin({ BETTER_AUTH_URL: 'http://localhost:8787', KORA_AUTH_ALLOW_LOCAL: 'true' }), 'http://localhost:8787');
let response = await call('/sign-up/email', { email: 'test@example.com', password, name: 'Test' }, {}, {});
assert.equal(response.status, 503);
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM auth_user').get().n, 0);
checks.push('password capability requires configured D1 and secret; no email provider is needed');

for (const invalidPassword of ['short', 'x'.repeat(129)]) {
  response = await signup('invalid-password@example.com', { password: invalidPassword });
  assert.equal(response.status, 400);
  assert(!sessionCookie(response));
}
assert.equal(sqlite.prepare('SELECT id FROM auth_user WHERE email=?').get('invalid-password@example.com'), undefined);
response = await signup('customer@example.com', { emailVerified: true });
assert.equal(response.status, 200, await response.clone().text());
const signupBody = await response.clone().json();
assert.equal(signupBody.user.emailVerified, false, 'Client cannot claim a verified email');
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
assert.equal(session.user.emailVerified, false);
assert.equal((await getCustomerSession(request('/get-session', undefined, { headers: { Cookie: cookie } }))).user.id, session.user.id);
assert.equal(await getCustomerSession(request('/get-session', undefined, { headers: { 'oai-authenticated-user-id': session.user.id } })), null);
const stored = sqlite.prepare('SELECT password,provider_id FROM auth_account WHERE user_id=?').get(session.user.id);
assert.equal(stored.provider_id, 'credential');
assert.match(stored.password, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
assert(!stored.password.includes(password));
response = await signup('another@example.com');
assert.equal(response.status, 200);
const anotherHash = sqlite.prepare('SELECT password FROM auth_account WHERE user_id=(SELECT id FROM auth_user WHERE email=?)').get('another@example.com').password;
assert.notEqual(stored.password, anotherHash, 'Identical passwords receive independent random salts');
const savedSecret = globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET;
delete globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET;
await assert.rejects(() => getCustomerSession(request('/get-session', undefined, { headers: { Cookie: cookie } })), /temporarily unavailable/);
assert.equal(await getCustomerSession(request('/get-session')), null);
globalThis.__koraAuthTestBindings.BETTER_AUTH_SECRET = savedSecret;
checks.push('12–128 character passwords; salted scrypt storage; unverified signup is never falsely marked verified');
checks.push('password accounts authenticate by signed session and immutable user ID; configuration outages fail closed');

const wrong = await signin('customer@example.com', 'wrong-password-2026');
const absent = await signin('does-not-exist@example.com', 'wrong-password-2026');
assert.equal(wrong.status, 401); assert.equal(absent.status, 401);
assert.equal((await wrong.json()).code, (await absent.json()).code);
assert(!sessionCookie(wrong)); assert(!sessionCookie(absent));
response = await signup('CUSTOMER@example.com', { password: 'attacker-new-password' });
assert.equal(response.status, 422);
assert.equal(sqlite.prepare('SELECT password FROM auth_account WHERE user_id=?').get(session.user.id).password, stored.password);
response = await signin('CUSTOMER@example.com');
assert.equal(response.status, 200, await response.clone().text());
assert.equal((await response.json()).user.id, session.user.id);
assert(sessionCookie(response));
checks.push('correct-password sign-in works; wrong/unknown accounts fail uniformly; duplicate signup cannot overwrite credentials');

response = await signin('customer@example.com', 'x'.repeat(129));
assert.equal(response.status, 400); assert.equal((await response.json()).code, 'PASSWORD_TOO_LONG');
response = await call('/change-password', { currentPassword: 'x'.repeat(129), newPassword: 'new-test-password-2026' }, { headers: { Cookie: cookie } });
assert.equal(response.status, 400); assert.equal((await response.json()).code, 'PASSWORD_TOO_LONG');
assert.equal(sqlite.prepare('SELECT password FROM auth_account WHERE user_id=?').get(session.user.id).password, stored.password);
checks.push('oversized sign-in and current-password inputs are rejected before password hashing');

const signedValue = decodeURIComponent(cookie.split('=')[1]);
const rawToken = signedValue.slice(0, signedValue.lastIndexOf('.'));
for (const forged of [cookie + 'tampered', cookie.split('=')[0] + '=' + rawToken, '__Secure-kora.auth.session_token=fake']) {
  assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: forged }) }), null);
}
response = await call('/sign-out', {}, { headers: { Cookie: cookie } });
assert.equal(response.status, 200);
assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) }), null);
assert.equal(sqlite.prepare('SELECT id FROM auth_session WHERE id=?').get(session.session.id), undefined);
const expiredCookie = sessionCookie(await signin('customer@example.com'));
sqlite.prepare('UPDATE auth_session SET expires_at=? WHERE user_id=?').run(Date.now() - 1000, session.user.id);
assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: expiredCookie }) }), null);
checks.push('signed HttpOnly/Secure/SameSite cookies, forged and expired-cookie rejection, immediate DB logout revocation');

for (const headers of [{ Origin: 'https://outside.example' }, { Origin: '' }, { Origin: 'null' }]) {
  response = await signin('customer@example.com', password, { headers });
  assert.equal(response.status, 403);
}
for (const callbackURL of ['https://outside.example/steal', '//outside.example', '/\\outside.example']) {
  response = await call('/sign-in/email', { email: 'customer@example.com', password, callbackURL });
  assert.equal(response.status, 403);
}
checks.push('cross-origin requests and callback open redirects are rejected');

const previousVerificationCount = sqlite.prepare('SELECT COUNT(*) AS n FROM auth_verification').get().n;
for (const path of ['/request-password-reset', '/reset-password', '/reset-password/fake-token', '/forget-password', '/send-verification-email', '/verify-email', '/change-email']) {
  response = await call(path, { email: 'customer@example.com', token: 'fake-token', newPassword: 'new-test-password' });
  assert.equal(response.status, 503, path);
  const data = await response.json(); assert.equal(data.code, 'EMAIL_RECOVERY_UNAVAILABLE'); assert(data.message.includes('No email has been sent'));
}
for (const path of ['/sign-in/magic-link', '/sign-in/magic-link/', '/magic-link/verify?token=old', '/link-social', '/unlink-account', '/set-password']) {
  response = await call(path, path.includes('verify') ? undefined : { email: 'customer@example.com' });
  assert.equal(response.status, 404, path);
  assert.equal((await response.json()).code, 'AUTH_METHOD_UNAVAILABLE');
}
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM auth_verification').get().n, previousVerificationCount);
assert.equal(sqlite.prepare('SELECT password FROM auth_account WHERE user_id=?').get(session.user.id).password, stored.password);
checks.push('magic links, provider linking and email-dependent recovery are explicitly unavailable without fake success');

const signupRateIp = '203.0.113.15';
const rateSignups = await Promise.all(Array.from({ length: 7 }, (_, index) => signup(`rate${index}@example.com`, {}, { ip: signupRateIp })));
assert.equal(rateSignups.filter(result => result.status === 200).length, 3);
assert.equal(rateSignups.filter(result => result.status === 429).length, 4);
assert(rateSignups.find(result => result.status === 429).headers.get('retry-after'));
response = await handleCustomerAuth(request('/sign-up/email', { email: 'rate-next@example.com', password, name: 'Rate test' }, { ip: signupRateIp }), { ...env });
assert.equal(response.status, 429, 'Fresh auth instances share D1 signup rate limits');
const signinRateIp = '203.0.113.25';
const rateSignins = await Promise.all(Array.from({ length: 13 }, () => signin('rate0@example.com', 'incorrect-password', { ip: signinRateIp })));
assert.equal(rateSignins.filter(result => result.status === 401).length, 10);
assert.equal(rateSignins.filter(result => result.status === 429).length, 3);
response = await signin('rate0@example.com', password, { ip: signinRateIp });
assert.equal(response.status, 429);
checks.push('persistent D1 signup/sign-in throttles hold under concurrent requests and fresh auth instances');

const googleEnv = { ...env, GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-secret' };
assert.deepEqual(authCapabilities(googleEnv), { configured: true, password: true, google: true });
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
assert.equal(googleAuth.options.account.accountLinking.enabled, false);
assert.equal(googleAuth.options.account.accountLinking.disableImplicitLinking, true);
assert.deepEqual(googleAuth.options.account.accountLinking.trustedProviders, []);
assert.equal(googleAuth.options.account.encryptOAuthTokens, true);
assert.equal(googleAuth.options.socialProviders.google.requireEmailVerification, true);

// Exercise the installed OAuth ownership resolver with authenticated-provider
// claims after its token-verification boundary; no Google network calls are made.
const { handleOAuthUserInfo } = await import('../node_modules/better-auth/dist/oauth2/link-account.mjs');
const googleContext = await googleAuth.$context;
const oauthInfo = (email, subject, emailVerified = true) => ({ userInfo: { id: subject, email, emailVerified, name: 'Google test' }, account: { providerId: 'google', accountId: subject }, callbackURL: '/account', disableSignUp: false });
const credentialsBeforeCollision = sqlite.prepare('SELECT * FROM auth_account WHERE user_id=?').all(session.user.id);
const collision = await handleOAuthUserInfo({ context: googleContext }, oauthInfo('customer@example.com', 'google-customer-subject'));
assert.equal(collision.error, 'account not linked'); assert.equal(collision.data, null);
assert.deepEqual(sqlite.prepare('SELECT * FROM auth_account WHERE user_id=?').all(session.user.id), credentialsBeforeCollision);
assert.equal(sqlite.prepare('SELECT email_verified FROM auth_user WHERE id=?').get(session.user.id).email_verified, 0);
const googleSignup = await handleOAuthUserInfo({ context: googleContext }, oauthInfo('google-only@example.com', 'google-only-subject'));
assert.equal(googleSignup.error, null); assert.equal(googleSignup.data.user.emailVerified, true);
const googleRepeat = await handleOAuthUserInfo({ context: googleContext }, oauthInfo('google-only@example.com', 'google-only-subject'));
assert.equal(googleRepeat.error, null); assert.equal(googleRepeat.data.user.id, googleSignup.data.user.id);
response = await signup('google-only@example.com'); assert.equal(response.status, 422);
assert.equal(sqlite.prepare("SELECT id FROM auth_account WHERE user_id=? AND provider_id='credential'").get(googleSignup.data.user.id), undefined);
const unverifiedGoogle = await handleOAuthUserInfo({ context: googleContext }, oauthInfo('unverified-google@example.com', 'unverified-google-subject', false));
assert.equal(unverifiedGoogle.error, 'email_not_verified'); assert.equal(unverifiedGoogle.data, null);
checks.push('Google identity scopes and fixed callback/state; existing password/Google email collisions cannot link or overwrite accounts');
checks.push('verified Google users can sign in repeatedly; unverified Google identities receive no session');

console.log(JSON.stringify({ passed: true, checks, transport: 'Actual Better Auth 1.7.5 + Drizzle D1 adapter against SQLite', externalServices: 'No email provider or live OAuth calls; default scrypt hashing is exercised' }, null, 2));
sqlite.close();
