# Merchant pricing handoff

KORA can launch with quotation requests while final costs are reviewed. Fixed prices are a separate readiness step: a source retailer's price does not yet include KORA's actual acquisition route, all costs and approved selling-tax treatment. No merchant-approved fixed prices are currently loaded. Keep those items as **Price on request** and review actual costs before offering a customer a final quotation. Online payments come later.

## What the owner needs to supply

Choose the exact products/configurations you intend to source first. A small selected range is enough; the entire catalogue does not need cost records for a quotation-first launch.

| Needed per exact SKU | What to provide |
|---|---|
| Product and supplier | Exact model, storage/RAM/colour/bundle, condition, supplier, current stock and the actual checkout/invoice amount and currency |
| Original retail fees | Itemised fees, or evidence that they are included/waived; identify any source taxes already included |
| Acquisition route | Buying already in Ghana, or importing; a Ghana retailer reference does not prove KORA is buying locally |
| Imports only | Origin, exact HS code, freight and insurance allocated per unit, complete broker/customs assessment with all applicable charges, and the actual FX terms |
| Other costs | Per-unit clearance, payment, local transport and other allocations, including evidence when none applies |
| Selling-tax policy | Accountant/merchant-reviewed treatment of recoverable taxes and final selling taxes; no tariff or exemption is assumed |
| Approval | Approver, evidence reference, check time and expiry for all costs/policies |

Amounts in the input are **per product unit**, not shipment totals. Keep quantity/allocation worksheets with the private evidence and reconcile them to invoices. Fees, freight, insurance, customs charges or taxes already included in another input must not be counted twice. The current engine accepts verified cost amounts; it does not determine HS classifications, tax credits or tax liabilities.

The calculation is verified landed cost × **1.20** (20% markup), followed only by additional selling taxes explicitly required by the reviewed policy. Customers receive one final GHS price. If the intended target is 20% profit after recoverable/output taxes, the accountant must first confirm the cost and tax basis; markup and net margin are different measures.

## Prepare the selected range

Run the internal audit to obtain exact IDs, configurations, existing references and gap statuses:

```sh
node scripts/audit-selling-price-inputs.mjs
```

Reports are private: `work/pricing/catalogue-cost-input-audit.json` and `work/pricing/catalogue-cost-input-gaps.csv`. The JSON also lists every family and its unpriced configurations. A product outside a family is **not** proof that no other configuration exists; those sources still need review when adding choices.

Create a draft for a chosen SKU. Replace the example ID and select the actual route:

```sh
node scripts/create-selling-price-template.mjs \
  --product gh-apple-iphone-17-256gb-black-1sim \
  --sourcing ghana-local
```

Or create one record per explicitly verified option in a chosen family:

```sh
node scripts/create-selling-price-template.mjs \
  --family telefonika-apple-iphone-17-pro-1sim \
  --sourcing import
```

These are command examples, not a decision about the supplier or acquisition route. `--product` may be repeated for a selected set sharing the same route. `--family` includes only existing source-verified combinations; it does not invent a full storage/colour matrix.

The output is `work/pricing/merchant-costs.template.json`. Move it to a private working filename such as `work/pricing/merchant-costs.json` before generating another draft. Existing drafts are never overwritten. The generator fills only public SKU identity and exact options. Cost values are `null`, evidence is empty, and policy choices are unset, so an unfinished draft cannot publish a price.

## Fill, preview, approve

See [SELLING-PRICES.md](SELLING-PRICES.md) for field meanings. Each `amountMinor` uses currency minor units: 100 GHS is 10000 pesewas; JPY uses whole yen. Set only verified zeros. Fill each evidence object with `reference`, ISO `checkedAt` and `validUntil` timestamps. Add charges as `{ "id": "unique-charge-id", "label": "Actual charge", "amount": { "amountMinor": null, "currency": "GHS", "evidence": { "reference": "", "checkedAt": "", "validUntil": "" } } }`, replacing all incomplete values.

For imports, add an FX record for every non-GHS currency: `{ "currency": "USD", "ghsPerCurrencyUnit": { "numerator": null, "denominator": null }, "evidence": { "reference": "", "checkedAt": "", "validUntil": "" } }`. This represents GHS major units per one source-currency major unit; obtain both integers from verified FX terms. No example exchange rate is supplied.

Choose the reviewed `sellingTax.treatment`: `included-in-marked-up-price`, `no-additional-tax-due`, or `additional-on-marked-up-cost`. The last requires explicit `rates` entries with `id`, `label`, `numerator` and `denominator`; rates apply independently to the marked-up base. Do not copy an assumed tax percentage from a product category.

```sh
node scripts/import-selling-prices.mjs work/pricing/merchant-costs.json
# Review the final prices and private costs in work/pricing/last-import-preview.json.
node scripts/import-selling-prices.mjs work/pricing/merchant-costs.json --apply
node scripts/verify-selling-prices.mjs
node scripts/verify-pricing-workflow.mjs
node scripts/verify-variants.mjs
```

One invalid submitted record prevents the whole submitted batch from publishing. A price is approved per exact SKU; approving one storage size does not approve its siblings. Existing prices for other SKUs remain intact. After import, check only the IDs intended for fixed-price publication:

```sh
node scripts/audit-selling-price-inputs.mjs --require-priced \
  gh-apple-iphone-17-256gb-black-1sim
```

This optional gate exits unsuccessfully for missing, expired, invalid or identity-mismatched selected prices. The plain audit remains a report and does not block a quotation-first deployment. Pricing readiness does not certify supplier stock, product compatibility, image permissions or fulfilment readiness.

## Internal snapshot — 24 September 2026

- 2,393 catalogue records; 0 approved fixed prices.
- Reference currencies: 2,330 CAD, 46 GHS, 13 USD, 1 JPY and 3 without an amount/currency.
- 12 verified option families containing 55 exact selectable IDs; 0 currently have an approved fixed price. The remaining 2,338 records have no explicit family mapping; this is not a claim that they have no options.
- Four Galaxy S26 Ultra 1TB source variants remain quarantined because the option says 16GB RAM and the supplier SKU says 12GB. Require supplier clarification before adding them.

These are internal operating counts, not storefront copy. Refresh the audit whenever evidence or catalogue identity changes. Existing foreign/local reference prices are research context, never merchant-approved acquisition costs or automatic customer offers.
