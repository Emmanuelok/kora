# Hosting KORA on Cloudflare

KORA serves its frontend and API together on Cloudflare Workers, with Cloudflare D1 for shopping sessions and requests. GitHub is the source repository: https://github.com/Emmanuelok/kora. A separate Vercel frontend is unnecessary for this architecture.

## Resources and current status

- Account: `e24b9546211a6f1a310bf8ac9c411114`.
- Worker name configured in source: `kora`.
- D1 database created: `kora-db` (`983dc2a9-1cb3-4af0-b656-b1c6db1d7aab`), binding `DB`.
- Initial schema applied through the D1 console on 24 September 2026. Confirmed tables: `basket`, `profiles`, `requests`, `saved`; confirmed index: `requests_owner_created`.
- No original customer data was transferred: all four source tables were empty at retrieval.
- GitHub is connected to the Worker. Production builds use `main`, the `kora-builds` deployment token, and the settings below. Preview builds are disabled.
- Production is public at https://kora.eo-kingsford.workers.dev for the owner's requested customer test drive. On 24 September 2026, Cloudflare Access was changed to **Previews only**, retaining the **Cloudflare account members** policy and 24-hour sessions for previews. Its Access application ID is `0276be08-5cc2-4964-ae2a-7e5c9392ec8e`.
- `workers_dev: true` enables the public production URL. `preview_urls: false` and `routes: []` keep preview URLs and custom routes disabled.

The account and database IDs are resource identifiers, not credentials. Do not commit API tokens or session secrets.

## Git-connected build settings

In Cloudflare **Workers & Pages → Create application → Connect GitHub**, authorize only the `Emmanuelok/kora` repository when the GitHub integration allows repository selection. Select that repository and use:

| Setting | Value |
| --- | --- |
| Worker/project name | `kora` |
| Production branch | `main` |
| Root directory | repository root |
| Build command | `pnpm build` |
| Deploy command | `pnpm run deploy` |
| Build variable `NODE_VERSION` | `24.19.0` |
| Build variable `PNPM_VERSION` | `11.25.0` |

Dependencies are pinned in `pnpm-lock.yaml`; install with `pnpm install --frozen-lockfile`. No application secrets are currently required. Runtime database configuration comes from `wrangler.json`, not from build variables.

The Vite plugin reads the source Wrangler configuration and produces `dist/server/wrangler.json`. Deploy that compiled configuration, which contains the bundled Worker and asset directory. Do not deploy the source entry directly.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm run deploy
```

CLI deployment additionally requires an authorized Cloudflare login/token. The dashboard Git integration can manage build credentials without storing a token in this repository.

## Access and sessions

The owner approved anyone with the production URL to test the site without signing in. The Worker-level Access application now protects **Previews only** and is configured separately from Wrangler. The dashboard confirms “Production stays public”; cookie-free requests to the homepage, search, product, tracking and guest API routes returned HTTP 200 without an authentication redirect. No custom domain has been selected.

The independent API ignores `oai-authenticated-user-id` and `oai-authenticated-user-email`. Cart, saved items, profile and requests belong to a random guest cookie for this browser. It is HttpOnly, SameSite=Lax, Secure on HTTPS, and expires after 30 days. Clearing cookies, changing browsers or cookie expiry loses access to the earlier session. Customer sign-in and account recovery are not implemented. Cloudflare Access can protect the entire preview but is not customer account functionality.

## Database maintenance

The initial SQL was executed manually on the new remote database. Do not rerun `drizzle/0000_redundant_wolfsbane.sql` on it: its tables already exist. Wrangler's migration ledger has not been initialized for that manual migration. Establish a migration baseline before adopting `wrangler d1 migrations apply` for future migrations.

For a fresh local database only:

```sh
pnpm exec wrangler d1 execute DB --local --config wrangler.json --persist-to .wrangler/state --file drizzle/0000_redundant_wolfsbane.sql
pnpm start
```

Local execution does not use the remote D1 data. Remote changes require `--remote` and an authorized account.

## Validation and limitations

Validation on 24 September 2026 passed: pinned pnpm 11.25.0 frozen-lockfile install, TypeScript, all four verification scripts, production build, and Wrangler deployment dry run (1,409.34 KiB compressed Worker with 67 static asset files). The built Worker also passed local runtime checks for five rendered routes, gallery API, actual D1 cart persistence, separate browser sessions, forged identity headers and cross-origin mutation rejection. The store tests additionally cover all four tables, malformed cookies and protected legacy account rows. Lint reports 33 existing errors and 129 warnings in the imported application; baseline comparisons found no new lint errors and no suppression was added.

The live customer journey passed search, product details, gallery navigation, wishlist persistence, bag quantity persistence, required-field validation, quotation submission, and same-browser request tracking after reload. Synthetic request `KR-C1924125` is clearly labelled “KORA TEST — ignore” and “Do not fulfil or contact”; it contains two Sony WH-1000XM6 units and remains as test evidence. A separate cookie-free guest session returned no saved items, cart, profile name or requests. Testing found an incorrect service label on quotation history; quotation rendering now explicitly uses “Product quotation”, and quote forms omit the unrelated service field. A regression covers legacy quotation records and real service requests.

Payments, stock, shipping, appointment confirmation and customer notifications remain unconnected. Catalogue research automation was external to the original Site and has not been connected to this repository; the updates page now states that updates are manual. Product photographs still largely use external source URLs.

## Sharing previews and installable app

Public routes have server-rendered Open Graph and Twitter metadata. The homepage uses `public/social/kora-og.png` (1200×630); `/install` uses `kora-install.png`. Product pages use their catalogue image with a branded fallback for unavailable images. Personal routes and filtered searches are excluded from indexing. `KORA_SITE_URL`, when provided at build time, must be an HTTPS origin; otherwise canonical URLs use the production Workers address. Update it when adopting a custom domain.

The `/install` page offers the native installation prompt when the browser provides one and instructions for other browsers. The manifest includes standard and maskable icons, a standalone launch experience, and catalogue, saved-item and request shortcuts. Installing may create a separate browser session on some platforms; guest data does not sync across devices. These pages use native anchors to avoid a verified Vinext `next/link` runtime failure; the corresponding Next-only lint exception is documented in each affected component.

The service worker caches only eight fixed public assets for the branded offline page. Live pages, APIs, account data, quotation forms, RSC responses and application bundles remain network-only. An offline navigation returns an explicit 503 page; requests are never queued or replayed. Updates wait for visitors to close existing tabs or choose **Update & reload**. Bump `CACHE_NAME` in `public/sw.js` whenever its cached assets change. Keep `/sw.js` at the origin root; no additional Cloudflare services or database migration are required.

Recreate all branded social cards, favicons and app icons from local fonts and photos with `pnpm assets:brand`. Verify metadata and cache boundaries with `pnpm verify:metadata` and `pnpm verify:pwa`. The artwork generator is a development script; its image-rendering code is not bundled into the Worker.

## Platform references

- [Vinext on Cloudflare](https://vinext.dev/docs/deploying/cloudflare)
- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare build image and version overrides](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/get-started/)
- [Worker routing and Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

Vercel remains possible through an adapter/database migration, but it would require changing the current direct `cloudflare:workers`/D1 integration. It offers no deployment simplification for the current source.
