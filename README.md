# KORA Ghana

A Ghana-focused electronics and lifestyle catalogue with product comparison, saved items, persistent baskets, quotation requests and service enquiries.

This repository contains the source recovered from KORA's ChatGPT Site, including its original five-commit history. The GitHub import does not move the hosted database or provision a new website.

## Current functionality

- 2,362 catalogue products across 29 departments and 224 categories.
- Search, filters, product details, comparison, collections and a product finder.
- Product galleries, with multiple photographs for 563 products.
- Persistent browser-session baskets, saved products, profiles and requests.
- Ghana retailer price references where available; other products require quotations.
- Service, business, trade-in, return and contact enquiry forms.

Payments, merchant inventory, shipping, appointment confirmation and customer notification delivery are not connected. Checkout submits a quotation request and collects no money. Catalogue figures describe the imported snapshot dated 24 September 2026.

## Technology

React 19, TypeScript, Tailwind CSS and Next.js-compatible routes, built with **Vinext and Vite for Cloudflare Workers**. Data uses **Cloudflare D1**, with a Drizzle schema and SQL migration.

This is not currently a standard `next build` deployment. See [hosting guidance](docs/HOSTING.md) before importing it into Vercel or another host.

## Local development

Use Node.js `>=22.13.0` and the pinned `pnpm@11.25.0`. Preserve `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_redundant_wolfsbane.sql
pnpm dev
```

Apply the schema migration only to a fresh local database. `pnpm dev` normally serves on `http://localhost:5173`. `pnpm start` previews the built Worker locally; it does not deploy. The legacy `install:ci` script requires the managed Linux Sites environment; use the direct pnpm installation command above for a normal checkout.

`wrangler.json` identifies the independent Cloudflare Worker and D1 database. Local development still uses local D1 emulation; it does not write to the remote database. The original framework and Sites runtime notes are preserved in [SITES-STARTER.md](docs/SITES-STARTER.md).

## Checks

After installing dependencies:

```sh
pnpm exec tsc --noEmit
pnpm lint
node scripts/verify-store.mjs
node scripts/verify-galleries.mjs
node scripts/verify-image-route.mjs
node scripts/verify-links.mjs
pnpm build
```

The store check exercises API logic against temporary in-memory SQLite, including isolation between guest sessions and rejection of forged identity headers. Gallery checks validate recorded evidence and API behavior; they do not fetch every external image. See [deployment status and checks](docs/HOSTING.md) for the latest migration validation.

## Project layout

| Path | Contents |
| --- | --- |
| `app/store.tsx` | Main storefront, catalogue and account/request views |
| `app/api/` | Store, gallery and image endpoints |
| `app/product-gallery.tsx`, `app/storefront-hero.tsx` | Gallery and hero interactions |
| `data/` | Catalogue, sources, galleries and update evidence |
| `public/` | Local images, fonts and downloadable catalogues |
| `db/`, `drizzle/` | Database schema and migration |
| `scripts/` | Catalogue maintenance, verification and runtime helpers |
| `.openai/hosting.json` | Original Sites project and logical database binding |
| `wrangler.json` | Independent Cloudflare Worker, routing and D1 configuration |

## Data and deployment notes

The product catalogue is in `data/products.json`. The four D1 tables—`basket`, `saved`, `profiles` and `requests`—were empty when retrieved. Most product photography still points to external source URLs; it is not fully mirrored in this repository. Product descriptions, images and reference prices retain their provenance and are not proof of Ghana stock or reuse rights.

The independent deployment uses browser-specific guest sessions and ignores caller-supplied OpenAI identity headers. Customer sign-in, cross-device access and account recovery are not implemented. Production is public for customer testing at https://kora.eo-kingsford.workers.dev. Cloudflare Access protects previews only; preview builds and URLs are disabled. See [hosting guidance](docs/HOSTING.md).

`CATALOGUE-UPDATES.md` describes the existing ChatGPT research/update task. That schedule is external to GitHub and does not automatically follow this repository. Older snapshot statistics in `BUILD-NOTES.md`, `data/provenance.json` and `data/quality-summary.json` are historical; use current catalogue data for current counts.
