# Kora customer accounts on Cloudflare

Kora runs its authentication code in the existing Cloudflare Worker and stores customer accounts, sessions, verification records and rate limits in the existing D1 database. Better Auth is an open-source library bundled with the Worker; it is not a hosted authentication subscription. No Supabase or external email provider is used.

The catalogue stays public. Cloudflare Access protects preview administration only; it must not become a customer sign-in gate.

## Current setup

- Worker: `kora`, public origin `https://kora.eo-kingsford.workers.dev`.
- D1 binding: `DB`, database `kora-db`.
- Migration: `drizzle/0001_customer_auth.sql`, additive and safe to reapply. Applied and checked through the production D1 console on 24 September 2026: six tables and five indexes.
- `/sign-in` and `/sign-up` show only configured sign-in methods. `/api/auth/config` exposes booleans, never credentials.
- Google and public email sign-in remain unavailable until their operator configuration below is completed. No credentials are checked into Git.
- The Cloudflare dashboard currently reports Workers Free. No paid plan was purchased.

## Enable Google sign-in

1. Select a user-owned project in Google Cloud and configure the Google Auth Platform branding/audience for Kora. Use a real support contact and the Kora homepage/privacy page. Follow any domain verification required by Google.
2. Create an OAuth client of type **Web application**. Set the authorized redirect URI exactly to `https://kora.eo-kingsford.workers.dev/api/auth/callback/google`. The origin is `https://kora.eo-kingsford.workers.dev`.
3. Store the client ID as `GOOGLE_CLIENT_ID` and the client secret as `GOOGLE_CLIENT_SECRET` in the Kora Worker's **Settings → Variables and Secrets**, using encrypted secrets. The account owner should enter credentials directly in Cloudflare rather than chat.
4. Add `BETTER_AUTH_SECRET`, a cryptographically random secret of at least 32 characters. Generate and save it through a secure local password/secret workflow. Do not reuse a Google secret or check it into the repository.
5. The deployed base origin is fixed in code. If moving to an owned custom domain, set `BETTER_AUTH_URL` to that HTTPS origin, update `KORA_SITE_URL` for site metadata, and register the matching Google callback before release. Do not configure request-derived origins or wildcard redirects.
6. Publish the OAuth app for the intended audience, or add explicit test users while it is in Google's testing mode. Test consent and account creation, refresh, sign-out, and signing in on another browser.

The app requests only `openid`, `email`, and `profile`. Google supplies identity; Kora's application hosting and account database remain on Cloudflare. It does not request Gmail, Drive or Calendar access.

## Enable email magic links

Cloudflare's public Email Sending service requires **Workers Paid**. As checked on 24 September 2026, the Workers plan starts at US$5/month, includes 3,000 emails/month, and additional emails cost US$0.35 per 1,000. Confirm current pricing and account approval before upgrading. This is a Cloudflare charge, not a third-party provider charge.

1. The account owner approves/purchases Workers Paid if email sign-in is wanted.
2. Choose an owned domain already using Cloudflare DNS. A `workers.dev` site address cannot serve as the sender's email domain.
3. Under **Compute → Email Service → Email Sending**, onboard that domain. Review the proposed SPF, DKIM, DMARC and bounce records alongside existing mail configuration. Complete verification before sending.
4. Set `AUTH_EMAIL_FROM` to an address at the verified domain, such as `signin@your-domain.example`. Use the address alone; the application supplies the display name “Kora Ghana”.
5. Add the Cloudflare Email Service binding named `EMAIL` to the source Wrangler configuration and deploy:

   ```json
   "send_email": [{ "name": "EMAIL" }]
   ```

   Keep this binding absent while the account is on Free. The runtime does not emulate email delivery or report a link sent when delivery fails.
6. Send a test link to an explicitly approved address. Verify inbox delivery, expiry, one-time redemption, and the resulting signed-in account. Verify that sign-out revokes the session.

## Customer data and session behavior

Guest sessions last 30 days in a host-only, HttpOnly cookie. Verified account sessions last 7 days. The account owner is derived from the verified D1 session, never a caller-supplied header, profile email or request payload.

After sign-in, the frontend requests an atomic import of the current browser's guest session. A permanent D1 claim ensures a guest session cannot be imported into two accounts. Quantities merge up to 20 per exact product configuration; saved products merge; requests transfer; an existing account profile takes precedence. The guest cookie then expires. Signing out starts fresh guest browsing; it does not reveal the prior account's shopping data.

Magic links are hashed in D1, expire after 10 minutes, and can be redeemed once. Authentication responses and all personal APIs use `Cache-Control: no-store`; the PWA service worker never caches them. Authentication failures are explicit and do not silently write to a new guest owner when an existing account cookie cannot be verified because configuration is unavailable.

## Verification

Run `pnpm run verify:auth`, `pnpm run verify:store`, `pnpm run verify:metadata`, `pnpm run verify:pwa`, and `pnpm exec tsc --noEmit --incremental false` before building. Authentication tests run the installed Better Auth and Drizzle/D1 implementation against SQLite. They do not create external accounts or send external email.

Local development can use a local-only `.dev.vars` with `BETTER_AUTH_URL=http://127.0.0.1:8787` and `KORA_AUTH_ALLOW_LOCAL=true`; never set the local override in production. Both `.env*` and `.dev.vars*` are ignored by Git.

## References

- [Cloudflare Email Sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Google OAuth web applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth magic links](https://better-auth.com/docs/plugins/magic-link)
