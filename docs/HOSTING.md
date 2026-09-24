# Hosting KORA

## Recommended: Cloudflare Workers and D1

KORA currently builds a Cloudflare Worker through Vinext and `@cloudflare/vite-plugin`. Its store API imports `cloudflare:workers` and uses D1 SQL directly. Keeping the frontend, API and database together on Cloudflare therefore requires the least architectural change.

GitHub stores the source. Cloudflare Workers Builds can deploy from the GitHub repository after the account, build configuration and database are configured. Cloudflare can serve both the frontend and API; a separate frontend host is not required.

References: [Vinext's native Cloudflare deployment](https://vinext.dev/docs/deploying/cloudflare), [Cloudflare Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

## Vercel option

Vercel is feasible, but the existing source is not a drop-in Vercel deployment. Current Vinext documentation describes a Nitro adapter for Vercel and other platforms. Adapting KORA would involve:

1. Replacing the Cloudflare-specific Vite deployment adapter with the supported Nitro/Vercel adapter and validating it against the project's pinned framework version.
2. Replacing the direct D1 binding with a database accessible to Vercel, or moving the API to a separately authenticated Cloudflare service.
3. Replacing Sites-specific identity with verified application sessions and configuring the desired access policy.
4. Testing API routes, cookies, galleries, deep links, database migrations and production builds on the new runtime.

Converting the entire frontend to standard Next.js is another option, but is not required solely to use Vercel. Splitting only the frontend onto Vercel while keeping the API elsewhere also introduces cross-origin/session configuration and a second deployment.

Reference: [Vinext deployment to other platforms](https://vinext.dev/docs/deploying/other-platforms). These docs describe current platform support, not a tested deployment of this repository's pinned beta.

## Requirements before independent hosting

- **Database:** Create a database in the target account, supply the real binding/configuration and apply `drizzle/0000_redundant_wolfsbane.sql`. The ID in `vite.config.ts` is only a local placeholder. The source does not grant access to the Sites-owned production database.
- **Identity:** `app/api/store/route.ts` currently trusts `oai-authenticated-user-id` supplied by Sites. A directly accessible deployment must not treat caller-supplied identity headers as authentication. Replace that assumption with verified sessions, or explicitly strip those headers and adopt guest-only behavior. The Sites sign-in/sign-out routes are platform-provided, not implemented app routes.
- **Access:** The original Site is owner-private. Repository visibility and hosting access are separate; configure the chosen website audience explicitly.
- **Build:** Install pinned dependencies, run TypeScript/lint and all verification scripts, then validate a production build. The current repository has no deployment workflow or configured external hosting account.
- **Catalogue updates:** Recreate or redirect the external ChatGPT catalogue task intentionally. Do not assume GitHub pushes migrate that schedule.
- **Commercial operation:** Payments, stock, fulfilment and notifications remain separate unimplemented integrations. A successful website deployment alone does not enable them.

No Vercel or independent Cloudflare deployment was created by the initial GitHub publication.
