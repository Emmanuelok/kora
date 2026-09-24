# Kora customer accounts on Cloudflare

Kora runs authentication in the existing Cloudflare Worker and stores accounts, sessions and rate limits in D1. Better Auth is an open-source library bundled with the Worker, not a hosted authentication subscription. No Supabase or external email provider is used.

The chosen methods are **email/password signup and sign-in, plus Google**. Magic links are removed. The catalogue stays public; Cloudflare Access must not become a customer sign-in gate.

## Current setup

- Worker: `kora`, public origin `https://kora.eo-kingsford.workers.dev`.
- D1 binding: `DB`, database `kora-db`.
- Migration: `drizzle/0001_customer_auth.sql`, applied and checked in production on 24 September 2026. The existing account table already supports password hashes; this change requires no new migration.
- `/sign-in` and `/sign-up` show only configured methods. `/api/auth/config` exposes `configured`, `password` and `google` booleans, never credentials.
- Production still needs a signing secret and Google OAuth credentials. No credentials are checked into Git.
- The dashboard currently reports Workers Free. No paid plan has been purchased.

The migration and dashboard observations above are the earlier deployment record, not fresh verification of every production setting. A read-only check of the public `/api/auth/config` endpoint on 24 September 2026 at 20:42 UTC returned HTTP 200, `Cache-Control: no-store` and `{"configured":false,"password":false,"google":false}`: production authentication is still disabled. The launch audit verified the current implementation locally without changing secrets, enabling registration, creating production accounts or making live Google calls. A capability value of `true` means the required bindings are present; it does not prove that Google credentials are valid, tables are healthy or password hashing fits the production CPU allowance.

## Owner inputs still required

| Input | Where it belongs | Why it is required |
|---|---|---|
| A new random `BETTER_AUTH_SECRET` of at least 32 characters | Encrypted Worker secret, entered directly by the owner | Signs sessions and protects OAuth state/tokens |
| A Google Cloud project and OAuth web client owned by the business | Google Auth Platform | Establishes the app identity and exact approved callback |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Encrypted Worker secrets, entered directly by the owner | Enables Google sign-in |
| A real Google OAuth support contact and intended audience/test users | Google Auth Platform branding/audience | Completes the consent setup for the people allowed to sign in |
| A disposable test account and a Google test user | Live browser after configuration | Verifies actual signup, sign-in, logout and consent without using customer data |

The existing Workers address can be used for testing. A custom domain is optional; if one is chosen, settle it before registering the final callback. Do not paste signing secrets, OAuth secrets or customer passwords into chat or commit them to the repository.

## Enable email/password accounts

1. In the Kora Worker's **Settings → Variables and Secrets**, add an encrypted `BETTER_AUTH_SECRET`: a cryptographically random secret of at least 32 characters. Generate and save it through a secure password/secret workflow. Enter it directly in Cloudflare, not chat, and do not reuse a Google secret.
2. Deploy the updated configuration. The existing `DB` binding and fixed HTTPS origin supply the remaining requirements.
3. Before inviting testers, create a disposable test account, sign out, sign in again, and check Worker observability for CPU-limit failures. Passwords use Better Auth's default scrypt hashing, with a minimum length of 12 and maximum of 128 characters.

**Workers Free runtime check:** Cloudflare documents a 10 ms CPU limit per request on Free. Secure password hashing is deliberately expensive and may exceed that limit. Local tests do not establish production Free-plan compatibility. Keep secure hashing parameters; if deployed signup/sign-in exhaust CPU, Workers Paid (currently starting at US$5/month) is the Cloudflare-only option with a larger CPU allowance. An upgrade requires the account owner's decision. There is no additional hosted-auth subscription.

## Enable Google sign-in

1. Select a user-owned Google Cloud project and configure Google Auth Platform branding/audience for Kora. Use a real support contact and the Kora homepage/privacy page. Complete any required domain verification.
2. Create an OAuth client of type **Web application**. Set its authorized redirect URI exactly to `https://kora.eo-kingsford.workers.dev/api/auth/callback/google`. The origin is `https://kora.eo-kingsford.workers.dev`.
3. Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as encrypted secrets in the Kora Worker's **Settings → Variables and Secrets**, alongside `BETTER_AUTH_SECRET`. The account owner should enter credentials directly in Cloudflare.
4. Publish the OAuth app for the intended audience, or add explicit test users while it is in Google's testing mode. Verify consent, account creation, a later sign-in, and sign-out.

