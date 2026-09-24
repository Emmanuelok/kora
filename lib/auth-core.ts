import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from '../db/auth-schema';
import { magicLinkEmail, type CloudflareEmailBinding } from './auth-email';

export const DEFAULT_AUTH_ORIGIN = 'https://kora.eo-kingsford.workers.dev';

export interface AuthBindings {
  DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  KORA_SITE_URL?: string;
  KORA_AUTH_ALLOW_LOCAL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_EMAIL_FROM?: string;
  EMAIL?: CloudflareEmailBinding;
}

// Configuration is supplied by the operator, never inferred from request or proxy headers.
export function resolveAuthOrigin(bindings: AuthBindings): string | null {
  const candidate = bindings.BETTER_AUTH_URL || bindings.KORA_SITE_URL || DEFAULT_AUTH_ORIGIN;
  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (local) return bindings.KORA_AUTH_ALLOW_LOCAL === 'true' && ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
    if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.') || url.hostname.endsWith('.localhost')) return null;
    return url.origin;
  } catch { return null; }
}

export function authCapabilities(bindings: AuthBindings) {
  const configured = Boolean(bindings.DB && bindings.BETTER_AUTH_SECRET && bindings.BETTER_AUTH_SECRET.length >= 32 && resolveAuthOrigin(bindings));
  return {
    configured,
    google: configured && Boolean(bindings.GOOGLE_CLIENT_ID && bindings.GOOGLE_CLIENT_SECRET),
    magicLink: configured && Boolean(bindings.EMAIL && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(bindings.AUTH_EMAIL_FROM || '')),
  };
}

export function createCustomerAuth(bindings: AuthBindings) {
  const capabilities = authCapabilities(bindings);
  const origin = resolveAuthOrigin(bindings);
  if (!capabilities.configured || !origin || !bindings.DB || !bindings.BETTER_AUTH_SECRET) return null;

  return betterAuth({
    appName: 'Kora Ghana',
    baseURL: origin,
    basePath: '/api/auth',
    secret: bindings.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(drizzle(bindings.DB, { schema: authSchema }), { provider: 'sqlite', schema: authSchema, transaction: false }),
    emailAndPassword: { enabled: false },
    socialProviders: capabilities.google ? {
      google: {
        clientId: bindings.GOOGLE_CLIENT_ID!,
        clientSecret: bindings.GOOGLE_CLIENT_SECRET!,
        disableDefaultScope: true,
        scope: ['openid', 'email', 'profile'],
        accessType: 'online',
        includeGrantedScopes: false,
        prompt: 'select_account',
      },
    } : {},
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [], allowDifferentEmails: false },
      storeStateStrategy: 'database',
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: 'kora.auth',
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      trustedProxyHeaders: false,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/magic-link': { window: 600, max: 3 },
        '/magic-link/verify': { window: 600, max: 10 },
        '/sign-in/social': { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            if (!user.emailVerified) throw new APIError('FORBIDDEN', { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Use a verified email address to create your Kora account.' });
          },
        },
      },
    },
    plugins: [magicLink({
      expiresIn: 600,
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => {
        if (!capabilities.magicLink || !bindings.EMAIL || !bindings.AUTH_EMAIL_FROM) throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_NOT_CONFIGURED', message: 'Email sign-in is being set up. Please try another sign-in option.' });
        try {
          const result = await bindings.EMAIL.send({ to: email, from: { email: bindings.AUTH_EMAIL_FROM, name: 'Kora Ghana' }, ...magicLinkEmail(url) });
          if (!result?.messageId) throw new Error('Email service did not acknowledge the message');
        } catch {
          // Do not log email addresses, sign-in tokens, links or provider responses.
          throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_DELIVERY_FAILED', message: 'We could not send your sign-in link. Please wait a moment and try again.' });
        }
      },
    })],
    telemetry: { enabled: false },
    logger: {
      level: 'error',
      // Provider errors and invalid callback values may contain tokens or PII.
      log: level => { if (level === 'error') console.error('Kora authentication request failed. Sensitive details were omitted.'); },
    },
  });
}

export type CustomerAuth = NonNullable<ReturnType<typeof createCustomerAuth>>;

export async function handleCustomerAuth(request: Request, bindings: AuthBindings) {
  const capabilities = authCapabilities(bindings);
  const pathname = new URL(request.url).pathname;
  if (!capabilities.configured || (pathname === '/api/auth/sign-in/magic-link' && !capabilities.magicLink) || (pathname === '/api/auth/sign-in/social' && !capabilities.google)) {
    return Response.json({ code: 'AUTH_NOT_CONFIGURED', message: 'This sign-in option is being set up. You can continue browsing as a guest.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  // The app has one public origin. Reject cross-origin POSTs even before a user
  // has cookies; Better Auth separately verifies CSRF, OAuth state and callbacks.
  const origin = resolveAuthOrigin(bindings)!;
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('origin') !== origin) {
    return Response.json({ code: 'INVALID_ORIGIN', message: 'Open Kora and try signing in again.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const auth = createCustomerAuth(bindings)!;
  try {
    const response = await auth.handler(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
    headers.set('Referrer-Policy', 'no-referrer');
    if (response.status === 429 && headers.has('X-Retry-After')) headers.set('Retry-After', headers.get('X-Retry-After')!);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return Response.json({ code: 'AUTH_UNAVAILABLE', message: 'Sign-in is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
