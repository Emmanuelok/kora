# Approved GHS selling prices

Customer pages, bags and new quotation snapshots use `ghPrice`, which reads only approved selling-price records. A Ghana retailer reference, Canadian listing or manufacturer launch price is not a substitute. `data/selling-prices.json` is initially empty because the current catalogue has no complete merchant-approved cost records.

The input audit identifies 2,393 products: 2,330 CAD references, 46 GHS retailer references, 13 USD manufacturer references, one JPY reference and three without an amount/currency. None contains the complete supplier checkout, shipment, customs and merchant tax-policy evidence needed for a final all-in price.

## Calculation

`lib/landed-pricing.mjs` is a private import-time calculator. It totals verified retail cost, original retailer fees, applicable shipment costs, the exact Ghana customs assessment and other allocated costs. It then applies **landed cost × 1.20**, a 20% markup. A 20% markup is not a 20% profit margin. Any additional output taxes are applied only under an explicit reviewed merchant policy.

The engine does not contain a default exchange rate, shipping amount, tariff, duty rate or tax exemption. It does not infer the customer's import tax from a department or from a general VAT percentage. Customs assessment charges must come from the exact HS/origin/shipment assessment. The declared customs value is reference information; it is not added a second time to the retail/freight/insurance costs.

Ghana local acquisition is a separate input mode. It accepts GHS costs and cannot contain a shipment/customs section or FX conversion. Buying from a Ghana retailer does not automatically create another import tax. Whether that retailer is the actual supplier remains a merchant decision.

All amounts are integer minor units: pesewas for GHS, cents for CAD/USD/EUR and pence for GBP; JPY uses whole yen. FX is an explicit rational number of GHS major units per source-currency major unit. Arithmetic uses integers and half-up rounding. Each cost component is converted once, and the final price is rounded to a pesewa after markup and any explicitly reviewed output taxes.

## Private input requirements

An input record must match the exact catalogue ID, current product name and complete option combination. Each published price also binds the current public name, brand, model, condition, supplier URL, supplier SKU/variant ID and option pairs in a canonical identity. Customer price lookup recomputes that identity: a correction under the same product URL invalidates the old price until its costs are reviewed and reimported. Option key ordering does not change identity. Each money amount and policy has evidence containing a reference, check timestamp and expiry timestamp. Evidence must be current. The final price expires at the earliest input expiry.

| Field | Required information |
|---|---|
| `schemaVersion` | `1` |
| `productId`, `catalogueName`, `configuration` | Exact current SKU identity and all selected options; use `{}` for an item with no family |
| `catalogueIdentity` | Canonical public identity from the current SKU audit; retained with the cost approval so old inputs cannot bless a corrected same-ID product |
| `sourcing` | `import` or `ghana-local`, based on the actual acquisition route |
| `approval` | Merchant approver and dated, expiring approval evidence |
| `retailPrice` | Actual exact-SKU retail/checkout amount, currency and evidence |
| `originalRetailFees` | Explicit `itemized`, `included-in-retail-price` or `none` treatment, charges and completeness evidence |
| `fxRates` | Verified current rational FX for every non-GHS cost currency; empty for Ghana local purchase |
| `shipment` | Imported goods only: origin, HS code, freight, insurance and the complete exact Ghana customs assessment |
| `additionalCosts` | Allocated clearance, payment, local transport or other applicable costs, plus completeness evidence |
| `sellingTax` | Explicit reviewed output-tax treatment; never omitted or guessed |

Evidence references can be private supplier invoices, freight quotations, customs assessments and merchant accounting decisions. Keep these records under ignored `work/pricing/` or another private location. Do not place them in `public/`, `data/` or Git.

Fees already included in a retail price cannot be added again. Zero freight, insurance, fees or tax requires explicit evidence; missing data does not become zero. The customs assessment must assert all applicable duties, taxes and levies are covered. Output-tax treatment is one of:

- `included-in-marked-up-price`: the merchant has confirmed the displayed marked-up price already covers the applicable selling-tax treatment.
- `no-additional-tax-due`: the merchant has supplied evidence that no further output tax is due.
- `additional-on-marked-up-cost`: explicit reviewed tax rates apply independently to the same marked-up base. This is not an automatic Ghana tax configuration.

The schema in `lib/landed-pricing.mjs` is authoritative. It rejects missing costs/policies, unsupported currencies, duplicate components, unknown fields and expired or future evidence.

## Review and import

```sh
node scripts/audit-selling-price-inputs.mjs
node scripts/import-selling-prices.mjs work/pricing/merchant-costs.json
```

The audit writes a private SKU gap list and summary under `work/pricing/`. The importer validates every submitted record and writes `work/pricing/last-import-preview.json`, including the private cost audit. It makes no public price change in preview mode. After reviewing the concrete prices and supporting merchant inputs:

```sh
node scripts/import-selling-prices.mjs work/pricing/merchant-costs.json --apply
node scripts/verify-selling-prices.mjs
node scripts/verify-variants.mjs
node scripts/verify-store.mjs
```

Applying publishes only SKU ID, canonical public SKU identity, final amount in pesewas, currency, opaque revision, policy version, verification timestamp and expiry in `data/selling-prices.json`. The identity contains existing public product facts, with no costs or merchant evidence. Costs, fee components, tax lines, FX, markup amounts, approver details and evidence references stay private. Existing approved prices for other SKUs are preserved. If any submitted record fails validation, none of the submitted records is published.

`retailReferenceGhPrice` retains dated Ghana reference lookup for internal reference work. `scripts/refresh-prices.mjs` updates reference evidence only; it cannot overwrite an approved selling price or automatically turn a retailer listing into one.

## Verified boundaries

`scripts/verify-selling-prices.mjs` uses explicitly synthetic fixtures to test original-fee inclusion, import/local separation, missing FX and cost rejection, JPY precision, pesewa rounding, the 20% markup formula, explicit output taxes, earliest expiry, exact-SKU matching and private/public separation. Same-ID name, model, condition, supplier and storage changes must invalidate an approved price. Its fixture numbers are not real tariff, FX or supplier defaults. Store regression tests use in-memory approved-price fixtures; the production approved-price file remains empty until real inputs are supplied.
