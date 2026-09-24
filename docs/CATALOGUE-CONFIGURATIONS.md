# Ghana prices and exact product configurations

The catalogue records an exact product ID for each selectable configuration. `data/product-families.json` links those IDs into families without changing existing URLs, saved products, baskets or historical quotations. The current import adds 31 phone configurations: 2,393 catalogue records, 12 families, 55 selectable product IDs and 46 dated Ghana retail price references. The other 2,347 records still require a Ghana quotation.

Phone choices come from the exact variants exposed by the existing Telefonika product feeds. Current storage examples include iPhone 17 Pro 256GB, 512GB and 1TB; iPhone 17 Pro Max 256GB through 2TB; and Galaxy S26 Ultra 12GB RAM with 256GB or 512GB storage. Retailer prices differ by configuration. These are reference prices, not confirmed KORA selling offers or stock.

Four Galaxy S26 Ultra 1TB variants were not imported: the retailer option says 16GB RAM while the exact SKU says 12GB RAM. `data/variant-import-result.json` records this conflict. Do not guess which is correct or derive a configuration from an unrelated market listing.

## Configuration identity

- `lib/product-variants.ts` resolves only complete combinations explicitly listed in a family.
- `app/product-options.tsx` navigates to the exact product URL when the customer changes configuration. The resulting page, price, image and bag item therefore use the same SKU.
- Small families show configuration cards; larger ones use a labelled selector. A retailer-unavailable configuration is labelled as such and remains a quotation reference.
- Sparse option matrices stay sparse. For example, a 46mm watch with a medium/large band must not imply that the same source offers a 46mm watch with a small/medium band.
- Add the output of `getProductOptionSnapshot(productId)` to a server-created quotation snapshot. Never accept a client-supplied price as authoritative.

## Prices

`ghPrice` now returns only approved all-in selling prices from `data/selling-prices.json`. Retailer references are retained separately by `retailReferenceGhPrice`, which requires a positive GHS amount, source and a valid check date less than 14 days old. A retailer reference is never the customer-price fallback. `ghanaPesewas` produces integer minor units for arithmetic, and `money` preserves two decimal places. See [SELLING-PRICES.md](SELLING-PRICES.md) for the private exact-SKU cost, customs, FX and merchant tax inputs required before publishing a selling price with a 20% markup.

`scripts/refresh-prices.mjs` rechecks the exact retailer variant ID, title and SKU. It fetches each product feed once even when many variants share it. Large changes and identity changes require source review. The updater never adds unverified variants automatically.

## Import new source variants

Save each public retailer product JSON in an evidence directory and provide a `manifest.json`:

```json
{
  "fetchedAt": "2026-09-24T17:51:26.898Z",
  "sources": [{
    "productId": "gh-apple-iphone-17-256gb-black-1sim",
    "url": "https://telefonika.com/products/apple-iphone-17.js",
    "currency": "GHS",
    "currencyEvidence": {
      "url": "https://telefonika.com/products/apple-iphone-17-pro-1sim",
      "observed": "GH₵18,390.00"
    },
    "file": "gh-apple-iphone-17-256gb-black-1sim.json"
  }]
}
```

The currency must be verified on the retailer storefront; the product JSON does not itself declare a currency. Each source must match an existing verified Ghana retailer seed product. The importer validates exact identity, whole pesewas, allowed source host, complete options and source consistency.

```sh
node scripts/import-retailer-variants.mjs work/catalogue-source-refresh
# Inspect variant-import-preview.json, including quarantined records.
node scripts/import-retailer-variants.mjs work/catalogue-source-refresh --apply
node scripts/verify-variants.mjs
node scripts/export-catalogue.mjs
```

The default invocation only creates a local preview. Applying records the compact source facts and currency evidence in `data/variant-source-evidence.json`. Existing default IDs are preserved; other variants receive stable IDs derived from their retailer and variant ID. Repeated imports do not duplicate products.

Featured retailer images remain candidates until reviewed. Some feeds contain promotional price cards or photographs shared between different models. New configurations initially use the withheld-photo placeholder; only exact reviewed imagery should replace it or populate a gallery. Storage choices may share a reviewed photograph where the source confirms the same exterior model and colour. Crops, duplicated URLs and promotional graphics do not satisfy a five-photograph requirement.

## Verification

`node scripts/verify-variants.mjs` validates every family and renders the actual selection component. It checks exact SKU navigation, unavailable combinations, immutable quote option snapshots, GHS minor units and price expiry. Its synthetic importer fixtures also exercise source identity, currency, idempotency, unreviewed imagery and conflicting RAM/SKU quarantine.
