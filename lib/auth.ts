import { env } from 'cloudflare:workers';
import { authCapabilities, createCustomerAuth, handleCustomerAuth, type AuthBindings } from './auth-core';

function bindings() { return env as unknown as AuthBindings; }

export function getAuthCapabilities() { return authCapabilities(bindings()); }

export function handleAuthRequest(request: Request) { return handleCustomerAuth(request, bindings()); }

export async function getCustomerSession(request: Request) {
  // Most catalogue requests are anonymous and need no authentication DB lookup.
  if (!/(?:^|;\s*)(?:__Secure-)?kora\.auth\.session_token=/.test(request.headers.get('cookie') || '')) return null;
  const auth = createCustomerAuth(bindings());
  if (!auth) throw new Error('Authentication is temporarily unavailable');
  const result = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  return result?.user.emailVerified ? result : null;
}