Kora requests only `openid`, `email`, and `profile`. Google supplies identity; application hosting and the account database remain on Cloudflare. No Gmail, Drive or Calendar access is requested.

If moving to a custom domain, set `BETTER_AUTH_URL` to that HTTPS origin, update `KORA_SITE_URL` for metadata, and register the matching Google callback before release. Do not use request-derived origins or wildcard redirects.

## Email ownership and recovery

Email/password signup signs the customer in immediately, but **does not verify ownership of the email address**. Email verification and password reset are unavailable while outbound email is off. The forms explain this before signup and do not promise a reset email. Customers should save their password securely; accounts created with Google use Google's recovery flow.

Automatic account linking is disabled. An email/password account cannot be taken over by a Google login with the same email, and the reverse route cannot add a password to an existing Google account. Customers must continue using the method with which they registered. A matching email alone never authorizes a merge, recovery, shopping-data lookup or transfer.

Magic-link, reset-password and email-verification flows are explicitly disabled. Reintroducing verification/recovery later requires a reviewed delivery setup and tests; adding an email binding alone does not enable those flows.

## Customer data and sessions

Guest sessions last 30 days in a host-only, HttpOnly cookie. Account sessions last 7 days. The account owner comes from a validated D1 session and immutable user ID, never a caller-supplied header, profile email or request payload. A password account can have a valid session while its email remains unverified.

After sign-in, the frontend atomically imports this browser's guest shopping session. A permanent D1 claim prevents import into two accounts. Quantities merge up to 20 per exact product configuration; saved products merge; requests transfer; an existing account profile takes precedence. The guest cookie then expires. Signing out starts fresh guest browsing and does not expose the previous account's data.

Auth responses and all personal APIs use `Cache-Control: no-store`; the PWA never caches them. Auth configuration/database failures fail closed instead of silently writing account activity to a new guest owner. Rate limits persist in D1. Auth request bodies are limited to 16 KiB of actual bytes before JSON/form parsing, database access or password hashing. Oversized bodies receive HTTP 413, including chunked requests, multibyte payloads and understated `Content-Length` headers.

## Verification

Run `pnpm run verify:auth`, `pnpm run verify:store`, `pnpm run verify:metadata`, `pnpm run verify:pwa`, and `pnpm exec tsc --noEmit --incremental false` before building. Auth tests exercise installed Better Auth and Drizzle/D1 against SQLite using synthetic local accounts, without external email or Google calls. Test the compiled Worker locally as well; production OAuth and CPU checks remain separate activation requirements.

Local development can use an ignored `.dev.vars` with a local-only signing secret, `BETTER_AUTH_URL=http://127.0.0.1:8787` and `KORA_AUTH_ALLOW_LOCAL=true`. Never enable the local override in production or commit secret files.

### Local implementation versus production activation

| Check | Current evidence |
|---|---|
| Password signup/sign-in, salted hashes, logout and expired sessions | Exercised against the installed Better Auth library and a SQLite-backed D1 adapter |
| Forged cookies/headers, callback redirects, method removal and recovery restrictions | Covered by local regression tests |
| Persistent signup/sign-in rate limits | Covered across concurrent requests and new auth instances using the D1 adapter |
| Oversized request protection | Covered for missing/false length headers, UTF-8 bytes and an endless chunked stream that is cancelled at the bound |
| Guest-to-account ownership and account isolation | Covered by the separate store regression suite |
| Google consent and a real provider callback | Still requires configured credentials and a live Google test user |
| Deployed password CPU usage and production account lifecycle | Still requires the signing secret and a live test; a successful local build is not evidence of Free-plan compatibility |

After activation, verify the public `/api/auth/config` endpoint, complete both sign-in methods in a browser, confirm a second browser cannot see the first account's shopping data, then sign out and retry the old session. Check Worker logs for resource-limit failures without recording passwords or session tokens. No paid service or plan upgrade is authorized by this implementation audit.

## References

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Google OAuth web applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth account linking](https://better-auth.com/docs/concepts/users-accounts)
