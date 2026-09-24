# Catalogue, sharing and PWA launch review

Checked 24 September 2026 for a quotation-first launch. This audit does not authorise payment collection or certify rights to supplier photographs.

## Ready in the source tree

- Both branded social images are real 1200×630 PNGs. Public pages have distinct server-rendered titles, canonical URLs, Open Graph and Twitter metadata. Product shares use their exact catalogue cover; held or SVG imagery falls back to the branded share image.
- `/robots.txt` excludes API, administration and personal routes and points to `/sitemap.xml`. The sitemap contains 2,409 canonical public URLs: 16 public pages and 2,393 products, without invented modification dates. Private routes, filters and search queries are omitted. `/admin` and its descendants have noindex/nofollow metadata; a dedicated admin page must use that metadata explicitly.
- Every local product cover referenced by the catalogue exists. Gallery evidence, distinct source identities, image hashes, honest coverage totals and held-image API behavior pass the existing checks.
- The PWA manifest has valid icon files and launch scope. The service worker caches only eight fixed public offline assets. Account/API/HTML/RSC/application bundles stay network-only; no request is queued or replayed. An offline page returns 503. Applying an update reloads only the tab whose visitor explicitly chooses it, with a reminder to finish forms first.

## Remaining owner decisions and inputs

- Photography is incomplete: 212 products have at least five accepted visible images; 2,181 are below five, including 22 with imagery withheld. At least 8,051 additional distinct photographs are required for the entire catalogue. See `GALLERY-COMPLETION.md` and `public/catalogue-gallery-gaps.csv` for exact IDs, configurations and source links.
- Choose the launch product IDs and provide the image-rights approval and outstanding exact-variant photos described in `GALLERY-COMPLETION.md`. A smaller approved launch is possible, but checking a subset does not remove unapproved products from the site.
- Confirm the final public domain. `KORA_SITE_URL` must be set to its HTTPS origin at build time before moving from `https://kora.eo-kingsford.workers.dev`; rebuild and verify canonical, OG and sitemap URLs together. Authentication callback origins must also be coordinated.
- Verify anonymous access outside an owner session. Public HTTP checks from this audit environment returned 403 for the homepage, OG PNG, manifest, service worker and offline page. The web-fetch tool could not access them either. This may be an environment restriction; it does not prove that ordinary visitors are blocked. A successful owner session alone also cannot establish anonymous/social-bot access.

## Release verification

1. Run `node scripts/verify-metadata.mjs`, `node scripts/verify-pwa.mjs`, `node scripts/verify-galleries.mjs`, and `node scripts/verify-gallery-import.mjs`.
2. Run the five-image gate against the explicitly agreed scope. Full catalogue: `node scripts/verify-galleries.mjs --require-five`. Selected product IDs: add `--scope /path/to/approved-product-ids.json`. Rights approval remains a separate owner requirement.
3. After deployment, fetch the homepage, a product page, `/robots.txt`, `/sitemap.xml`, `/social/kora-og.png`, `/manifest.webmanifest`, `/sw.js`, and `/offline` anonymously. Confirm public responses without a sign-in challenge, the expected MIME types, and the production origin in metadata/sitemap. Test one shared URL in a social preview debugger; existing social caches may need refreshing.
4. In a production browser, check installation, an offline navigation, reconnecting, and an update with another tab holding an unsent form. Bump `CACHE_NAME` in `public/sw.js` whenever a cached offline asset changes. Do not cache account pages to make offline browsing appear complete.

Crawler rules are discovery instructions, not access control. Administration and personal APIs must remain independently authorised.
